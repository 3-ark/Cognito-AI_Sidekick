import winkBM25Factory from 'wink-bm25-text-search';
import TinySegmenter from 'tiny-segmenter';
import { stem } from 'porter2';
import { getAllNotesFromSystem, getNoteByIdFromSystem } from './noteStorage';
import { Note } from '../types/noteTypes';
import { ChatMessage, getAllChatMessages, getChatMessageById } from './chatHistoryStorage'; // Import chat types and functions
import storage from './storageUtil';

type BM25Engine = ReturnType<typeof winkBM25Factory>;

const BM25_UNCONSOLIDATED_INDEX_KEY = 'bm25_index_unconsolidated';
const BM25_CONSOLIDATED_INDEX_KEY = 'bm25_index_consolidated';
const DEFERRED_CONSOLIDATION_THRESHOLD = 5;

// Types for documents stored in BM25
export interface BM25TextDoc { // What the engine's addDoc expects
  title: string;
  content: string;
}

// Type for items in our in-memory store, used for rebuilding the index
export interface InMemorySearchableItem {
  id: string; // note_id or chat_id
  type: 'note' | 'chat';
  title: string;
  content: string; // For notes, it's note.content. For chats, it's concatenated turns.
}

// Type for raw search results from BM25 engine.search()
export type RawBM25SearchResult = [id: string, score: number];


// This existing interface is for hydrated search results, good for UI.
export interface HydratedSearchResultItem {
  id: string;
  type: 'note' | 'chat'; // Added type
  title: string;
  score: number;
  content?: string; // Full content after hydration
  // Potentially add other specific fields like `createdAt`, `turns` for chats, etc.
  note?: Note;
  chat?: ChatMessage;
}


class SearchService {
  private engine: BM25Engine;
  private tinySegmenter: TinySegmenter;
  private _engineConfiguredAndLoaded: boolean = false;
  // Unified in-memory store for both notes and chats
  private inMemoryItemsStore: Map<string, InMemorySearchableItem> = new Map();
  private unconsolidatedChangeCount: number = 0;
  private rebuildDebounceTimer: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_DELAY_MS = 1500; // 1.5 seconds

  public readonly initializationPromise: Promise<void>;

  constructor() {
    this.engine = winkBM25Factory();
    this.tinySegmenter = new TinySegmenter();
    this.initializationPromise = this._initialize();
  }

  private _configureEngine(): void {
    const multilingualTokenizerSync = (text: string): string[] => {
      let tokens: string[] = [];
      if (!text || text.trim().length === 0) return [];
      const firstChar = text.trim().charAt(0);
      const code = firstChar.charCodeAt(0);
      if ((code >= 0x3040 && code <= 0x30FF) || (code >= 0x31F0 && code <= 0x31FF)) { // Japanese
        tokens = this.tinySegmenter.segment(text);
      } else if (code >= 0xAC00 && code <= 0xD7A3) { // Korean
        tokens = text.split('').filter(char => char.charCodeAt(0) >= 0xAC00 && char.charCodeAt(0) <= 0xD7A3);
      } else if (code >= 0x0400 && code <= 0x04FF) { // Cyrillic
        tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
      } else if (code >= 0x0600 && code <= 0x06FF) { // Arabic
        tokens = text.split(/\s+/).filter(Boolean);
      } else if (code >= 0x0900 && code <= 0x097F) { // Devanagari
        tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
      } else { // Default
        tokens = text.toLowerCase().split(/\s+/).filter(Boolean).map(token => stem(token));
      }
      return tokens;
    };
    // Field weights can be adjusted if title relevance differs between notes and chats
    this.engine.defineConfig({ fldWeights: { title: 1, content: 2 } });
    this.engine.definePrepTasks([multilingualTokenizerSync]);
  }

  private async _saveIndex(consolidated: boolean): Promise<void> {
    console.log(`[SearchService._saveIndex] Attempting to save index. Consolidated: ${consolidated}`);
    try {
      const json = this.engine.exportJSON();
      const key = consolidated ? BM25_CONSOLIDATED_INDEX_KEY : BM25_UNCONSOLIDATED_INDEX_KEY;
      await storage.setItem(key, json);
      console.log(`[SearchService._saveIndex] Index saved to ${key}`);
    } catch (error) {
      console.error(`[SearchService._saveIndex] Error saving index (consolidated: ${consolidated}):`, error);
    }
  }

