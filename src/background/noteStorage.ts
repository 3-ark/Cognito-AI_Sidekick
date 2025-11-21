import { strToU8, zipSync } from 'fflate';
import localforage from 'localforage';

import { getChunkIndex, getChunksForParent, removeParentFromIndex, setChunksForParent } from './chunkIndex';
import { NoteInputForChunking } from '../types/chunkTypes';
import {
 Note, NOTE_STORAGE_PREFIX, NoteWithEmbedding, 
} from '../types/noteTypes';
import { chunkNote } from './chunkingUtils';
import { getEmbedding } from './embeddingUtils';
import { getStoredAppSettings } from './storageUtil';
import { aggressiveProcessText, cleanMarkdownForSemantics } from './textProcessing';

const sanitizeTags = (tags: unknown): string[] => {
  if (typeof tags === 'string') {
    return tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
  }
  if (Array.isArray(tags)) {
    return tags.map(tag => String(tag).trim()).filter(tag => tag.length > 0);
  }
  return [];
};

export const EMBEDDING_NOTE_PREFIX = 'embedding_note_';

export const generateNoteId = (): string => `${NOTE_STORAGE_PREFIX}${Date.now()}_${Math.random().toString(16).slice(2)}`;

/**
 * Saves a new note or updates an existing one in localforage.
 * Embedding is saved separately.
 */
export const saveNoteInSystem = async (noteData: Partial<Note> & { content: string; embedding?: number[] }): Promise<Note> => {
  const now = Date.now();
  const noteId = noteData.id || generateNoteId();
  const existingNote = noteData.id ? await localforage.getItem<Note>(noteId) : null;

  const cleanContent = cleanMarkdownForSemantics(noteData.content);
  const bm25Content = aggressiveProcessText(cleanContent).join(' ');

  const finalTitle = noteData.title || (existingNote?.title) || `Note - ${new Date(now).toLocaleDateString([], {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })}`;

  const hasContentChanged = !existingNote ||
    noteData.content !== existingNote.content ||
    finalTitle !== existingNote.title ||
    (noteData.description || '') !== (existingNote.description || '') ||
    JSON.stringify((noteData.tags || []).sort()) !== JSON.stringify((existingNote?.tags || []).sort());

  const noteToSaveToStorage: Note = {
    ...(existingNote || {}),
    ...noteData,
    id: noteId,
    title: finalTitle,
    content: noteData.content,
    createdAt: existingNote?.createdAt || now,
    lastUpdatedAt: noteData.lastUpdatedAt || now,
    contentLastUpdatedAt: hasContentChanged ? now : (existingNote.contentLastUpdatedAt || existingNote.lastUpdatedAt),
    tags: noteData.tags || (existingNote?.tags) || [],
    url: noteData.url || (existingNote?.url) || '',
    pinned: noteData.pinned ?? (existingNote?.pinned) ?? false,
    bm25Content: bm25Content,
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

  const appSettings = await getStoredAppSettings();

  if (appSettings?.ragConfig?.autoEmbedOnSave && hasContentChanged) {
    // If the note is being updated, use the index to efficiently delete its old chunks.
    if (existingNote) {
      const oldChunkIds = await getChunksForParent(noteId);
      for (const chunkId of oldChunkIds) {
          await localforage.removeItem(chunkId);
      }
      // No need to remove parent from index, as it will be overwritten by setChunksForParent.
      console.log(`Deleted ${oldChunkIds.length} old chunks for note ${noteId} using the index.`);
    }

    const noteInput: NoteInputForChunking = {
      id: noteId,
      content: noteData.content,
      title: noteToSaveToStorage.title,
      url: noteToSaveToStorage.url,
      description: noteToSaveToStorage.description,
      tags: noteToSaveToStorage.tags,
      lastUpdatedAt: noteToSaveToStorage.contentLastUpdatedAt,
    };
    const { chunks } = await chunkNote(noteInput, appSettings.ragConfig);
    const chunkIds = chunks.map(chunk => chunk.id);
    await setChunksForParent(noteId, chunkIds);

    for (const chunk of chunks) {
      chunk.embedding = await getEmbedding(chunk.content);
      await localforage.setItem(chunk.id, chunk);
    }
  }

  // After saving the note, update the search index - THIS IS NOW HANDLED BY THE CALLER (background/index.ts)
  // await indexSingleNote(noteToSaveToStorage);

  return noteToSaveToStorage; // Return the core Note object
};

/**
 * Fetches all notes from localforage and their embeddings.
 */
export const getAllNotesFromSystem = async (): Promise<NoteWithEmbedding[]> => {
  const keys = await localforage.keys();
  const noteKeys = keys.filter(key => key.startsWith(NOTE_STORAGE_PREFIX));
  const processedNotes: NoteWithEmbedding[] = [];

  for (const key of noteKeys.sort().reverse()) {
    const rawNoteData = await localforage.getItem<Note>(key); // Expecting type Note

    if (rawNoteData && rawNoteData.id) {
      const tagsArray = sanitizeTags(rawNoteData.tags);
      
      const baseNote: Note = {
        id: rawNoteData.id,
        title: rawNoteData.title,
        description: rawNoteData.description,
        content: rawNoteData.content,
        createdAt: rawNoteData.createdAt,
        lastUpdatedAt: rawNoteData.lastUpdatedAt,
        tags: tagsArray,
        url: rawNoteData.url || '',
        pinned: rawNoteData.pinned || false,
      };

      const embedding = await localforage.getItem<number[]>(`${EMBEDDING_NOTE_PREFIX}${baseNote.id}`);

      processedNotes.push({ ...baseNote, embedding: embedding || undefined });
    }
  }

  return processedNotes.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.lastUpdatedAt - a.lastUpdatedAt;
  });
};

