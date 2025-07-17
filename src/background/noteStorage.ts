import localforage from 'localforage';
import { strToU8, zipSync } from 'fflate';
import { Note, NoteWithEmbedding } from '../types/noteTypes';
import type { NoteChunk } from '../types/chunkTypes';
import { removeNoteFromIndex, rebuildFullIndex } from './searchUtils';
import { CHAT_STORAGE_PREFIX, deleteChatMessage, deleteAllChatMessages } from './chatHistoryStorage'; // Keep these if they are used from here
import { chunkNoteContent } from './chunkingUtils';
import { generateEmbeddings, ensureEmbeddingServiceConfigured } from './embeddingUtils';
import storage from './storageUtil';
import { Config } from '../types/config';

// --- CONSTANTS ---
export const EMBEDDING_NOTE_PREFIX = 'embedding_note_';
export const EMBEDDING_NOTE_CHUNK_PREFIX = 'embedding_notechunk_';
export const NOTE_CHUNK_TEXT_PREFIX = 'notechunktext_';
export const NOTE_STORAGE_PREFIX = 'note_';
// NEW: Constant for the parent-to-chunk index
export const NOTE_CHUNK_INDEX_PREFIX = 'note-chunk-index:';

export const generateNoteId = (): string => `${NOTE_STORAGE_PREFIX}${Date.now()}_${Math.random().toString(16).slice(2)}`;

/**
 * Saves a new note or updates an existing one in localforage.
 * This function now also handles chunking and saving the parent-to-chunk index.
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

  await localforage.setItem(noteId, noteToSaveToStorage);

  if (noteData.embedding && noteData.embedding.length > 0) {
    await localforage.setItem(`${EMBEDDING_NOTE_PREFIX}${noteId}`, noteData.embedding);
  } else {
    await localforage.removeItem(`${EMBEDDING_NOTE_PREFIX}${noteId}`);
  }

  try {
    const configStr: string | null = await storage.getItem('config');
    const config: Config | null = configStr ? JSON.parse(configStr) : null;
    const embeddingMode = config?.rag?.embeddingMode ?? 'manual';

    // MODIFIED: Destructure the new return object from chunkNoteContent
    const { chunks: currentChunks, chunkIds } = chunkNoteContent({
      id: noteToSaveToStorage.id,
      content: noteToSaveToStorage.content,
      title: noteToSaveToStorage.title,
      url: noteToSaveToStorage.url,
      tags: noteToSaveToStorage.tags,
    });

    const currentChunkIdsSet = new Set(chunkIds);
    const allStorageKeys = await localforage.keys();

    const oldChunkTextKeys = allStorageKeys.filter(key => 
      key.startsWith(NOTE_CHUNK_TEXT_PREFIX) && key.includes(noteToSaveToStorage.id)
    );
    const oldChunkEmbeddingKeys = allStorageKeys.filter(key =>
      key.startsWith(EMBEDDING_NOTE_CHUNK_PREFIX) && key.includes(noteToSaveToStorage.id)
    );

    for (const oldKey of oldChunkTextKeys) {
      const chunkId = oldKey.substring(NOTE_CHUNK_TEXT_PREFIX.length);
      if (!currentChunkIdsSet.has(chunkId)) {
        await localforage.removeItem(oldKey);
        await localforage.removeItem(`${EMBEDDING_NOTE_CHUNK_PREFIX}${chunkId}`);
      }
    }
    for (const oldEmbeddingKey of oldChunkEmbeddingKeys) {
        const chunkId = oldEmbeddingKey.substring(EMBEDDING_NOTE_CHUNK_PREFIX.length);
        if (!currentChunkIdsSet.has(chunkId)) {
            await localforage.removeItem(oldEmbeddingKey);
        }
    }

    for (const chunk of currentChunks) {
      await localforage.setItem(`${NOTE_CHUNK_TEXT_PREFIX}${chunk.id}`, chunk.content);
    }

    // NEW: Save the parent-to-chunk index. This is the crucial part.
    await localforage.setItem(`${NOTE_CHUNK_INDEX_PREFIX}${noteToSaveToStorage.id}`, chunkIds);

    if (embeddingMode === 'automatic') {
      if (currentChunks.length > 0) {
        try {
            await ensureEmbeddingServiceConfigured();
            if (config?.rag?.embedding_model) {
                const chunkContents = currentChunks.map(chunk => chunk.content);
                const embeddings = await generateEmbeddings(chunkContents);
                for (let i = 0; i < currentChunks.length; i++) {
                    const chunk = currentChunks[i];
                    const embedding = embeddings[i];
                    if (embedding && embedding.length > 0) {
                        await localforage.setItem(`${EMBEDDING_NOTE_CHUNK_PREFIX}${chunk.id}`, embedding);
                    } else {
                        await localforage.removeItem(`${EMBEDDING_NOTE_CHUNK_PREFIX}${chunk.id}`);
                    }
                }
            }
        } catch (configError) {
            console.warn(`Embedding service not configured. Skipping automatic embedding for note ${noteToSaveToStorage.id}. Error: ${configError}`);
        }
      }
    }
    console.log(`Processed and saved ${currentChunks.length} chunk texts and index for note ${noteToSaveToStorage.id}.`);
  } catch (error) {
    console.error(`Error during chunking or conditional embedding generation for note ${noteToSaveToStorage.id}:`, error);
  }

  return noteToSaveToStorage;
};

/**
 * Fetches all notes from localforage and their embeddings.
 * (This function is unchanged)
 */