  private async _performConsolidation(): Promise<void> {
    console.log('[SearchService._performConsolidation] Starting consolidation process.');
    await this._loadUnconsolidatedIndexIntoEngine(); // Loads current unconsolidated state
    try {
      this.engine.consolidate();
      console.log('[SearchService._performConsolidation] Engine consolidated.');
      await this._saveIndex(true); // Save the consolidated state
      console.log('[SearchService._performConsolidation] Consolidated index saved.');
      this.unconsolidatedChangeCount = 0;
      console.log('[SearchService._performConsolidation] Change counter reset.');
    } catch (error) {
      console.error('[SearchService._performConsolidation] Error during consolidation:', error);
    }
  }

  private async _triggerDeferredConsolidation(): Promise<void> {
    if (this.unconsolidatedChangeCount >= DEFERRED_CONSOLIDATION_THRESHOLD) {
      console.log(`[SearchService._triggerDeferredConsolidation] Change threshold (${DEFERRED_CONSOLIDATION_THRESHOLD}) reached.`);
      await this._performConsolidation();
    } else {
      console.log(`[SearchService._triggerDeferredConsolidation] Change count ${this.unconsolidatedChangeCount}/${DEFERRED_CONSOLIDATION_THRESHOLD}. Deferring.`);
    }
  }

  private async _loadUnconsolidatedIndexIntoEngine(): Promise<void> {
    const unconsolidatedJson = await storage.getItem(BM25_UNCONSOLIDATED_INDEX_KEY);
    this.engine.reset(); // Reset before loading to ensure clean state
    this._configureEngine(); // Reapply config after reset
    if (unconsolidatedJson) {
      console.log('[SearchService._loadUnconsolidatedIndexIntoEngine] Loading unconsolidated index from storage.');
      this.engine.importJSON(unconsolidatedJson);
    } else {
      console.warn('[SearchService._loadUnconsolidatedIndexIntoEngine] No unconsolidated index found in storage. Engine is fresh.');
    }
  }
  
  private async _rebuildEngineFromMemoryStoreAndSaveUnconsolidated(): Promise<void> {
    // Clear any existing timer, as we're about to schedule a new rebuild.
    if (this.rebuildDebounceTimer) {
      clearTimeout(this.rebuildDebounceTimer);
      this.rebuildDebounceTimer = null;
    }

    console.log(`[SearchService] Scheduling debounced rebuild. Current store size: ${this.inMemoryItemsStore.size}`);

    this.rebuildDebounceTimer = setTimeout(async () => {
      this.engine.reset();
      this._configureEngine();
      console.log(`[SearchService._rebuildEngineFromMemoryStore] DEBOUNCED: Rebuilding engine from ${this.inMemoryItemsStore.size} in-memory items.`);
      for (const [docId, item] of this.inMemoryItemsStore) {
        this.engine.addDoc({ title: item.title, content: item.content }, docId);
      }
      await this._saveIndex(false); // Save as unconsolidated
      this.unconsolidatedChangeCount++;
      console.log(`[SearchService._rebuildEngineFromMemoryStore] DEBOUNCED: Unconsolidated index saved. Change count: ${this.unconsolidatedChangeCount}`);
      await this._triggerDeferredConsolidation();
      this.rebuildDebounceTimer = null; 
    }, this.DEBOUNCE_DELAY_MS);
  }

  // New method to fully rebuild both notes and chats into the inMemoryItemsStore
  private async _populateInMemoryStoreFromStorage(): Promise<void> {
    // Before populating, ensure any pending debounced rebuild is cancelled if we're doing a full refresh.
    if (this.rebuildDebounceTimer) {
      clearTimeout(this.rebuildDebounceTimer);
      this.rebuildDebounceTimer = null;
      console.log('[SearchService._populateInMemoryStoreFromStorage] Cancelled pending debounced rebuild due to full store population.');
    }
    this.inMemoryItemsStore.clear();
    const notes = await getAllNotesFromSystem();
    notes.forEach(note => {
      this.inMemoryItemsStore.set(String(note.id), {
        id: String(note.id),
        type: 'note',
        title: note.title || '',
        content: note.content || ''
      });
    });
    console.log(`[SearchService._populateInMemoryStore] Populated with ${notes.length} notes.`);

    const chats = await getAllChatMessages();
    chats.forEach(chat => {
      const chatContent = chat.turns.map(turn => turn.content).join('\n');
      this.inMemoryItemsStore.set(String(chat.id), {
        id: String(chat.id),
        type: 'chat',
        title: chat.title || `Chat from ${new Date(chat.last_updated).toLocaleDateString()}`,
        content: chatContent
      });
    });
    console.log(`[SearchService._populateInMemoryStore] Populated with ${chats.length} chats. Total items: ${this.inMemoryItemsStore.size}`);
  }
  