/**
 * Deletes a note and its embedding from localforage by its ID.
 */
export const deleteNoteFromSystem = async (noteId: string): Promise<void> => {
  await localforage.removeItem(noteId);
  await localforage.removeItem(`${EMBEDDING_NOTE_PREFIX}${noteId}`);

  // Also, delete all associated chunks using the new index.
  const chunkIdsToDelete = await getChunksForParent(noteId);
  for (const key of chunkIdsToDelete) {
    await localforage.removeItem(key);
  }
  await removeParentFromIndex(noteId);

  console.log('Note and its embedding deleted from system:', noteId);

  // After deleting the note, update the search index - THIS IS NOW HANDLED BY THE CALLER (background/index.ts)
  // await removeNoteFromIndex(noteId);
};

import { getSearchService } from './searchUtils';
import { saveChunkIndex } from './chunkIndex';

/**
 * Deletes all notes and their embeddings from localforage efficiently.
 */
export const deleteAllNotesFromSystem = async (): Promise<void> => {
  const searchService = await getSearchService();
  const chunkIndex = await getChunkIndex();
  const keys = await localforage.keys();

  const noteKeys = keys.filter(key => key.startsWith(NOTE_STORAGE_PREFIX));
  const noteEmbeddingKeys = keys.filter(key => key.startsWith(EMBEDDING_NOTE_PREFIX));

  const noteChunkKeysToDelete = new Set<string>();

  for (const noteId of noteKeys) {
      const chunkIds = chunkIndex[noteId] || [];
      for (const chunkId of chunkIds) {
          noteChunkKeysToDelete.add(chunkId);
      }
      delete chunkIndex[noteId]; // Remove from chunk index
  }

  // Find any orphaned note chunks
  keys.forEach(key => {
      if (key.startsWith('notechunk_') || key.startsWith('jsonchunk_')) {
          noteChunkKeysToDelete.add(key);
      }
  });

  const allKeysToDelete = [
      ...noteKeys,
      ...noteEmbeddingKeys,
      ...Array.from(noteChunkKeysToDelete)
  ];

  for (const key of noteKeys) {
      await searchService.removeItemFromIndex(key);
  }

  await Promise.all(allKeysToDelete.map(key => localforage.removeItem(key)));

  await saveChunkIndex(chunkIndex);

  console.log('All notes and their associated data have been deleted efficiently.');
};

/**
 * Gets a single note by ID, including its embedding.
 */
export const getNoteByIdFromSystem = async (noteId: string): Promise<NoteWithEmbedding | null> => {
    const rawNote = await localforage.getItem<Note>(noteId);
 
    if (!rawNote) {
      return null;
    }

    const tagsArray = sanitizeTags(rawNote.tags);

    const note: Note = {
      ...rawNote,
      description: rawNote.description,
      tags: tagsArray,
    };

    const embedding = await localforage.getItem<number[]>(`${EMBEDDING_NOTE_PREFIX}${noteId}`);

    return { ...note, embedding: embedding || undefined }; 
};

/**
 * Deletes multiple notes and their embeddings from localforage by their IDs efficiently.
 */
