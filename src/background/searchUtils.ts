import localforage from 'localforage';
import MiniSearch, { Options as BaseMiniSearchOptions } from 'minisearch'; // Renamed to BaseMiniSearchOptions

import { getChunksForParent } from './chunkIndex';
import { MessageTurn } from '../types/chatTypes';
import {
    GenericChunk,
    NoteChunk,
} from '../types/chunkTypes';
import { Note } from '../types/noteTypes';

import { isChunkIndexBuilt, rebuildChunkIndex } from './chunkIndex';
import { getConversation, MESSAGE_STORAGE_PREFIX } from './chatHistoryStorage';
import { getEmbedding } from './embeddingUtils';
import { getAllNotesFromSystem } from './noteStorage';

// Updated import to use getStoredAppSettings and AppSettings (which is Config)
// and getEffectiveBm25Params for clarity in sourcing BM25 values.
import {
 AppSettings,getStoredAppSettings, 
} from './storageUtil';
import { aggressiveProcessText } from './textProcessing';

const MINISEARCH_INDEX_KEY = 'minisearch_chunk_index_v1';
const CHUNK_CACHE_STORE_KEY = 'minisearch_chunk_cache_v1'; // Used for the inMemoryItemsStore

export interface HydratedChunkSearchResultItem {
  id: string; // chunk id or message id
  parentId: string; // note id or conversation id
  content: string;
  parentTitle?: string;
  originalType: 'note' | 'json' | 'text' | 'chat';
  score: number;

  // Note specific
  headingPath?: string[];
  metadata?: NoteChunk['metadata'];
  originalDescription?: string; // For notes, this is the description field
  originalUrl?: string;
  originalTags?: string[];

  // Message specific
  role?: 'user' | 'assistant' | 'tool';
  timestamp?: number;
}

interface HydratedChunkSearchResultItemWithEmbedding extends HydratedChunkSearchResultItem {
  embedding: number[];
}

// Default BM25 settings from MiniSearch documentation
const DEFAULT_BM25_K = 1.2; // Term frequency saturation point
const DEFAULT_BM25_B = 0.75; // Length normalization impact
const DEFAULT_BM25_D = 0.5;  // BM25+ frequency normalization lower bound

// Extend MiniSearchOptions to include BM25 parameters for stricter typing if needed
interface MiniSearchOptionsWithBM25<T = GenericChunk> extends BaseMiniSearchOptions<T> {
  k?: number;
  b?: number;
  d?: number;
}

type IndexableItem = (Note | (MessageTurn & { title?: string })) & { bm25Content?: string };

class SearchService {
  private engine!: MiniSearch<IndexableItem>;
  private inMemoryItemsStore: Map<string, IndexableItem> = new Map();

  private saveIndexDebounceTimer: NodeJS.Timeout | null = null;
  private readonly SAVE_INDEX_DEBOUNCE_MS = 2500;
  private readonly CACHE_SAVE_DEBOUNCE_MS = 3000;

  public readonly initializationPromise: Promise<void>;
  private _debouncedSaveInMemoryStoreCache: () => void;
  private currentMiniSearchOptions!: MiniSearchOptionsWithBM25<IndexableItem>; // Use the extended type