  // New method for a full re-index of everything from source of truth (storage)
  public async indexAllFullRebuild(): Promise<void> {
    console.log('[SearchService.indexAllFullRebuild] Starting to index all items (notes and chats).');
    await this._populateInMemoryStoreFromStorage(); // Populate in-memory store first
    // Now rebuild the engine from this fresh in-memory store
    this.engine.reset();
    this._configureEngine();
    for (const [docId, item] of this.inMemoryItemsStore) {
      this.engine.addDoc({ title: item.title, content: item.content }, docId);
    }
    console.log(`[SearchService.indexAllFullRebuild] Added ${this.inMemoryItemsStore.size} documents to engine.`);
    try {
      await this._saveIndex(false); // Save new index as unconsolidated first
      console.log('[SearchService.indexAllFullRebuild] Unconsolidated index saved.');
      await this._performConsolidation(); // Consolidate it immediately
    } catch (e: any) {
      console.error(`[SearchService.indexAllFullRebuild] Error during indexing/consolidation: ${e.message}`, e);
      throw e;
    }
  }


  private async _initialize(): Promise<void> {
    if (this._engineConfiguredAndLoaded) return;
    this._configureEngine();
    try {
      console.log('[SearchService._initialize] Attempting to load index from storage...');
      let loadedIndex = false;
      let consolidateAfterLoad = false;

      const consolidatedIndexJson = await storage.getItem(BM25_CONSOLIDATED_INDEX_KEY);
      if (consolidatedIndexJson) {
        console.log('[SearchService._initialize] Found consolidated index in storage.');
        this.engine.importJSON(consolidatedIndexJson);
        loadedIndex = true;
        this.unconsolidatedChangeCount = 0; // Reset as we loaded a good consolidated state
        console.log('[SearchService._initialize] Consolidated index loaded successfully.');
      } else {
        const unconsolidatedIndexJson = await storage.getItem(BM25_UNCONSOLIDATED_INDEX_KEY);
        if (unconsolidatedIndexJson) {
          console.log('[SearchService._initialize] Found unconsolidated index in storage.');
          this.engine.importJSON(unconsolidatedIndexJson);
          loadedIndex = true;
          consolidateAfterLoad = true; // Mark for consolidation after loading in-memory store
          console.log('[SearchService._initialize] Unconsolidated index loaded successfully.');
        }
      }

      if (loadedIndex) {
        console.log('[SearchService._initialize] Index loaded. Populating in-memory store from all sources.');
        await this._populateInMemoryStoreFromStorage(); // Populates inMemoryItemsStore with notes & chats

        if (consolidateAfterLoad) {
          console.log('[SearchService._initialize] Consolidating loaded unconsolidated index...');
          // Need to ensure the engine reflects the inMemoryItemsStore before consolidating
          // The current _performConsolidation loads from unconsolidatedJson, which might be stale
          // if inMemoryItemsStore has changed.
          // A safer approach here might be to rebuild from inMemoryItemsStore then consolidate.
          await this._rebuildEngineFromMemoryStoreAndSaveUnconsolidated(); // This saves unconsolidated, then triggers consolidation if needed.
        }
      } else {
        console.log('[SearchService._initialize] No index found in storage. Building new index for all items...');
        await this.indexAllFullRebuild(); // This method now handles both notes and chats
      }

      this._engineConfiguredAndLoaded = true;
      console.log('[SearchService._initialize] Engine initialization complete.');
    } catch (error) {
      console.error('[SearchService._initialize] Critical error during engine initialization:', error);
      try {
        console.warn('[SearchService._initialize] Attempting fallback: full re-index of all items.');
        this._configureEngine(); // Ensure engine is configured before fallback
        await this.indexAllFullRebuild();
        this._engineConfiguredAndLoaded = true;
        console.log('[SearchService._initialize] Fallback engine initialization complete.');
      } catch (fallbackError) {
        console.error('[SearchService._initialize] Critical error during fallback engine initialization:', fallbackError);
        throw fallbackError; // Or handle more gracefully, e.g., disable search
      }
    }
  }

