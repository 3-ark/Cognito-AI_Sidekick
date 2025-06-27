import winkBM25Factory from 'wink-bm25-text-search';
import TinySegmenter from 'tiny-segmenter';
import { stem } from 'porter2';
import { getAllNotesFromSystem, getNoteByIdFromSystem } from './noteStorage';
import { Note } from '../types/noteTypes';
import storage from './storageUtil';

// Correctly define BM25Engine type using ReturnType
type BM25Engine = ReturnType<typeof winkBM25Factory>;

const BM25_UNCONSOLIDATED_INDEX_KEY = 'bm25_index_unconsolidated';
const BM25_CONSOLIDATED_INDEX_KEY = 'bm25_index_consolidated';
const DEFERRED_CONSOLIDATION_THRESHOLD = 5;

export interface SearchResultItem {
  id: string;
  title: string;
  score: number;
  content?: string;
}

class SearchService {
  private engine: BM25Engine;
  private tinySegmenter: TinySegmenter;
  private _engineConfiguredAndLoaded: boolean = false;
  private inMemoryNotesStore: Map<string, { title: string; content: string }> = new Map();
  private unconsolidatedChangeCount: number = 0;

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
    await this._loadUnconsolidatedIndexIntoEngine();
    try {
      this.engine.consolidate();
      console.log('[SearchService._performConsolidation] Engine consolidated.');
      await this._saveIndex(true);
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
    this.engine.reset();
    this._configureEngine();
    if (unconsolidatedJson) {
      console.log('[SearchService._loadUnconsolidatedIndexIntoEngine] Loading unconsolidated index from storage.');
      this.engine.importJSON(unconsolidatedJson);
    } else {
      console.warn('[SearchService._loadUnconsolidatedIndexIntoEngine] No unconsolidated index found in storage. Engine is fresh.');
    }
  }

  private async _rebuildEngineFromMemoryStoreAndSaveUnconsolidated(): Promise<void> {
    this.engine.reset();
    this._configureEngine();
    console.log(`[SearchService._rebuildEngineFromMemoryStore] Rebuilding engine from ${this.inMemoryNotesStore.size} in-memory notes.`);
    for (const [docId, doc] of this.inMemoryNotesStore) {
      this.engine.addDoc(doc, docId);
    }
    await this._saveIndex(false);
    this.unconsolidatedChangeCount++;
    console.log(`[SearchService._rebuildEngineFromMemoryStore] Unconsolidated index saved. Change count: ${this.unconsolidatedChangeCount}`);
    await this._triggerDeferredConsolidation();
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
        this.unconsolidatedChangeCount = 0;
        console.log('[SearchService._initialize] Consolidated index loaded successfully.');
      } else {
        const unconsolidatedIndexJson = await storage.getItem(BM25_UNCONSOLIDATED_INDEX_KEY);
        if (unconsolidatedIndexJson) {
          console.log('[SearchService._initialize] Found unconsolidated index in storage.');
          this.engine.importJSON(unconsolidatedIndexJson);
          loadedIndex = true;
          consolidateAfterLoad = true;
          console.log('[SearchService._initialize] Unconsolidated index loaded successfully.');
        }
      }

      if (loadedIndex) {
        console.log('[SearchService._initialize] Index loaded. Populating in-memory store from getAllNotesFromSystem.');
        const notes = await getAllNotesFromSystem();
        this.inMemoryNotesStore.clear();
        notes.forEach(note => {
          this.inMemoryNotesStore.set(String(note.id), { title: note.title || '', content: note.content || '' });
        });
        console.log(`[SearchService._initialize] In-memory notes store populated with ${this.inMemoryNotesStore.size} notes.`);

        if (consolidateAfterLoad) {
          console.log('[SearchService._initialize] Consolidating loaded unconsolidated index...');
          await this._performConsolidation();
        }
      } else {
        console.log('[SearchService._initialize] No index found in storage. Building new index...');
        await this.indexNotesFullRebuild();
      }

