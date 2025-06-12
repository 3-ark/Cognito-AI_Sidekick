import localforage from 'localforage';
import { Note, NOTE_STORAGE_PREFIX } from '../types/noteTypes';

export const generateNoteId = (): string => `${NOTE_STORAGE_PREFIX}${Date.now()}_${Math.random().toString(16).slice(2)}`;

/**
 * Saves a new note or updates an existing one in localforage.
 */
export const saveNoteInSystem = async (noteData: Partial<Note> & { content: string }): Promise<Note> => {
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

  await localforage.setItem(noteId, noteToSaveToStorage);
  return noteToSaveToStorage;
};

/**
 * Fetches all notes from localforage.
 */
export const getAllNotesFromSystem = async (): Promise<Note[]> => {
  const keys = await localforage.keys();
  const noteKeys = keys.filter(key => key.startsWith(NOTE_STORAGE_PREFIX));
  const processedNotes: Note[] = [];
  for (const key of noteKeys) {
    // Fetch as 'any' to handle potential malformed data, then validate
    const rawNoteData = await localforage.getItem<any>(key);
    if (rawNoteData) {
      let tagsArray: string[] = [];
      if (rawNoteData.tags) {
        if (typeof rawNoteData.tags === 'string') {
          // Convert comma-separated string to array
          tagsArray = rawNoteData.tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag.length > 0);
        } else if (Array.isArray(rawNoteData.tags)) {
          tagsArray = rawNoteData.tags.map((tag: any) => String(tag).trim()).filter((tag: string) => tag.length > 0);
        }
      }
      
      const validatedNote: Note = {
        id: rawNoteData.id,
        title: rawNoteData.title,
        content: rawNoteData.content,
        createdAt: rawNoteData.createdAt,
        lastUpdatedAt: rawNoteData.lastUpdatedAt,
        tags: tagsArray, // Use the sanitized tags array
        url: rawNoteData.url || '',
      };
      processedNotes.push(validatedNote);
    }
  }
  return processedNotes.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
};

/**
 * Deletes a note from localforage by its ID.
 */
export const deleteNoteFromSystem = async (noteId: string): Promise<void> => {
  await localforage.removeItem(noteId);
  console.log('Note deleted from system:', noteId);
};

/**
 * Deletes all notes from localforage.
 */
export const deleteAllNotesFromSystem = async (): Promise<void> => {
  const keys = await localforage.keys();
  const noteKeys = keys.filter(key => key.startsWith(NOTE_STORAGE_PREFIX));
  for (const key of noteKeys) {
    await localforage.removeItem(key);
  }
  console.log('All notes deleted from system.');
};

/**
 * Gets a single note by ID.
 */
export const getNoteByIdFromSystem = async (noteId: string): Promise<Note | null> => {
    return await localforage.getItem<Note>(noteId);
};