  public async indexSingleNote(note: Note): Promise<void> {
    await this.initializationPromise;
    if (!note || !note.id) {
      console.error('[SearchService.indexSingleNote] Cannot index note without ID:', note);
      return;
    }
    const noteIdStr = String(note.id);
    console.log(`[SearchService.indexSingleNote] Indexing single note: ${noteIdStr}`);
    
    this.inMemoryItemsStore.set(noteIdStr, {
      id: noteIdStr,
      type: 'note',
      title: note.title || '',
      content: note.content || ''
    });
    console.log(`[SearchService.indexSingleNote] Note ${noteIdStr} added/updated in in-memory store. Store size: ${this.inMemoryItemsStore.size}`);
    
    // Load current unconsolidated index, add this doc, then save unconsolidated.
    // The _rebuildEngineFromMemoryStoreAndSaveUnconsolidated handles this now.
    await this._rebuildEngineFromMemoryStoreAndSaveUnconsolidated();
  }
  
  public async indexSingleChatMessage(chatMessage: ChatMessage): Promise<void> {
    await this.initializationPromise;
    if (!chatMessage || !chatMessage.id) {
      console.error('[SearchService.indexSingleChatMessage] Cannot index chat without ID:', chatMessage);
      return;
    }
    const chatIdStr = String(chatMessage.id);
    console.log(`[SearchService.indexSingleChatMessage] Indexing single chat: ${chatIdStr}`);
    
    const content = chatMessage.turns.map(turn => turn.content).join('\n');
    this.inMemoryItemsStore.set(chatIdStr, {
      id: chatIdStr,
      type: 'chat',
      title: chatMessage.title || `Chat from ${new Date(chatMessage.last_updated).toLocaleDateString()}`,
      content: content
    });
    console.log(`[SearchService.indexSingleChatMessage] Chat ${chatIdStr} added/updated in in-memory store. Store size: ${this.inMemoryItemsStore.size}`);
    
    await this._rebuildEngineFromMemoryStoreAndSaveUnconsolidated();
  }

  public async removeItemFromIndex(itemId: string): Promise<void> { // Renamed for generic use
    await this.initializationPromise;
    if (!itemId) {
      console.error('[SearchService.removeItemFromIndex] Cannot remove item without ID.');
      return;
    }
    console.log(`[SearchService.removeItemFromIndex] Removing item from index: ${itemId}`);
    
    if (this.inMemoryItemsStore.has(itemId)) {
      this.inMemoryItemsStore.delete(itemId);
      console.log(`[SearchService.removeItemFromIndex] Item ${itemId} removed from in-memory store. Store size: ${this.inMemoryItemsStore.size}`);
      await this._rebuildEngineFromMemoryStoreAndSaveUnconsolidated();
    } else {
      console.warn(`[SearchService.removeItemFromIndex] Item ${itemId} not found in in-memory store. No changes made to index.`);
    }
  }

  // Generic search method returning raw results (IDs and scores)
  public async searchItems(query: string, topK = 20): Promise<RawBM25SearchResult[]> {
    await this.initializationPromise;

    if (this.unconsolidatedChangeCount > 0) {
      console.log('[SearchService.searchItems] Consolidated index is stale. Performing consolidation before search.');
      await this._performConsolidation();
    }

    if (typeof query !== 'string' || query.trim() === '') {
      return [];
    }
    try {
      const rawResults = this.engine.search(query).map(
        ([id, score]): RawBM25SearchResult => [String(id), score]
      );
      return rawResults.slice(0, topK);
    } catch (e: any) {
      console.error(`[SearchService.searchItems] Error during engine.search("${query}"): ${e.message}`, e);
      return [];
    }
  }

  // Example of how a caller might hydrate results (this logic would typically be in the background message handler)
  // This is more of a conceptual guide than a function to be directly used by external modules as is.
  public async hydrateSearchResults(rawResults: RawBM25SearchResult[]): Promise<HydratedSearchResultItem[]> {
    const detailedResults: HydratedSearchResultItem[] = [];
    for (const [docId, score] of rawResults) {
      const itemInMemory = this.inMemoryItemsStore.get(docId); // Check in-memory store for type
      if (itemInMemory) {
        if (itemInMemory.type === 'note') {
          const note = await getNoteByIdFromSystem(docId);
          if (note) {
            detailedResults.push({
              id: note.id,
              type: 'note',
              title: note.title || 'Untitled Note',
              score,
              content: note.content || '',
              note: note
            });
          }
        } else if (itemInMemory.type === 'chat') {
          const chat = await getChatMessageById(docId);
          if (chat) {
            detailedResults.push({
              id: chat.id,
              type: 'chat',
              title: chat.title || `Chat from ${new Date(chat.last_updated).toLocaleDateString()}`,
              score,
              content: chat.turns.map(t => t.content).join('\n'),
              chat: chat
            });
          }
        }
      } else {
         // Fallback if not in memory store (should ideally not happen if store is synced)
        console.warn(`[SearchService.hydrateSearchResults] Item ${docId} not found in inMemoryItemsStore for type determination.`);
         // Attempt to guess or fetch both, or handle error
      }
    }
    return detailedResults;
  }


