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
      // Handle legacy tags which might be a string, or modern tags which are an array.
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
  // After deleting the note, update the search index
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

/**
 * Deletes multiple notes and their embeddings from localforage by their IDs.
 */
export const deleteNotesFromSystem = async (noteIds: string[]): Promise<void> => {
  if (!noteIds || noteIds.length === 0) {
    console.log('No note IDs provided for deletion.');
    return;
  }
  for (const noteId of noteIds) {
    await deleteNoteFromSystem(noteId); // This already handles removing from index
  }
  console.log(`${noteIds.length} notes deleted from system.`);
  // Note: deleteNoteFromSystem already calls removeNoteFromIndex for each note.
  // If a bulk update to the index is more performant, this could be changed later.
};

/**
 * Exports multiple notes to Obsidian MD format and triggers download for each.
 */
export const exportNotesToObsidianMD = async (noteIds: string[]): Promise<{ successCount: number, errorCount: number }> => {
  if (!noteIds || noteIds.length === 0) {
    console.log('No note IDs provided for export.');
    return { successCount: 0, errorCount: 0 };
  }

  let successCount = 0;
  let errorCount = 0;

  for (const noteId of noteIds) {
    try {
      const note = await getNoteByIdFromSystem(noteId);
      if (!note) {
        console.warn(`Note with ID ${noteId} not found for export.`);
        errorCount++;
        continue;
      }

      let mdContent = '---\n';
      mdContent += `title: ${note.title}\n`;
      const dateTimestamp = note.lastUpdatedAt || note.createdAt;
      if (dateTimestamp) {
        const formattedDate = new Date(dateTimestamp).toISOString().split('T')[0];
        mdContent += `date: ${formattedDate}\n`;
      }
      if (note.tags && note.tags.length > 0) {
        mdContent += 'tags:\n';
        note.tags.forEach(tag => {
          mdContent += `  - ${tag.trim()}\n`;
        });
      }
      if (note.url) {
        mdContent += `url: ${note.url}\n`;
      }
      mdContent += '---\n\n';
      mdContent += note.content;

      // Sanitize title for use as a filename
      const sanitizedTitle = note.title.replace(/[<>:"/\\|?*]+/g, '_') || 'Untitled Note';
      const filename = `${sanitizedTitle}.md`;

      // This part is tricky for background scripts.
      // Chrome extensions background scripts cannot directly create and click download links
      // in the same way content scripts or UI components can.
      // We need to use the chrome.downloads API.
      const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      await new Promise<void>((resolve, reject) => {
        chrome.downloads.download({
          url: url,
          filename: filename,
          saveAs: false // Set to true if you want the user to be prompted for each file location
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error(`Error downloading note ${note.title}:`, chrome.runtime.lastError.message);
            URL.revokeObjectURL(url); // Clean up blob URL
            errorCount++;
            reject(new Error(chrome.runtime.lastError.message));
          } else if (downloadId === undefined) {
            // This case can happen if the download is initiated too quickly after a previous one,
            // or if there's some other issue.
            console.error(`Download failed for note ${note.title}: downloadId is undefined.`);
            URL.revokeObjectURL(url);
            errorCount++;
            reject(new Error('Download failed: downloadId is undefined.'));
          } else {
            successCount++;
            // It's good practice to revoke the object URL after some time,
            // but not immediately, as the download might still be in progress.
            // For simplicity here, we'll revoke it after a short delay.
            // A more robust solution might involve tracking download completion.
            setTimeout(() => URL.revokeObjectURL(url), 5000); 
            resolve();
          }
        });
      });

    } catch (error) {
      console.error(`Failed to process or download note ${noteId}:`, error);
      errorCount++;
    }
  }
  console.log(`Export finished. Success: ${successCount}, Errors: ${errorCount}`);
  return { successCount, errorCount };
};
