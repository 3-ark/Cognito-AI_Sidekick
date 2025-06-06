import localforage from 'localforage';
import { Note, NOTE_STORAGE_PREFIX } from '../types/noteTypes';

export const generateNoteId = (): string => `${NOTE_STORAGE_PREFIX}${Date.now()}_${Math.random().toString(16).slice(2)}`;

/**
 * Saves a new note or updates an existing one in localforage.
 */
export const saveNoteInSystem = async (noteData: Partial<Note> & { content: string }): Promise<Note> => {
  const now = Date.now(); // 'now' is used for createdAt, lastUpdatedAt, and potentially title fallback
  const noteId = noteData.id || generateNoteId();
  const existingNote = noteData.id ? await localforage.getItem<Note>(noteId) : null;

  // Directly use title and tags from noteData.
  // NotePopover is responsible for ensuring noteData.title is populated (custom or generated).
  const titleToSave = noteData.title;
  const tagsToSave = noteData.tags;

  const noteToSaveToStorage: Note = {
    id: noteId,
    title: titleToSave, // Explicitly use the title from noteData
    content: noteData.content,
    createdAt: existingNote?.createdAt || now,
    lastUpdatedAt: now,
    tags: tagsToSave,    // Explicitly use the tags from noteData
    // isArchived: noteData.isArchived || false, // Example for future fields
  };

  await localforage.setItem(noteId, noteToSaveToStorage);
  // console.log('Note saved to system:', noteToSaveToStorage); // Original log, can be kept or removed
  return noteToSaveToStorage;
};

/**
 * Fetches all notes from localforage.
 */
export const getAllNotesFromSystem = async (): Promise<Note[]> => {
  const keys = await localforage.keys();
  const noteKeys = keys.filter(key => key.startsWith(NOTE_STORAGE_PREFIX));
  const notes: Note[] = [];
  for (const key of noteKeys) {
    const note = await localforage.getItem<Note>(key);
    if (note) {
      notes.push(note);
    }
  }
  return notes.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
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