  public formatResultsForLLM(results: HydratedSearchResultItem[]): string {
    if (!results || results.length === 0) {
      return "No relevant search results found to provide context.";
    }

    let promptOutput = "Use the following search results to answer. Cite by [Title] or (id: item_id) where appropriate:\n\n";
    let itemsAdded = 0;

    results.forEach((result) => {
      const title = result.title || (result.type === 'chat' && result.chat?.last_updated ? `Chat on ${new Date(result.chat.last_updated).toLocaleDateString()}` : 'Untitled Item');
      const id = result.id;
      let content = result.content || 'Content not available.';

      if (result.type === 'note') {
        promptOutput += `### [Note: ${title}] (id: ${id})\n`;
        promptOutput += `${content}\n\n`;
        itemsAdded++;
      } else if (result.type === 'chat') {
        promptOutput += `### [Chat: ${title}] (id: ${id})\n`;
        // For chats, result.content is already the concatenated turns.
        // Basic truncation for chat content.
        const maxChatContentLength = 1000; 
        if (content.length > maxChatContentLength) {
          content = content.substring(0, maxChatContentLength) + "... (truncated)";
        }
        promptOutput += `${content}\n\n`;
        itemsAdded++;
      }
    });

    if (itemsAdded === 0) {
      // This means no items were actually appended (e.g., results had items of unknown/unhandled type)
      return "No processable search results found to provide context.";
    }

    return promptOutput.trim();
  }
}

const searchServiceInstance = new SearchService();

export const engineInitializationPromise = searchServiceInstance.initializationPromise;

// Keep existing note-specific exports for now if they are directly used by noteStorage.
// Consider deprecating them in favor of generic methods if applicable.
export const indexNotes = searchServiceInstance.indexAllFullRebuild.bind(searchServiceInstance); // Points to the new unified rebuilder
export const indexSingleNote = searchServiceInstance.indexSingleNote.bind(searchServiceInstance);
export const removeNoteFromIndex = (noteId: string) => searchServiceInstance.removeItemFromIndex(noteId); // Wrapper

// New/updated exports for chats and generic search
export const indexSingleChatMessage = searchServiceInstance.indexSingleChatMessage.bind(searchServiceInstance);
export const removeChatMessageFromIndex = (chatId: string) => searchServiceInstance.removeItemFromIndex(chatId); // Wrapper
export const indexChatMessages = async () => { // Specific re-indexer for chats, though indexAllFullRebuild is preferred for full sync
  console.log('[SearchService.indexChatMessages] Starting to index all chat messages from system.');
  await searchServiceInstance.initializationPromise;
  const chats = await getAllChatMessages();
  chats.forEach(chat => {
     const content = chat.turns.map(turn => turn.content).join('\n');
     searchServiceInstance['inMemoryItemsStore'].set(String(chat.id), { // Accessing private member for this helper
        id: String(chat.id),
        type: 'chat',
        title: chat.title || `Chat from ${new Date(chat.last_updated).toLocaleDateString()}`,
        content: content
      });
  });
   // This helper would typically be followed by a call to _rebuildEngineFromMemoryStoreAndSaveUnconsolidated
   // For simplicity, direct users to indexAllFullRebuild or rely on individual indexing.
   // This export might be removed if indexAllFullRebuild and single indexing are sufficient.
  await searchServiceInstance['_rebuildEngineFromMemoryStoreAndSaveUnconsolidated']();
  console.log(`[SearchService.indexChatMessages] Chat indexing helper finished.`);
};


// Export the generic search function that returns raw BM25 results
export const search = searchServiceInstance.searchItems.bind(searchServiceInstance);
// The hydrateSearchResults is more of an internal concept or for the background script to use.
// formatResultsForLLM remains note-specific based on current implementation.
export const formatResultsForLLM = searchServiceInstance.formatResultsForLLM.bind(searchServiceInstance);
export const hydrateSearchResults = searchServiceInstance.hydrateSearchResults.bind(searchServiceInstance);
// Deprecating old searchNotes if 'search' is the new standard
// export const searchNotes = searchServiceInstance.searchNotes.bind(searchServiceInstance);
// If external modules still use searchNotes with its specific HydratedSearchResultItem<Note> structure,
// it might need to be kept temporarily or refactored.
// For now, we assume the background script (step 3) will handle hydration from `search`.
