import localforage from 'localforage';
import { strToU8, zipSync } from 'fflate';
import { Note, NoteWithEmbedding } from '../types/noteTypes';
import type { NoteChunk } from '../types/chunkTypes'; // Consider importing as type
import { removeNoteFromIndex, removeChatMessageFromIndex, rebuildFullIndex } from './searchUtils';
import { CHAT_STORAGE_PREFIX } from './chatHistoryStorage';
import { chunkNoteContent } from './chunkingUtils';
import { generateEmbeddings, ensureEmbeddingServiceConfigured } from './embeddingUtils';
import storage from './storageUtil'; // Added for config access
import { Config } from '../types/config'; // Added for config type

export const EMBEDDING_NOTE_PREFIX = 'embedding_note_';
export const EMBEDDING_CHAT_PREFIX = 'embedding_chat_'; // Used for whole chat embeddings, distinct from chat CHUNK embeddings
export const EMBEDDING_NOTE_CHUNK_PREFIX = 'embedding_notechunk_';
export const NOTE_CHUNK_TEXT_PREFIX = 'notechunktext_'; // For storing text of note chunks
export const NOTE_STORAGE_PREFIX = 'note_'; // The single, correct export

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
  // This "whole note" embedding might be legacy or used by features other than chunk-based RAG.
  if (noteData.embedding && noteData.embedding.length > 0) {
    await localforage.setItem(`${EMBEDDING_NOTE_PREFIX}${noteId}`, noteData.embedding);
  } else {
    // If noteData.embedding is undefined, null, or an empty array,
    // remove any existing embedding for this note to prevent orphans.
    await localforage.removeItem(`${EMBEDDING_NOTE_PREFIX}${noteId}`);
  }

  // After saving the note, update the search index - THIS IS NOW HANDLED BY THE CALLER (background/index.ts)
  // await indexSingleNote(noteToSaveToStorage);