export const getAllNotesFromSystem = async (): Promise<NoteWithEmbedding[]> => {
  const keys = await localforage.keys();
  const noteKeys = keys.filter(key => key.startsWith(NOTE_STORAGE_PREFIX));
  const processedNotes: NoteWithEmbedding[] = [];

  for (const key of noteKeys) {
    const rawNoteData = await localforage.getItem<Note>(key);
    if (rawNoteData && rawNoteData.id) { 
      let tagsArray: string[] = [];
      const tags: unknown = rawNoteData.tags;

      if (typeof tags === 'string') {
        tagsArray = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
      } else if (Array.isArray(tags)) {
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
 * Deletes a note and its associated data (embedding, chunks, index) from localforage.
 */
export const deleteNoteFromSystem = async (noteId: string): Promise<void> => {
  await localforage.removeItem(noteId);
  await localforage.removeItem(`${EMBEDDING_NOTE_PREFIX}${noteId}`);
  // NEW: Remove the parent-to-chunk index
  await localforage.removeItem(`${NOTE_CHUNK_INDEX_PREFIX}${noteId}`);
  
  await removeNoteFromIndex(noteId);

  const allKeys = await localforage.keys();
  const chunkTextKeysToDelete = allKeys.filter(key =>
    key.startsWith(NOTE_CHUNK_TEXT_PREFIX) && key.includes(noteId)
  );
  const chunkEmbeddingKeysToDelete = allKeys.filter(key =>
    key.startsWith(EMBEDDING_NOTE_CHUNK_PREFIX) && key.includes(noteId)
  );

  for (const key of chunkTextKeysToDelete) {
    await localforage.removeItem(key);
  }
  for (const key of chunkEmbeddingKeysToDelete) {
    await localforage.removeItem(key);
  }
  console.log(`Deleted note ${noteId} and all associated data.`);
};

/**
 * Deletes all notes and their associated data from localforage.
 */
export const deleteAllNotesFromSystem = async (): Promise<void> => {
  const keys = await localforage.keys();
  const keysToDelete: string[] = [];

  for (const key of keys) {
    if (
      key.startsWith(NOTE_STORAGE_PREFIX) ||
      key.startsWith(EMBEDDING_NOTE_PREFIX) ||
      key.startsWith(NOTE_CHUNK_TEXT_PREFIX) ||
      key.startsWith(EMBEDDING_NOTE_CHUNK_PREFIX) ||
      // NEW: Add the index prefix to the deletion list
      key.startsWith(NOTE_CHUNK_INDEX_PREFIX)
    ) {
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    await localforage.removeItem(key);
  }
  
  console.log('All notes and associated data deleted.');
  await rebuildFullIndex();
};

/**
 * Gets a single note by ID, including its embedding.
 * (This function is unchanged)
 */
export const getNoteByIdFromSystem = async (noteId: string): Promise<NoteWithEmbedding | null> => {
    const rawNote = await localforage.getItem<Note>(noteId); 
    if (!rawNote) {
      return null;
    }

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
 * (This function is unchanged)
 */
export const deleteNotesFromSystem = async (noteIds: string[]): Promise<void> => {
  if (!noteIds || noteIds.length === 0) {
    return;
  }
  for (const noteId of noteIds) {
    await deleteNoteFromSystem(noteId);
  }
  console.log(`${noteIds.length} notes deleted from system.`);
};

/**
 * Exports multiple notes to Obsidian MD format and triggers download for each.
 * (This function is unchanged)
 */
export const exportNotesToObsidianMD = async (noteIds: string[]): Promise<{ successCount: number, errorCount: number, isZip: boolean }> => {
  // ... (This entire function's logic remains the same)
  if (!noteIds || noteIds.length === 0) {
    return { successCount: 0, errorCount: 0, isZip: false };
  }

  let successCount = 0;
  let errorCount = 0;
  const filesToZip: Record<string, Uint8Array> = {};

  for (const noteId of noteIds) {
    try {
      const note = await getNoteByIdFromSystem(noteId);
      if (!note) {
        errorCount++;
        continue;
      }

      let mdContent = '---\n';
      mdContent += `title: "${note.title.replace(/"/g, '\\\\"')}"\n`;
      if (note.url) mdContent += `source: "${note.url.replace(/"/g, '\\\\"')}"\n`;
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
      errorCount++;
    }
  }

  if (successCount === 0) {
    return { successCount: 0, errorCount, isZip: false };
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zipFilename = `Cognito-${timestamp}.zip`;
    const zippedContent = zipSync(filesToZip);
    const blob = new Blob([zippedContent], { type: 'application/zip' });
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onloadend = () => typeof reader.result === 'string' ? resolve(reader.result) : reject();
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    await new Promise<void>((resolve, reject) => {
      chrome.downloads.download({ url: dataUrl, filename: zipFilename, saveAs: false }, (id) => {
        if (chrome.runtime.lastError || id === undefined) {
          reject(chrome.runtime.lastError?.message || 'Download failed.');
        } else {
          resolve();
        }
      });
    });
    return { successCount, errorCount, isZip: true };
  } catch (zipError) {
    return { successCount: 0, errorCount: noteIds.length, isZip: false };
  }
};

// Note: The chat-related functions at the end of your original file are kept
// for compatibility, though they might be better placed in chatHistoryStorage.ts.
// These are unchanged.
export { deleteChatMessage, deleteAllChatMessages };