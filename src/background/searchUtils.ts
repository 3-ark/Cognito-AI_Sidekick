import winkBM25Factory from 'wink-bm25-text-search';
import TinySegmenter from 'tiny-segmenter';
import { stem } from 'porter2';
import { getAllNotesFromSystem } from './noteStorage';
import { Note } from '../types/noteTypes';

const tinySegmenter = new TinySegmenter();
const engine = winkBM25Factory(); // Single engine instance
let _engineConfiguredInitial = false; // Flag for the very first configuration

function _configureEngine() {
  function multilingualTokenizerSync(text: string): string[] {
    let tokens: string[] = [];
    if (!text || text.trim().length === 0) {
      return [];
    }
    const firstChar = text.trim().charAt(0);
    const code = firstChar.charCodeAt(0);

    if ((code >= 0x3040 && code <= 0x30FF) || (code >= 0x31F0 && code <= 0x31FF)) { // Japanese
      tokens = tinySegmenter.segment(text);
    } else if (code >= 0xAC00 && code <= 0xD7A3) { // Korean
      tokens = text.split('').filter(char => char.charCodeAt(0) >= 0xAC00 && char.charCodeAt(0) <= 0xD7A3);
    } else if (code >= 0x0400 && code <= 0x04FF) { // Cyrillic
      tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
    } else if (code >= 0x0600 && code <= 0x06FF) { // Arabic
      tokens = text.split(/\s+/).filter(Boolean);
    } else if (code >= 0x0900 && code <= 0x097F) { // Devanagari
      tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
    } else { // Default: Latin, Chinese (fallback), etc.
      tokens = text.toLowerCase().split(/\s+/).filter(Boolean).map(token => stem(token));
    }
    
    // Verbose logging removed
    // if (text && (text.includes("apples and bananas") || text.includes("例如苹果和香蕉") || text.includes("apple") || text.includes("苹果"))) {
    //     console.log(`[Tokenizer] Input for matched content: "${text.substring(0, 100)}...", Output:`, tokens);
    // } else if (text && text.length < 70) { // Log shorter texts too
    //     console.log(`[Tokenizer] Input (short): "${text}", Output:`, tokens);
    // }
    return tokens;
  }

  engine.defineConfig({ fldWeights: { title: 1, content: 2 } });
  engine.definePrepTasks([multilingualTokenizerSync]);
}

export const engineInitializationPromise: Promise<void> = new Promise((resolve, reject) => {
  if (_engineConfiguredInitial) {
    resolve();
    return;
  }
  try {
    _configureEngine();
    _engineConfiguredInitial = true;
    // console.log('BM25 engine initially configured successfully.'); // Keep this one for now, or make it more subtle
    resolve();
  } catch (error) {
    console.error('Failed to configure BM25 engine initially:', error);
    reject(error); 
  }
});

export async function indexNotes() {
  await engineInitializationPromise; 
  
  // console.log('Indexing notes (full re-index)...'); // Reduced verbosity
  engine.reset(); 
  _configureEngine(); 

  const notes = await getAllNotesFromSystem();
  // console.log(`[IndexNotes] Found ${notes.length} notes to index.`); // Reduced verbosity
  notes.forEach((note, i) => {
    const docId = typeof note.id === 'string' ? note.id : String(i);
    const title = note.title || '';
    const content = note.content || '';
    
    // Verbose logging removed
    // console.log(`[IndexNotes] ADDING DOC: ID=${docId}, Title="${title}"`);
    // if (content.length < 200 || title === 'English Note' || title === 'Chinese Note') { 
    //     console.log(`[IndexNotes]   Content for ID ${docId}: "${content}"`);
    // } else {
    //     console.log(`[IndexNotes]   Content for ID ${docId} (snippet): "${content.substring(0,100)}..."`);
    // }
    
    engine.addDoc({ title, content }, docId);
  });
  
  try {
    engine.consolidate();
    // console.log(`[IndexNotes] Consolidation complete. Indexed ${notes.length} notes.`); // Reduced verbosity
  } catch (e: any) {
    console.error(`[IndexNotes] Error during consolidation: ${e.message}`, e);
    throw e; 
  }
}

export async function indexSingleNote(note: Note) {
  await engineInitializationPromise; 
  if (!note || !note.id) {
    console.error('Cannot index note without ID:', note);
    return;
  }
  await indexNotes(); 
}

export async function removeNoteFromIndex(noteId: string) {
  await engineInitializationPromise;
  await indexNotes();
}

export async function searchNotes(query: string, topK = 10): Promise<Array<[string, number]>> {
  await engineInitializationPromise; 
  
  if (typeof query !== 'string' || query.trim() === '') {
    return [];
  }
  
  try {
    const results = engine.search(query);
    return results.slice(0, topK).map(
      ([id, score]): [string, number] => [String(id), score]
    );
  } catch (e: any) {
    console.error(`[SearchNotes] Error during engine.search("${query}"): ${e.message}`, e);
    return [];
  }
}