// --- New Chunking and Embedding Logic ---
  try {
    // Load config to check embeddingMode
    const configStr: string | null = await storage.getItem('config');
    const config: Config | null = configStr ? JSON.parse(configStr) : null;
    const embeddingMode = config?.rag?.embeddingMode ?? 'manual';

    // 1. Generate chunks from the note content (always do this as it's cheap)
    const currentChunks: NoteChunk[] = chunkNoteContent({
      id: noteToSaveToStorage.id,
      content: noteToSaveToStorage.content,
      title: noteToSaveToStorage.title,
      url: noteToSaveToStorage.url,
      tags: noteToSaveToStorage.tags,
    });

    const currentChunkIds = new Set(currentChunks.map(chunk => chunk.id));
    const allStorageKeys = await localforage.keys();

    // 2. Clean up stale chunk texts and embeddings
    const oldChunkTextKeys = allStorageKeys.filter(key => 
      key.startsWith(NOTE_CHUNK_TEXT_PREFIX) && key.includes(noteToSaveToStorage.id)
    );
    const oldChunkEmbeddingKeys = allStorageKeys.filter(key =>
      key.startsWith(EMBEDDING_NOTE_CHUNK_PREFIX) && key.includes(noteToSaveToStorage.id)
    );

    for (const oldKey of oldChunkTextKeys) {
      const chunkId = oldKey.substring(NOTE_CHUNK_TEXT_PREFIX.length);
      if (!currentChunkIds.has(chunkId)) {
        await localforage.removeItem(oldKey);
        // Also remove the corresponding embedding if it exists
        await localforage.removeItem(`${EMBEDDING_NOTE_CHUNK_PREFIX}${chunkId}`);
        console.log(`Removed stale note chunk text and embedding for chunk ID: ${chunkId}`);
      }
    }
    // Clean up any orphaned embeddings that might not have a corresponding text key (less likely but good practice)
    for (const oldEmbeddingKey of oldChunkEmbeddingKeys) {
        const chunkId = oldEmbeddingKey.substring(EMBEDDING_NOTE_CHUNK_PREFIX.length);
        if (!currentChunkIds.has(chunkId)) {
            await localforage.removeItem(oldEmbeddingKey);
            console.log(`Removed stale note chunk embedding (orphan check) for chunk ID: ${chunkId}`);
        }
    }

    // 3. Save texts for current chunks
    for (const chunk of currentChunks) {
      await localforage.setItem(`${NOTE_CHUNK_TEXT_PREFIX}${chunk.id}`, chunk.content);
    }

    // 4. Generate and save embeddings for current chunks (conditional on embeddingMode)
    if (embeddingMode === 'automatic') {
      if (currentChunks.length > 0) {
        // Ensure embedding service is configured before proceeding with automatic embedding
        try {
            await ensureEmbeddingServiceConfigured();
        } catch (configError) {
            console.warn(`Embedding service not configured. Skipping automatic embedding for note ${noteToSaveToStorage.id}. Error: ${configError}`);
            // If service isn't configured, we shouldn't proceed to generateEmbeddings
            // We still want to save the note and chunks (texts), just not embeddings.
            // So, we effectively 'skip' embedding generation for this save if service is not setup.
            // The 'error' from ensureEmbeddingServiceConfigured is treated as a condition to skip embedding. The embedding service configuration is checked internally by ensureEmbeddingServiceConfigured.
        }
        // If ensureEmbeddingServiceConfigured did not throw, it means the service is ready.
        if (config?.rag?.embedding_model) { // Check if service is configured
            const chunkContents = currentChunks.map(chunk => chunk.content);
            const embeddings = await generateEmbeddings(chunkContents); // Assuming batching is handled inside

            for (let i = 0; i < currentChunks.length; i++) {
                const chunk = currentChunks[i];
                const embedding = embeddings[i];
                if (embedding && embedding.length > 0) {
                    await localforage.setItem(`${EMBEDDING_NOTE_CHUNK_PREFIX}${chunk.id}`, embedding);
                } else {
                    console.warn(`Failed to generate embedding for note chunk ${chunk.id}. It will not be saved.`);
                    // Ensure any old embedding for this chunk ID is removed if generation failed
                    await localforage.removeItem(`${EMBEDDING_NOTE_CHUNK_PREFIX}${chunk.id}`);
                }
            }
            console.log(`Automatically processed and saved ${currentChunks.length} chunk embeddings for note ${noteToSaveToStorage.id}`);
        } else {
            console.log(`Automatic embedding skipped for note ${noteToSaveToStorage.id} as embedding service is not fully configured.`);
        }
      }
    } else {
      console.log(`Manual embedding mode: Skipped embedding generation for note ${noteToSaveToStorage.id}. Chunks saved without embeddings.`);
      // Optionally, one might want to remove existing embeddings if mode is manual and note is updated,
      // but the current requirement is to just skip generation. Rebuild/Update will handle population.
    }
    console.log(`Processed and saved ${currentChunks.length} chunk texts for note ${noteToSaveToStorage.id}. Embedding mode: ${embeddingMode}`);
  } catch (error) {
    console.error(`Error during chunking or conditional embedding generation for note ${noteToSaveToStorage.id}:`, error);
    // Allow note saving to succeed even if chunk processing fails, as per requirements.
  }
  // --- End of New Chunking and Embedding Logic ---

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
  await removeNoteFromIndex(noteId); // <-- Ensure index is updated

  // Also, find and remove all associated chunk texts and embeddings
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
  console.log(`Deleted ${chunkTextKeysToDelete.length} text chunks and ${chunkEmbeddingKeysToDelete.length} embedding chunks for note ${noteId}.`);
};

/**
 * Deletes all notes and their embeddings from localforage.
 */