export const deleteNotesFromSystem = async (noteIds: string[]): Promise<void> => {
  if (!noteIds || noteIds.length === 0) {
    console.log('No note IDs provided for deletion.');
    return;
  }

  const searchService = await getSearchService();
  const chunkIndex = await getChunkIndex();
  const keysToDelete = new Set<string>();

  for (const noteId of noteIds) {
    keysToDelete.add(noteId);
    keysToDelete.add(`${EMBEDDING_NOTE_PREFIX}${noteId}`);

    const chunkIds = chunkIndex[noteId] || [];
    for (const chunkId of chunkIds) {
        keysToDelete.add(chunkId);
    }
    delete chunkIndex[noteId];

    await searchService.removeItemFromIndex(noteId);
  }

  await Promise.all(Array.from(keysToDelete).map(key => localforage.removeItem(key)));

  await saveChunkIndex(chunkIndex);

  console.log(`${noteIds.length} notes and their associated data deleted from system.`);
};

/**
 * Exports multiple notes to Obsidian MD format and triggers download for each.
 */
export const exportNotesToObsidianMD = async (noteIds: string[]): Promise<{ successCount: number, errorCount: number, isZip: boolean }> => {
  if (!noteIds || noteIds.length === 0) {
    console.log('No note IDs provided for export.');

    return {
 successCount: 0, errorCount: 0, isZip: false, 
};
  }

  let successCount = 0;
  let errorCount = 0;
  const filesToZip: Record<string, Uint8Array> = {};

  for (const noteId of noteIds) {
    try {
      const note = await getNoteByIdFromSystem(noteId);

      if (!note) {
        console.warn(`Note with ID ${noteId} not found for export.`);
        errorCount++;
        continue;
      }

      let mdContent = '---\n';

      mdContent += `title: "${note.title.replace(/"/g, '\\\\"')}"\n`;

      if (note.description) {
        mdContent += `description: "${note.description.replace(/"/g, '\\\\"')}"\n`;
      }

      if (note.url) {
        mdContent += `source: "${note.url.replace(/"/g, '\\\\"')}"\n`;
      }

      if (note.tags && note.tags.length > 0) {
        mdContent += 'tags:\n';
        note.tags.forEach(tag => {
          const trimmedTag = tag.trim();

          if (trimmedTag.includes(':') || trimmedTag.includes('"')) {
            mdContent += `  - "${trimmedTag.replace(/"/g, '\\\\"')}"\n`;
          } else {
            mdContent += `  - ${trimmedTag}\n`;
          }
        });
      }

      mdContent += '---\n\n';
      mdContent += note.content;

      const sanitizedTitle = note.title.replace(/[<>:"/\\|?*]+/g, '_') || 'Untitled Note';
      const filename = `${sanitizedTitle}.md`;

      filesToZip[filename] = strToU8(mdContent);
      successCount++;
    } catch (error) {
      console.error(`Failed to process note ${noteId} for zipping:`, error);
      errorCount++;
    }
  }

  if (successCount === 0) {
    console.log('No notes were successfully processed for export.');

    return {
 successCount: 0, errorCount, isZip: false, 
};
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zipFilename = `cognito-${timestamp}.zip`;

    // Create the zip file content
    const zippedContent = zipSync(filesToZip);

    // Convert Uint8Array to Blob
    const blob = new Blob([new Uint8Array(zippedContent)], { type: 'application/zip' });

    // Convert Blob to Base64 data URL
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolveReader, rejectReader) => {
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolveReader(reader.result);
        } else {
          rejectReader(new Error('Failed to convert Blob to Base64 data URL.'));
        }
      };
      reader.onerror = () => {
        rejectReader(new Error('FileReader error while converting Blob to Base64.'));
      };
      reader.readAsDataURL(blob);
    });

    await new Promise<void>((resolve, reject) => {
      chrome.downloads.download({
        url: dataUrl,
        filename: zipFilename,
        saveAs: false,
      }, downloadId => {
        // No URL.revokeObjectURL needed for data URLs
        if (chrome.runtime.lastError) {
          console.error(`Error downloading zip file ${zipFilename}:`, chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
        } else if (downloadId === undefined) {
          console.error(`Download failed for zip file ${zipFilename}: downloadId is undefined.`);
          reject(new Error('Download failed: downloadId is undefined.'));
        } else {
          console.log(`Successfully initiated download for ${zipFilename}`);
          resolve();
        }
      });
    });

    return {
 successCount, errorCount, isZip: true, 
};
  } catch (zipError) {
    console.error('Failed to create or download zip file:', zipError);

    // If zipping fails, we still have the individual error counts, but explicitly state zip failed.
    return {
 successCount: 0, errorCount: noteIds.length, isZip: false, 
}; // Treat all as errors if zip fails
  }
};