  constructor() {
    this._debouncedSaveInMemoryStoreCache = this._debounce(this._saveInMemoryStoreCache.bind(this), this.CACHE_SAVE_DEBOUNCE_MS);
    this.initializationPromise = this._initializeAndCreateEngine();

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'APP_SETTINGS_UPDATED') {
        console.log('[SearchService] Received app settings update. Re-initializing engine.');
        this.reInitializeEngine().then(() => {
            console.log('[SearchService] Engine re-initialized with new settings.');
        }).catch(error => {
            console.error('[SearchService] Error re-initializing engine after settings update:', error);
        });

        // No need to return true if we're not calling sendResponse
      }
    });
  }

  private async _createEngine(passedSettings?: AppSettings | null): Promise<void> {
    // Fetch settings if not passed, or use what's passed.
    // getStoredAppSettings can return null, so handle that.
    const appSettings = passedSettings === undefined ? await getStoredAppSettings() : passedSettings;

    // Use getEffectiveBm25Params to get k, b, d with defaults.
    // This requires appSettings to be passed to it, or it will fetch them again.
    // To avoid double fetching if appSettings is already available, we can modify getEffectiveBm25Params
    // or just use the values from appSettings here directly with local defaults.
    // For now, let's rely on the structure of AppSettings (Config) and apply defaults here.
    
    const bm25UserK = appSettings?.ragConfig?.k; // Changed from k1 to k
    const bm25UserB = appSettings?.ragConfig?.b;
    const bm25UserD = appSettings?.ragConfig?.d;

    this.currentMiniSearchOptions = {
      idField: 'id',

      // Fields to search: the aggressively processed `bm25Content` and the original `title`.
      fields: ['bm25Content', 'title'],
      storeFields: [
        'id', 'title', 'content', 'description', 'createdAt', 'lastUpdatedAt', 'tags', 'url', // Note fields
        'conversationId', 'parentMessageId', 'role', 'status', 'timestamp', // MessageTurn fields
      ],

      // Since `bm25Content` is pre-processed and space-delimited, the tokenizer can be simple.
      tokenize: (text, fieldName) => text.split('/\s+/'),

      // Term processing is also simplified as it's done during chunk creation.
      // We still lowercase search queries.
      processTerm: (term, fieldName) => term.toLowerCase(),
      
      // Apply BM25 parameters from settings or use defaults
      k: bm25UserK ?? DEFAULT_BM25_K,
      b: bm25UserB ?? DEFAULT_BM25_B,
      d: bm25UserD ?? DEFAULT_BM25_D,

      searchOptions: {
        // Boost title, and now search over bm25Content instead of content.
        boost: { title: 2, bm25Content: 1 },
        prefix: true,
        fuzzy: 0.2,
      },
    };
    this.engine = new MiniSearch<IndexableItem>(this.currentMiniSearchOptions);
    console.log(`[SearchService] MiniSearch engine created with BM25 params: k=${this.currentMiniSearchOptions.k}, b=${this.currentMiniSearchOptions.b}, d=${this.currentMiniSearchOptions.d}`);
  }

  public async reInitializeEngine(): Promise<void> {
    const appSettings = await getStoredAppSettings();
    console.log(`[SearchService] reInitializeEngine called. RAG config: ${JSON.stringify(appSettings?.ragConfig)}`);

    await this._createEngine(appSettings);
    
    if (this.inMemoryItemsStore.size > 0) {
        console.log('[SearchService] Re-populating new engine from inMemoryItemsStore...');
        this.engine.removeAll();
        this.engine.addAll(Array.from(this.inMemoryItemsStore.values()));
    }

    await this._saveIndex(); 
    console.log('[SearchService] Engine re-initialized and data repopulated.');
  }

  private _debounce<T extends (...args: any[]) => void>(func: T, wait: number): T {
    let timeout: NodeJS.Timeout | null = null;

    return ((...args: any[]) => {
      const later = () => {
        timeout = null;
        func(...args);
      };

      if (timeout) clearTimeout(timeout);

      timeout = setTimeout(later, wait);
    }) as T;
  }

  private async _saveIndex(): Promise<void> {
    if (this.saveIndexDebounceTimer) {
      clearTimeout(this.saveIndexDebounceTimer);
    }

    this.saveIndexDebounceTimer = setTimeout(async () => {
      try {
        if (!this.engine) {
            console.warn('[SearchService._saveIndex] Engine not initialized. Skipping save.');

            return;
        }

        const json = JSON.stringify(this.engine);

        await localforage.setItem(MINISEARCH_INDEX_KEY, json);
        console.log('[SearchService._saveIndex] MiniSearch index saved to localforage.');
      } catch (error) {
        console.error('[SearchService._saveIndex] Error saving MiniSearch index:', error);
      }

      this.saveIndexDebounceTimer = null;
    }, this.SAVE_INDEX_DEBOUNCE_MS);
   }

  private async _saveInMemoryStoreCache(): Promise<void> {
    try {
      const storableStore = Array.from(this.inMemoryItemsStore.entries());

      await localforage.setItem(CHUNK_CACHE_STORE_KEY, storableStore);
      console.log(`[SearchService._saveInMemoryStoreCache] Chunk cache saved. Size: ${storableStore.length}`);
    } catch (error) {
      console.error('[SearchService._saveInMemoryStoreCache] Error saving chunk cache:', error);
    }
   }

  private async _populateInMemoryStoreFromStorage(): Promise<boolean> {
    console.log('[SearchService._populateInMemoryStoreFromStorage] Populating in-memory document store from all sources...');
    this.inMemoryItemsStore.clear();
    let changed = false;

    const notes = await getAllNotesFromSystem();

    for (const note of notes) {
        const textToProcess = [note.title, note.content, note.description, note.tags?.join(' ')].filter(Boolean).join(' ');
        const processedTokens = aggressiveProcessText(textToProcess);
        const indexableNote: IndexableItem = { ...note, bm25Content: processedTokens.join(' ') };

        this.inMemoryItemsStore.set(note.id, indexableNote);
        changed = true;
    }

    const keys = await localforage.keys();
    const messageKeys = keys.filter(key => key.startsWith(MESSAGE_STORAGE_PREFIX));

    for (const key of messageKeys) {
        const message = await localforage.getItem<MessageTurn>(key);

        if(message){
            const conversation = await getConversation(message.conversationId);
            const textToProcess = [conversation?.title, message.content].filter(Boolean).join(' ');
            const processedTokens = aggressiveProcessText(textToProcess);
            const indexableMessage: IndexableItem = {
                ...message,
                title: conversation?.title,
                bm25Content: processedTokens.join(' ')
            };

            this.inMemoryItemsStore.set(message.id, indexableMessage);
            changed = true;
        }
    }

    if (changed) {
        console.log(`[SearchService._populateInMemoryStoreFromStorage] In-memory store populated. Total documents: ${this.inMemoryItemsStore.size}`);
        await this._saveInMemoryStoreCache();
    } else {
        console.log('[SearchService._populateInMemoryStoreFromStorage] In-memory store was already up-to-date or empty.');
    }

    return changed;
  }

  private async _initializeAndCreateEngine(): Promise<void> {
    try {
      console.log('[SearchService._initializeAndCreateEngine] Initializing SearchService...');
      const appSettings = await getStoredAppSettings();

      await this._createEngine(appSettings);

      const cachedStoreArray = await localforage.getItem<Array<[string, IndexableItem]>>(CHUNK_CACHE_STORE_KEY);

      if (cachedStoreArray && Array.isArray(cachedStoreArray)) {
          this.inMemoryItemsStore = new Map(cachedStoreArray);
          console.log(`[SearchService._initializeAndCreateEngine] Loaded document cache. Size: ${this.inMemoryItemsStore.size}`);
      }
      
      if (this.inMemoryItemsStore.size === 0) {
          console.log('[SearchService._initializeAndCreateEngine] Document cache empty or not found. Populating from source.');
          await this._populateInMemoryStoreFromStorage();
      }

      const persistedIndexJson = await localforage.getItem<string>(MINISEARCH_INDEX_KEY);

      if (persistedIndexJson) {
        console.log('[SearchService._initializeAndCreateEngine] Found persisted MiniSearch index. Loading...');
        this.engine = MiniSearch.loadJSON<IndexableItem>(persistedIndexJson, this.currentMiniSearchOptions);
        console.log(`[SearchService._initializeAndCreateEngine] MiniSearch index loaded with ${this.engine.documentCount} documents.`);

        if (this.engine.documentCount !== this.inMemoryItemsStore.size) {
            console.warn(`[SearchService._initializeAndCreateEngine] Mismatch count. Index: ${this.engine.documentCount}, Store: ${this.inMemoryItemsStore.size}. Rebuilding index from store.`);
            this.engine.removeAll();

            if (this.inMemoryItemsStore.size > 0) {
                 this.engine.addAll(Array.from(this.inMemoryItemsStore.values()));
            }

            await this._saveIndex();
        }

      } else if (this.inMemoryItemsStore.size > 0) {
        console.log('[SearchService._initializeAndCreateEngine] No persisted index, indexing from memory store...');
        this.engine.addAll(Array.from(this.inMemoryItemsStore.values()));
        await this._saveIndex();
      } else {
        console.log('[SearchService._initializeAndCreateEngine] No persisted index and no items in memory. Engine empty.');
      }

      console.log('[SearchService._initializeAndCreateEngine] Initialization complete.');

      // One-time migration for users without the chunk index.
      if (!(await isChunkIndexBuilt())) {
        console.log('[SearchService] Parent-to-chunk index not found. Triggering background rebuild.');
        rebuildChunkIndex(); // Rebuilds in the background, no need to await.
      }
    } catch (error) {
      console.error('[SearchService._initializeAndCreateEngine] Critical error:', error);

      try {
        await this.indexAllFullRebuild(true); 
      } catch (fallbackError) {
        console.error('[SearchService._initializeAndCreateEngine] Critical error during fallback re-index:', fallbackError);
      }
    }
  }
  
  public async indexAllFullRebuild(forceEngineRecreation = false): Promise<void> { 
    console.log('[SearchService.indexAllFullRebuild] Starting full rebuild.');

    if (forceEngineRecreation || !this.engine || !this.currentMiniSearchOptions) { 
        const appSettings = await getStoredAppSettings();

        await this._createEngine(appSettings); 
    }

    await this._populateInMemoryStoreFromStorage();
    
    this.engine.removeAll();

    if (this.inMemoryItemsStore.size > 0) {
      this.engine.addAll(Array.from(this.inMemoryItemsStore.values()));
    }

    await this._saveIndex();
    console.log('[SearchService.indexAllFullRebuild] Full rebuild complete.');
  }

  public async indexSingleNote(note: Note): Promise<void> {
    await this.initializationPromise;
    console.log(`[SearchService.indexSingleNote] Indexing note ${note.id}`);

    const textToProcess = [note.title, note.content, note.description, note.tags?.join(' ')].filter(Boolean).join(' ');
    const processedTokens = aggressiveProcessText(textToProcess);
    const indexableNote: IndexableItem = { ...note, bm25Content: processedTokens.join(' ') };

    try {
      this.engine.discard(note.id);
    } catch (e) {
      // Ignore if the document was not in the index
    }

    this.engine.add(indexableNote);

    this.inMemoryItemsStore.set(note.id, indexableNote);

    this._debouncedSaveInMemoryStoreCache();
    await this._saveIndex();
    console.log(`[SearchService.indexSingleNote] Note ${note.id} processed. Engine docs: ${this.engine.documentCount}, Store size: ${this.inMemoryItemsStore.size}`);
  }

  public async indexSingleMessage(message: MessageTurn): Promise<void> {
    await this.initializationPromise;
    console.log(`[SearchService.indexSingleMessage] Indexing message ${message.id}`);

    const conversation = await getConversation(message.conversationId);
    const textToProcess = [conversation?.title, message.content].filter(Boolean).join(' ');
    const processedTokens = aggressiveProcessText(textToProcess);
    const indexableMessage: IndexableItem = {
        ...message,
        title: conversation?.title,
        bm25Content: processedTokens.join(' ')
    };

    try {
      this.engine.discard(message.id);
    } catch (e) {
      // Ignore if the document was not in the index
    }

    this.engine.add(indexableMessage);

    this.inMemoryItemsStore.set(message.id, indexableMessage);

    this._debouncedSaveInMemoryStoreCache();
    await this._saveIndex();
    console.log(`[SearchService.indexSingleMessage] Message ${message.id} processed. Engine docs: ${this.engine.documentCount}, Store size: ${this.inMemoryItemsStore.size}`);
  }
  
  public async removeItemFromIndex(originalDocId: string): Promise<void> {
    await this.initializationPromise;
    console.log(`[SearchService.removeItemFromIndex] Removing document ${originalDocId}.`);

    try {
      this.engine.discard(originalDocId);
    } catch (e) {
      // Ignore if the document was not in the index
    }

    this.inMemoryItemsStore.delete(originalDocId);

    this._debouncedSaveInMemoryStoreCache();
    await this._saveIndex();
    console.log(`[SearchService.removeItemFromIndex] Removed document ${originalDocId}. Engine docs: ${this.engine.documentCount}, Store size: ${this.inMemoryItemsStore.size}`);
  }

  public async searchItems(query: string, topK = 20): Promise<HydratedChunkSearchResultItem[]> {
    console.time('searchItems');
    await this.initializationPromise;

    if (typeof query !== 'string' || query.trim() === '') return [];

    try {
        const appSettings = await getStoredAppSettings();
        const ragConfig = appSettings?.ragConfig;
        const bm25Weight = ragConfig?.bm25_weight ?? 0.5;
        const semanticTopK = ragConfig?.semantic_top_k ?? 20;
        const bm25TopK = ragConfig?.BM25_top_k ?? 10;
        const lambda = ragConfig?.lambda ?? 0.5;

        // --- Step 1: Perform parallel searches and get query embedding ---
        console.time('bm25Search');
        const processedQuery = aggressiveProcessText(query).join(' ');
        const queryEmbeddingPromise = getEmbedding(query.toLowerCase());
        
        // BM25 search for parent documents
        const bm25ParentResults = this.engine.search(processedQuery, {}).slice(0, bm25TopK);
        const parentBm25Scores = new Map(bm25ParentResults.map(r => [r.id, r.score]));
        console.timeEnd('bm25Search');

        // Semantic search for chunks (while BM25 is running)
        console.time('semanticSearch');
        const queryEmbedding = await queryEmbeddingPromise;
        if (!queryEmbedding) {
            console.warn('[SearchService.searchItems] Could not generate query embedding. Proceeding with BM25 only.');
        }

        let semanticChunkResults: { chunkId: string, parentId: string, score: number }[] = [];
        if (queryEmbedding) {
            const allChunkKeys = await localforage.keys().then(keys => keys.filter(key => key.startsWith('notechunk_') || key.startsWith('msgchunk_')));
            const promises = allChunkKeys.map(async (key) => {
                const chunk = await localforage.getItem<NoteChunk>(key);
                if (chunk) {
                    const chunkEmbedding = chunk.embedding || await getEmbedding(chunk.content);
                    const cosineSimilarity = this.calculateCosineSimilarity(queryEmbedding, chunkEmbedding);
                    return { chunkId: chunk.id, parentId: chunk.parentId, score: cosineSimilarity };
                }
                return null;
            });
            const results = await Promise.all(promises);
            semanticChunkResults = (results.filter(r => r !== null) as { chunkId: string, parentId: string, score: number }[])
                .sort((a, b) => b.score - a.score)
                .slice(0, semanticTopK);
        }
        console.timeEnd('semanticSearch');

        // --- Step 2: Combine candidate pools ---
        const candidateChunkIds = new Set<string>(semanticChunkResults.map(r => r.chunkId));
        const bm25ParentIds = new Set(bm25ParentResults.map(r => r.id));

        if (bm25ParentIds.size > 0) {
            for (const parentId of bm25ParentIds) {
                const chunkIds = await getChunksForParent(parentId);
                for (const chunkId of chunkIds) {
                    candidateChunkIds.add(chunkId);
                }
            }
        }

        // --- Step 3: Score and Rerank ---
        console.time('rerank');
        const bm25Scores = bm25ParentResults.map(r => r.score);
        const minBm25Score = bm25Scores.length > 0 ? Math.min(...bm25Scores) : 0;
        const maxBm25Score = bm25Scores.length > 0 ? Math.max(...bm25Scores) : 0;

        const scoringPromises = Array.from(candidateChunkIds).map(async (chunkId) => {
            const chunkData = await localforage.getItem<NoteChunk>(chunkId);
            if (chunkData) {
                const chunkEmbedding = chunkData.embedding || await getEmbedding(chunkData.content);
                if (!chunkEmbedding || !queryEmbedding) return null;

                // **THE FIX**: Calculate semantic score for every candidate, don't rely on a pre-filtered list.
                const semanticScore = this.calculateCosineSimilarity(queryEmbedding, chunkEmbedding);

                const parentBm25Score = parentBm25Scores.get(chunkData.parentId) ?? 0;

                const normalizedParentBm25Score = (maxBm25Score > minBm25Score)
                    ? (parentBm25Score - minBm25Score) / (maxBm25Score - minBm25Score)
                    : 0;

                const finalScore = (normalizedParentBm25Score * bm25Weight) + (semanticScore * (1 - bm25Weight));

                if (finalScore > 0) {
                    return {
                        id: chunkData.id,
                        parentId: chunkData.parentId,
                        content: chunkData.content,
                        parentTitle: chunkData.parentTitle,
                        originalType: chunkData.originalType,
                        score: finalScore,
                        originalDescription: chunkData.parentDescription,
                        headingPath: chunkData.headingPath,
                        metadata: chunkData.metadata,
                        originalUrl: chunkData.originalUrl,
                        originalTags: chunkData.originalTags,
                        embedding: chunkEmbedding,
                    };
                }
            }
            return null;
        });

        const combinedResults = (await Promise.all(scoringPromises))
            .filter(r => r !== null) as HydratedChunkSearchResultItemWithEmbedding[];

        if (lambda === 1) {
          combinedResults.sort((a, b) => b.score - a.score);
          console.timeEnd('rerank');
          console.timeEnd('searchItems');
          return combinedResults.slice(0, topK);
        }

        const rerankedResults = await this.rerankWithMMR(combinedResults, lambda, topK);
        console.timeEnd('rerank');
        console.timeEnd('searchItems');
        return rerankedResults;

    } catch (e: any) {
        console.error(`[SearchService.searchItems] Error during search: ${e.message}`, e);
        return [];
    }
  }

  private calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private async rerankWithMMR(
    candidates: HydratedChunkSearchResultItemWithEmbedding[],
    lambda: number,
    topK: number
  ): Promise<HydratedChunkSearchResultItem[]> {
      if (candidates.length === 0) return [];

      const selected: HydratedChunkSearchResultItemWithEmbedding[] = [];
      let remaining = [...candidates];

      // Normalize relevance scores (0 to 1) for stable MMR calculation
      const scores = remaining.map(c => c.score);
      const minScore = Math.min(...scores);
      const maxScore = Math.max(...scores);

      if (maxScore > minScore) {
        remaining.forEach(c => {
          c.score = (c.score - minScore) / (maxScore - minScore);
        });
      } else {
        remaining.forEach(c => { c.score = 0; });
      }

      // First, select the most relevant item
      remaining.sort((a, b) => b.score - a.score);
      const best = remaining.shift();
      if (best) {
          selected.push(best);
      }

      // Iteratively select the rest based on MMR
      while (selected.length < topK && remaining.length > 0) {
          let bestCandidate: HydratedChunkSearchResultItemWithEmbedding | null = null;
          let bestMmrScore = -Infinity;

          for (const candidate of remaining) {
              const relevance = candidate.score; // Already normalized
              let redundancy = 0;
              if (selected.length > 0) {
                  const similarities = selected.map(s => this.calculateCosineSimilarity(candidate.embedding, s.embedding));
                  redundancy = Math.max(...similarities);
              }

              const mmrScore = lambda * relevance - (1 - lambda) * redundancy;

              if (mmrScore > bestMmrScore) {
                  bestMmrScore = mmrScore;
                  bestCandidate = candidate;
              }
          }

          if (bestCandidate) {
              selected.push(bestCandidate);
              remaining = remaining.filter(r => r.id !== bestCandidate!.id);
          } else {
              break; // No more candidates to select
          }
      }

      // Return the selected items, removing the temporary embedding property
      return selected.map(({ embedding, ...rest }) => rest);
  }

  public formatResultsForLLM(results: HydratedChunkSearchResultItem[]): string {
    if (!results || results.length === 0) {
      return "No relevant text segments found to provide context.";
    }

    let promptOutput = "Use the following text segments from documents to answer. Cite by [Document Title - Segment X] or (id: parent_id chunk_id) where appropriate:\n\n";

    results.forEach((result, index) => {
      const title = result.parentTitle || 'Untitled Document';

      promptOutput += `### [${title} - Segment ${index + 1}] (id: ${result.parentId} ${result.id}, score: ${result.score.toFixed(2)})\n`;
      promptOutput += `Content:\n${result.content}\n\n`;
    });

    return promptOutput.trim();
  }
}

let searchServiceInstance: SearchService | null = null;
let searchServicePromise: Promise<SearchService> | null = null;

export const getSearchService = (): Promise<SearchService> => {
  if (searchServiceInstance) {
    return Promise.resolve(searchServiceInstance);
  }

  if (!searchServicePromise) {
    searchServicePromise = new Promise((resolve) => {
      const instance = new SearchService();
      instance.initializationPromise.then(() => {
        searchServiceInstance = instance;
        resolve(searchServiceInstance);
      });
    });
  }

  return searchServicePromise;
};

export { SearchService };