export const deleteAllNotesFromSystem = async (): Promise<void> => {
  const keys = await localforage.keys();
  const noteKeysToDelete: string[] = [];
  const embeddingKeysToDelete: string[] = [];
  const chunkTextKeysToDelete: string[] = [];
  const chunkEmbeddingKeysToDelete: string[] = [];

  for (const key of keys) {
    if (key.startsWith(NOTE_STORAGE_PREFIX)) {
      noteKeysToDelete.push(key);
    } else if (key.startsWith(EMBEDDING_NOTE_PREFIX)) {
      embeddingKeysToDelete.push(key);
    } else if (key.startsWith(NOTE_CHUNK_TEXT_PREFIX)) {
      chunkTextKeysToDelete.push(key);
    } else if (key.startsWith(EMBEDDING_NOTE_CHUNK_PREFIX)) {
      chunkEmbeddingKeysToDelete.push(key);
    }
  }

  for (const key of noteKeysToDelete) {
    await localforage.removeItem(key);
  }
  for (const key of embeddingKeysToDelete) {
    await localforage.removeItem(key);
  }
  for (const key of chunkTextKeysToDelete) {
    await localforage.removeItem(key);
  }
  for (const key of chunkEmbeddingKeysToDelete) {
    await localforage.removeItem(key);
  }
  console.log('All notes, their embeddings, and all associated chunks deleted from system.');
  await rebuildFullIndex(); // <-- Rebuild index after bulk delete
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
export const exportNotesToObsidianMD = async (noteIds: string[]): Promise<{ successCount: number, errorCount: number, isZip: boolean }> => {
  if (!noteIds || noteIds.length === 0) {
    console.log('No note IDs provided for export.');
    return { successCount: 0, errorCount: 0, isZip: false };
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
    return { successCount: 0, errorCount, isZip: false };
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zipFilename = `Cognito-${timestamp}.zip`;

    // Create the zip file content
    const zippedContent = zipSync(filesToZip);

    // Convert Uint8Array to Blob
    const blob = new Blob([zippedContent], { type: 'application/zip' });

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
        saveAs: false
      }, (downloadId) => {
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
    return { successCount, errorCount, isZip: true };
  } catch (zipError) {
    console.error('Failed to create or download zip file:', zipError);
    // If zipping fails, we still have the individual error counts, but explicitly state zip failed.
    return { successCount: 0, errorCount: noteIds.length, isZip: false }; // Treat all as errors if zip fails
  }
};

/**
 * Deletes a chat message and its embedding from localforage by its ID.
 */
export const deleteChatMessage = async (fullChatId: string): Promise<void> => {
  if (!fullChatId.startsWith(CHAT_STORAGE_PREFIX)) {
    console.warn(`deleteChatMessage called with an ID that does not have the correct prefix: ${fullChatId}. Attempting to delete anyway.`);
  }
  await localforage.removeItem(fullChatId);
  await localforage.removeItem(`${EMBEDDING_CHAT_PREFIX}${fullChatId}`);
  console.log('Chat message and its embedding deleted from system:', fullChatId);
  await removeChatMessageFromIndex(fullChatId); // <-- Ensure index is updated
};

/**
 * Deletes all chat messages and their embeddings from localforage.
 */
export const deleteAllChatMessages = async (): Promise<void> => {
  const keys = await localforage.keys();
  const chatMessageKeysToDelete: string[] = [];
  const embeddingKeysToDelete: string[] = [];

  for (const key of keys) {
    if (key.startsWith(CHAT_STORAGE_PREFIX)) {
      chatMessageKeysToDelete.push(key);
    } else if (key.startsWith(EMBEDDING_CHAT_PREFIX)) {
      embeddingKeysToDelete.push(key);
    }
  }

  for (const key of chatMessageKeysToDelete) {
    await localforage.removeItem(key);
  }
  for (const key of embeddingKeysToDelete) {
    await localforage.removeItem(key);
  }
  console.log('All chat messages and their embeddings deleted from system.');
  await rebuildFullIndex(); // <-- Rebuild index after bulk delete
};