      this._engineConfiguredAndLoaded = true;
      console.log('[SearchService._initialize] Engine initialization complete.');
    } catch (error) {
      console.error('[SearchService._initialize] Critical error during engine initialization:', error);
      try {
        console.warn('[SearchService._initialize] Attempting fallback: full re-index.');
        this._configureEngine();
        await this.indexNotesFullRebuild();
        this._engineConfiguredAndLoaded = true;
        console.log('[SearchService._initialize] Fallback engine initialization complete.');
      } catch (fallbackError) {
        console.error('[SearchService._initialize] Critical error during fallback engine initialization:', fallbackError);
        throw fallbackError;
      }
    }
  }

  public async indexNotesFullRebuild(): Promise<void> {
    console.log('[SearchService.indexNotesFullRebuild] Starting to index all notes from system.');
    this.engine.reset();
    this._configureEngine();

    const notes = await getAllNotesFromSystem();
    this.inMemoryNotesStore.clear();
    notes.forEach((note) => {
      const docId = String(note.id);
      this.engine.addDoc({ title: note.title || '', content: note.content || '' }, docId);
      this.inMemoryNotesStore.set(docId, { title: note.title || '', content: note.content || '' });
    });
    console.log(`[SearchService.indexNotesFullRebuild] Added ${notes.length} documents to engine. In-memory store updated.`);
    try {
      await this._saveIndex(false);
      console.log('[SearchService.indexNotesFullRebuild] Unconsolidated index saved.');
      await this._performConsolidation();
    } catch (e: any) {
      console.error(`[SearchService.indexNotesFullRebuild] Error during indexing/consolidation: ${e.message}`, e);
      throw e;
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
    await this._loadUnconsolidatedIndexIntoEngine();

    this.inMemoryNotesStore.set(noteIdStr, { title: note.title || '', content: note.content || '' });
    console.log(`[SearchService.indexSingleNote] Note ${noteIdStr} added/updated in in-memory store. Store size: ${this.inMemoryNotesStore.size}`);

    await this._rebuildEngineFromMemoryStoreAndSaveUnconsolidated();
  }

  public async removeNoteFromIndex(noteId: string): Promise<void> {
    await this.initializationPromise;
    if (!noteId) {
      console.error('[SearchService.removeNoteFromIndex] Cannot remove note without ID.');
      return;
    }
    console.log(`[SearchService.removeNoteFromIndex] Removing note from index: ${noteId}`);
    await this._loadUnconsolidatedIndexIntoEngine();

    if (this.inMemoryNotesStore.has(noteId)) {
      this.inMemoryNotesStore.delete(noteId);
      console.log(`[SearchService.removeNoteFromIndex] Note ${noteId} removed from in-memory store. Store size: ${this.inMemoryNotesStore.size}`);
      await this._rebuildEngineFromMemoryStoreAndSaveUnconsolidated();
    } else {
      console.warn(`[SearchService.removeNoteFromIndex] Note ${noteId} not found in in-memory store. No changes made to index.`);
    }
  }

  public async searchNotes(query: string, topK = 10): Promise<SearchResultItem[]> {
    await this.initializationPromise;

    if (this.unconsolidatedChangeCount > 0) {
      console.log('[SearchService.searchNotes] Consolidated index is stale. Performing consolidation before search.');
      await this._performConsolidation();
    }

    if (typeof query !== 'string' || query.trim() === '') {
      return [];
    }
    try {
      const rawResults = this.engine.search(query);
      const topResults = rawResults.slice(0, topK);

      const detailedResults: SearchResultItem[] = [];
      for (const [docId, score] of topResults) {
        const noteIdStr = String(docId);
        const note = await getNoteByIdFromSystem(noteIdStr);
        if (note) {
          detailedResults.push({
            id: note.id,
            title: note.title || 'Untitled Note',
            score: score,
            content: note.content || '', // Ensure content is populated
          });
        } else {
          console.warn(`[SearchService.searchNotes] Note details not found for ID: ${noteIdStr}`);
          detailedResults.push({
            id: noteIdStr,
            title: 'Unknown Title (Note not found)',
            score: score,
            content: 'Content not available.', // Fallback content
          });
        }
      }
      return detailedResults;
    } catch (e: any) {
      console.error(`[SearchService.searchNotes] Error during engine.search("${query}"): ${e.message}`, e);
      return [];
    }
  }

  public formatResultsForLLM(results: SearchResultItem[]): string {
    if (!results || results.length === 0) {
      return "No relevant notes found to provide context.";
    }

    let promptOutput = "Use the following notes to answer. Cite by [Note Title] or (id: note_id) where appropriate:\n\n";
    results.forEach((result) => {
      promptOutput += `### [${result.title}] (id: ${result.id})\n`;
      promptOutput += `${result.content || 'Content not available.'}\n\n`;
    });
    return promptOutput.trim();
  }
}

const searchServiceInstance = new SearchService();

export const engineInitializationPromise = searchServiceInstance.initializationPromise;
export const indexNotes = searchServiceInstance.indexNotesFullRebuild.bind(searchServiceInstance);
export const indexSingleNote = searchServiceInstance.indexSingleNote.bind(searchServiceInstance);
export const removeNoteFromIndex = searchServiceInstance.removeNoteFromIndex.bind(searchServiceInstance);
export const searchNotes = searchServiceInstance.searchNotes.bind(searchServiceInstance);
export const formatResultsForLLM = searchServiceInstance.formatResultsForLLM.bind(searchServiceInstance);
