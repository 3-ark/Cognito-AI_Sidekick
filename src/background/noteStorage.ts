import localforage from 'localforage';
import { Note, NOTE_STORAGE_PREFIX, NoteWithEmbedding, SaveNoteResult, DeleteNoteResult } from '../types/noteTypes';
import { indexNotes, indexSingleNote, removeNoteFromIndex } from './searchUtils';

export const EMBEDDING_NOTE_PREFIX = 'embedding_note_';

export const generateNoteId = (): string => `${NOTE_STORAGE_PREFIX}${Date.now()}_${Math.random().toString(16).slice(2)}`;

/**
 * Saves a new note or updates an existing one in localforage.
 * Embedding is saved separately.
 */
export const saveNoteInSystem = async (
  noteData: Partial<Omit<Note, 'id' | 'createdAt' | 'lastUpdatedAt'>> & { id?: string; content: string; embedding?: number[] }
): Promise<SaveNoteResult> => {
  const now = Date.now();
  const noteId = noteData.id || generateNoteId();
  let existingNote: Note | null = null;

  try {
    if (noteData.id) {
      existingNote = await localforage.getItem<Note>(noteId);
    }
  } catch (error) {
    console.error(`Error fetching existing note ${noteId} from localforage:`, error);
    // Non-critical, proceed as if note doesn't exist or rely on further ops to fail
  }

  const noteToSaveToStorage: Note = {
    id: noteId,
    title: noteData.title || `Note - ${new Date(now).toLocaleDateString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    content: noteData.content,
    createdAt: existingNote?.createdAt || now,
    lastUpdatedAt: now,
    tags: noteData.tags,
    url: noteData.url || '',
  };

  try {
    // Save the core Note object
    await localforage.setItem(noteId, noteToSaveToStorage);
  } catch (error) {
    console.error(`Critical error saving note ${noteId} to localforage:`, error);
    return { success: false, error: `Failed to save note data: ${error instanceof Error ? error.message : String(error)}`, note: noteToSaveToStorage };
  }

  const warnings: string[] = [];

  // Handle embedding
  try {
    if (noteData.embedding && noteData.embedding.length > 0) {
      await localforage.setItem(`${EMBEDDING_NOTE_PREFIX}${noteId}`, noteData.embedding);
    } else {
      await localforage.removeItem(`${EMBEDDING_NOTE_PREFIX}${noteId}`);
    }
  } catch (error) {
    console.warn(`Error saving/removing embedding for note ${noteId}:`, error);
    warnings.push(`Failed to save/remove embedding: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Update search index
  try {
    await indexSingleNote(noteToSaveToStorage);
  } catch (error) {
    console.warn(`Error indexing note ${noteId}:`, error);
    warnings.push(`Failed to update search index: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (warnings.length > 0) {
    return { success: true, note: noteToSaveToStorage, warning: warnings.join('; ') };
  }

  return { success: true, note: noteToSaveToStorage };
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
export const deleteNoteFromSystem = async (noteId: string): Promise<DeleteNoteResult> => {
  const warnings: string[] = [];
  let mainDeletionError: string | null = null;

  try {
    await localforage.removeItem(noteId);
  } catch (error) {
    console.error(`Error deleting main note data for ${noteId} from localforage:`, error);
    mainDeletionError = `Failed to delete note data: ${error instanceof Error ? error.message : String(error)}`;
    // Continue to attempt to delete embedding and index entry if main note deletion fails,
    // as they might be orphaned otherwise.
  }

  try {
    await localforage.removeItem(`${EMBEDDING_NOTE_PREFIX}${noteId}`);
  } catch (error) {
    console.warn(`Error deleting embedding for note ${noteId} from localforage:`, error);
    // This is a non-critical warning if the main note data deletion also failed,
    // but a warning if main note data was (or is assumed) deleted.
    warnings.push(`Failed to delete embedding: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (mainDeletionError) {
    // If critical deletion failed, report that as the primary error, but include other warnings.
    return { success: false, error: mainDeletionError, warning: warnings.join('; ') || undefined };
  }

  try {
    await removeNoteFromIndex(noteId);
  } catch (error) {
    console.warn(`Error removing note ${noteId} from search index:`, error);
    warnings.push(`Failed to remove note from search index: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (warnings.length > 0) {
    // Successfully deleted main note data, but some secondary operations failed.
    console.log(`Note ${noteId} deleted from system with warnings: ${warnings.join('; ')}`);
    return { success: true, warning: warnings.join('; ') };
  }

  console.log(`Note ${noteId} and its embedding deleted successfully from system and index.`);
  return { success: true };
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

      // Helper to escape double quotes for YAML strings
      const escapeDoubleQuotes = (str: string): string => str.replace(/"/g, '\\"');

      let mdContent = '---\n';
      mdContent += `title: "${escapeDoubleQuotes(note.title)}"\n`; // Quote title
      const dateTimestamp = note.lastUpdatedAt || note.createdAt;
      if (dateTimestamp) {
        const formattedDate = new Date(dateTimestamp).toISOString().split('T')[0];
        mdContent += `date: ${formattedDate}\n`;
      }
      if (note.tags && note.tags.length > 0) {
        mdContent += 'tags:\n';
        note.tags.forEach(tag => {
          // Tags themselves usually don't need quoting unless they contain special YAML characters.
          // Simple strings are fine. If a tag could contain a colon, quotes, etc., it would need it.
          // For now, assuming tags are simple.
          mdContent += `  - ${tag.trim()}\n`;
        });
      }
      if (note.url && note.url.trim() !== '') {
        mdContent += `source: "${escapeDoubleQuotes(note.url)}"\n`; // Changed key to 'source' and quote URL
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
