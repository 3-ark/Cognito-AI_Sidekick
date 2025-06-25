import localforage from 'localforage';
import { Note, NOTE_STORAGE_PREFIX, NoteWithEmbedding } from '../types/noteTypes';
import { indexNotes, indexSingleNote, removeNoteFromIndex } from './searchUtils';

export const EMBEDDING_NOTE_PREFIX = 'embedding_note_';

export const generateNoteId = (): string => `${NOTE_STORAGE_PREFIX}${Date.now()}_${Math.random().toString(16).slice(2)}`;

/**
 * Saves a new note or updates an existing one in localforage.
 * Embedding is saved separately.
 */
export const saveNoteInSystem = async (noteData: Partial<Omit<Note, 'id' | 'createdAt' | 'lastUpdatedAt'>> & { id?: string; content: string; embedding?: number[] }): Promise<Note> => {
  const now = Date.now();
  const noteId = noteData.id || generateNoteId();
  const existingNote = noteData.id ? await localforage.getItem<Note>(noteId) : null;

  const noteToSaveToStorage: Note = {
    id: noteId,
    title: noteData.title || `Note - ${new Date(now).toLocaleDateString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    content: noteData.content,
    createdAt: existingNote?.createdAt || now,
    lastUpdatedAt: now,
    tags: noteData.tags,
    url: noteData.url || '',
  };

  // Save the core Note object
  await localforage.setItem(noteId, noteToSaveToStorage);

  // Separately, save the embedding if it exists in the input 'noteData'
  if (noteData.embedding && noteData.embedding.length > 0) {
    await localforage.setItem(`${EMBEDDING_NOTE_PREFIX}${noteId}`, noteData.embedding);
  } else {
    // If noteData.embedding is undefined, null, or an empty array,
    // remove any existing embedding for this note to prevent orphans.
    await localforage.removeItem(`${EMBEDDING_NOTE_PREFIX}${noteId}`);
  }

  // After saving the note, update the search index
  await indexSingleNote(noteToSaveToStorage);

  return noteToSaveToStorage; // Return the core Note object
};

/**
 * Fetches all notes from localforage and their embeddings.
 */
export const getAllNotesFromSystem = async (): Promise<NoteWithEmbedding[]> => {
  const keys = await localforage.keys();
  const noteKeys = keys.filter(key => key.startsWith(NOTE_STORAGE_PREFIX));
  const processedNotes: NoteWithEmbedding[] = [];

  for (const key of noteKeys) {
    const rawNoteData = await localforage.getItem<Note>(key); // Expecting type Note
    if (rawNoteData && rawNoteData.id) { 
      let tagsArray: string[] = [];
      const tags: unknown = rawNoteData.tags;

      if (typeof tags === 'string') {
        tagsArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
      } else if (Array.isArray(tags)) {
        // Ensure all elements in the array are strings
        tagsArray = tags.map(tag => String(tag).trim()).filter(tag => tag.length > 0);
      }
      
      const baseNote: Note = {
        id: rawNoteData.id,
        title: rawNoteData.title,
        content: rawNoteData.content,
        createdAt: rawNoteData.createdAt,
        lastUpdatedAt: rawNoteData.lastUpdatedAt,
        tags: tagsArray,
        url: rawNoteData.url || '',
      };

      const embedding = await localforage.getItem<number[]>(`${EMBEDDING_NOTE_PREFIX}${baseNote.id}`);
      processedNotes.push({ ...baseNote, embedding: embedding || undefined });
    }
  }
  return processedNotes.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
};

/**
 * Deletes a note and its embedding from localforage by its ID.
 */
export const deleteNoteFromSystem = async (noteId: string): Promise<void> => {
  await localforage.removeItem(noteId); 
  await localforage.removeItem(`${EMBEDDING_NOTE_PREFIX}${noteId}`); 
  console.log('Note and its embedding deleted from system:', noteId);
  await removeNoteFromIndex(noteId);
};

/**
 * Deletes all notes and their embeddings from localforage.
 */
export const deleteAllNotesFromSystem = async (): Promise<void> => {
  const keys = await localforage.keys();
  const noteKeysToDelete: string[] = [];
  const embeddingKeysToDelete: string[] = [];

  for (const key of keys) {
    if (key.startsWith(NOTE_STORAGE_PREFIX)) {
      noteKeysToDelete.push(key);
    } else if (key.startsWith(EMBEDDING_NOTE_PREFIX)) {
      embeddingKeysToDelete.push(key);
    }
  }

  for (const key of noteKeysToDelete) {
    await localforage.removeItem(key);
  }
  for (const key of embeddingKeysToDelete) {
    await localforage.removeItem(key);
  }
  console.log('All notes and their embeddings deleted from system.');
  // After deleting all notes, re-index (which will result in an empty index)
  await indexNotes();
};

/**
 * Gets a single note by ID, including its embedding.
 */
export const getNoteByIdFromSystem = async (noteId: string): Promise<NoteWithEmbedding | null> => {
    const rawNote = await localforage.getItem<Note>(noteId); 
    if (!rawNote) {
      return null;
    }

    // Sanitize tags to ensure they are always a string array, handling legacy string format.
    let tagsArray: string[] = [];
    const tags: unknown = rawNote.tags;

    if (typeof tags === 'string') {
      tagsArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    } else if (Array.isArray(tags)) {
      tagsArray = tags.map(tag => String(tag).trim()).filter(tag => tag.length > 0);
    }

    const note: Note = { ...rawNote, tags: tagsArray };

    const embedding = await localforage.getItem<number[]>(`${EMBEDDING_NOTE_PREFIX}${noteId}`);
    return { ...note, embedding: embedding || undefined }; 
};
