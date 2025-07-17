import localforage from 'localforage';
import {
  NOTE_STORAGE_PREFIX,
  EMBEDDING_NOTE_CHUNK_PREFIX,
  NOTE_CHUNK_TEXT_PREFIX,
  NOTE_CHUNK_INDEX_PREFIX,
  getAllNotesFromSystem,
} from './noteStorage';
import {
  ChatMessage,
  CHAT_STORAGE_PREFIX,
  EMBEDDING_CHAT_CHUNK_PREFIX,
  CHAT_CHUNK_TEXT_PREFIX,
  CHAT_CHUNK_INDEX_PREFIX,
  getAllChatMessages as getAllChatMessagesFromStorage,
} from './chatHistoryStorage';
import { chunkNoteContent, chunkChatMessageTurns, preprocessForEmbeddings } from './chunkingUtils';
import { generateEmbeddings, ensureEmbeddingServiceConfigured } from './embeddingUtils';
// MODIFIED: Import the new result types
import { NoteChunk, ChatChunk, ChatMessageInputForChunking, NoteChunkingResult, ChatChunkingResult } from '../types/chunkTypes';
import storage from './storageUtil';
import { Config } from '../types/config';

/**
 * Rebuilds embeddings and parent-to-chunk indexes for all notes and chat messages.
 */
export const rebuildAllEmbeddings = async (): Promise<{ notesProcessed: number, chatsProcessed: number, notesFailed: number, chatsFailed: number }> => {
  console.log("Starting full embedding and index rebuild process...");
  let notesProcessed = 0, chatsProcessed = 0, notesFailed = 0, chatsFailed = 0;
  let totalChunksToProcess = 0;
  let processedChunks = 0;

  try {
    await ensureEmbeddingServiceConfigured();
  } catch (error) {
    console.error("Embedding service not configured. Cannot rebuild embeddings.", error);
    throw new Error("Embedding service not configured. Please configure it first.");
  }

  const allNotes = await getAllNotesFromSystem();
  const allChats = await getAllChatMessagesFromStorage();

  // Calculate total chunks for progress bar
  allNotes.forEach(note => {
    const { chunks } = chunkNoteContent({ id: note.id, content: note.content, title: note.title, url: note.url, tags: note.tags });
    totalChunksToProcess += chunks.filter(chunk => preprocessForEmbeddings(chunk.content).length > 0).length;
  });
  allChats.forEach(chat => {
    const { chunks } = chunkChatMessageTurns({ id: chat.id, title: chat.title, turns: chat.turns });
    totalChunksToProcess += chunks.filter(chunk => preprocessForEmbeddings(chunk.content).length > 0).length;
  });

  const progressCallback = (processed: number, total: number) => {
    chrome.runtime.sendMessage({
      type: 'EMBEDDING_PROGRESS',
      payload: { processed, total, operation: 'rebuild' }
    });
  };

  // Process Notes
  for (const note of allNotes) {
    try {
      const { chunks: noteChunks, chunkIds } = chunkNoteContent({ id: note.id, content: note.content, title: note.title, url: note.url, tags: note.tags });
      const currentChunkIds = new Set(chunkIds);

      const allStorageKeys = await localforage.keys();
      const oldChunkTextKeys = allStorageKeys.filter(key => key.startsWith(NOTE_CHUNK_TEXT_PREFIX) && key.includes(note.id));
      const oldChunkEmbeddingKeys = allStorageKeys.filter(key => key.startsWith(EMBEDDING_NOTE_CHUNK_PREFIX) && key.includes(note.id));

      for (const oldKey of oldChunkTextKeys) {
        const chunkId = oldKey.substring(NOTE_CHUNK_TEXT_PREFIX.length);
        if (!currentChunkIds.has(chunkId)) {
          await localforage.removeItem(oldKey);
          await localforage.removeItem(`${EMBEDDING_NOTE_CHUNK_PREFIX}${chunkId}`);
        }
      }
      for (const oldEmbeddingKey of oldChunkEmbeddingKeys) {
        const chunkId = oldEmbeddingKey.substring(EMBEDDING_NOTE_CHUNK_PREFIX.length);
        if (!currentChunkIds.has(chunkId)) await localforage.removeItem(oldEmbeddingKey);
      }

      for (const chunk of noteChunks) await localforage.setItem(`${NOTE_CHUNK_TEXT_PREFIX}${chunk.id}`, chunk.content);
      await localforage.setItem(`${NOTE_CHUNK_INDEX_PREFIX}${note.id}`, chunkIds);

      if (noteChunks.length > 0) {
        const chunksWithContent = noteChunks.filter(c => preprocessForEmbeddings(c.content).length > 0);
        if (chunksWithContent.length > 0) {
            const chunkContents = chunksWithContent.map(chunk => preprocessForEmbeddings(chunk.content));
            const embeddings = await generateEmbeddings(chunkContents, 5, progressCallback, processedChunks, totalChunksToProcess);
            processedChunks += chunksWithContent.length;
            for (let i = 0; i < chunksWithContent.length; i++) {
                const chunk = chunksWithContent[i];
                const embedding = embeddings[i];
                if (embedding && embedding.length > 0) {
                    await localforage.setItem(`${EMBEDDING_NOTE_CHUNK_PREFIX}${chunk.id}`, embedding);
                } else {
                    await localforage.removeItem(`${EMBEDDING_NOTE_CHUNK_PREFIX}${chunk.id}`);
                }
            }
        }
      }
      notesProcessed++;
    } catch (e) {
      console.error(`Failed to rebuild embeddings for note ${note.id}:`, e);
      notesFailed++;
    }
  }

  // Process Chat Messages
  for (const chat of allChats) {
    try {
      const { chunks: chatChunks, chunkIds } = chunkChatMessageTurns({
        id: chat.id,
        title: chat.title,
        turns: chat.turns.map(turn => ({ role: turn.role, content: turn.content, timestamp: turn.timestamp }))
      });
      const currentChunkIds = new Set(chunkIds);

      const allStorageKeys = await localforage.keys();
      const oldChunkTextKeys = allStorageKeys.filter(key => key.startsWith(CHAT_CHUNK_TEXT_PREFIX) && key.includes(chat.id));
      const oldChunkEmbeddingKeys = allStorageKeys.filter(key => key.startsWith(EMBEDDING_CHAT_CHUNK_PREFIX) && key.includes(chat.id));

      for (const oldKey of oldChunkTextKeys) {
        const chunkId = oldKey.substring(CHAT_CHUNK_TEXT_PREFIX.length);
        if (!currentChunkIds.has(chunkId)) {
          await localforage.removeItem(oldKey);
          await localforage.removeItem(`${EMBEDDING_CHAT_CHUNK_PREFIX}${chunkId}`);
        }
      }
      for (const oldEmbeddingKey of oldChunkEmbeddingKeys) {
        const chunkId = oldEmbeddingKey.substring(EMBEDDING_CHAT_CHUNK_PREFIX.length);
        if (!currentChunkIds.has(chunkId)) await localforage.removeItem(oldEmbeddingKey);
      }

      for (const chunk of chatChunks) await localforage.setItem(`${CHAT_CHUNK_TEXT_PREFIX}${chunk.id}`, chunk.content);
      await localforage.setItem(`${CHAT_CHUNK_INDEX_PREFIX}${chat.id}`, chunkIds);

      if (chatChunks.length > 0) {
        const chunksWithContent = chatChunks.filter(c => preprocessForEmbeddings(c.content).length > 0);
        if (chunksWithContent.length > 0) {
            const chunkContents = chunksWithContent.map(chunk => preprocessForEmbeddings(chunk.content));
            const embeddings = await generateEmbeddings(chunkContents, 5, progressCallback, processedChunks, totalChunksToProcess);
            processedChunks += chunksWithContent.length;
            for (let i = 0; i < chunksWithContent.length; i++) {
                const chunk = chunksWithContent[i];
                const embedding = embeddings[i];
                if (embedding && embedding.length > 0) {
                    await localforage.setItem(`${EMBEDDING_CHAT_CHUNK_PREFIX}${chunk.id}`, embedding);
                } else {
                    await localforage.removeItem(`${EMBEDDING_CHAT_CHUNK_PREFIX}${chunk.id}`);
                }
            }
        }
      }
      chatsProcessed++;
    } catch (e) {
      console.error(`Failed to rebuild embeddings for chat ${chat.id}:`, e);
      chatsFailed++;
    }
  }

  console.log(`Embedding rebuild finished. Notes processed: ${notesProcessed}, Chats processed: ${chatsProcessed}, Notes failed: ${notesFailed}, Chats failed: ${chatsFailed}`);

  try {
    const configStr: string | null = await storage.getItem('config');
    let config: Config = configStr ? JSON.parse(configStr) : {};
    config = {
        ...config,
        rag: {
            ...config.rag,
            embeddingsLastRebuild: new Date().toLocaleString(),
        },
    };
    await storage.setItem('config', JSON.stringify(config));
  } catch (e) {
      console.error("Failed to update embeddingsLastRebuild timestamp in config:", e);
  }

  return { notesProcessed, chatsProcessed, notesFailed, chatsFailed };
};

/**
 * Updates embeddings only for notes and chat messages (chunks) that do not currently have them.
 */
export const updateMissingEmbeddings = async (): Promise<{ notesUpdated: number, chatsUpdated: number, notesFailed: number, chatsFailed: number }> => {
  console.log("Starting process to update missing embeddings...");
  let notesUpdated = 0, chatsUpdated = 0, notesFailed = 0, chatsFailed = 0;
  let totalChunksToProcess = 0;

  try {
    await ensureEmbeddingServiceConfigured();
  } catch (error) {
    console.error("Embedding service not configured. Cannot update embeddings.", error);
    throw new Error("Embedding service not configured. Please configure it first.");
  }

  const allNotes = await getAllNotesFromSystem();
  const allChats = await getAllChatMessagesFromStorage();
  let chunksToEmbed: (NoteChunk | ChatChunk)[] = [];

  for (const note of allNotes) {
    const { chunks: noteChunks } = chunkNoteContent({ id: note.id, content: note.content, title: note.title, url: note.url, tags: note.tags });
    for (const chunk of noteChunks) {
      await localforage.setItem(`${NOTE_CHUNK_TEXT_PREFIX}${chunk.id}`, chunk.content);
      if (!await localforage.getItem(`${EMBEDDING_NOTE_CHUNK_PREFIX}${chunk.id}`)) {
        chunksToEmbed.push(chunk);
      }
    }
  }

  for (const chat of allChats) {
    const { chunks: chatChunks } = chunkChatMessageTurns({ id: chat.id, title: chat.title, turns: chat.turns });
    for (const chunk of chatChunks) {
      await localforage.setItem(`${CHAT_CHUNK_TEXT_PREFIX}${chunk.id}`, chunk.content);
      if (!await localforage.getItem(`${EMBEDDING_CHAT_CHUNK_PREFIX}${chunk.id}`)) {
        chunksToEmbed.push(chunk);
      }
    }
  }

  const chunksWithContent = chunksToEmbed.filter(c => preprocessForEmbeddings(c.content).length > 0);
  totalChunksToProcess = chunksWithContent.length;

  if (totalChunksToProcess > 0) {
    console.log(`Found ${totalChunksToProcess} chunks missing embeddings. Generating...`);
    const chunkContents = chunksWithContent.map(c => preprocessForEmbeddings(c.content));
    const embeddings = await generateEmbeddings(chunkContents, 5, (processed, total) => {
      chrome.runtime.sendMessage({
        type: 'EMBEDDING_PROGRESS',
        payload: { processed, total, operation: 'update' }
      });
    }, 0, totalChunksToProcess);

    for (let i = 0; i < chunksWithContent.length; i++) {
      const chunk = chunksWithContent[i];
      const embedding = embeddings[i];
      const isNoteChunk = 'headingPath' in chunk || 'originalUrl' in chunk;
      const prefix = isNoteChunk ? EMBEDDING_NOTE_CHUNK_PREFIX : EMBEDDING_CHAT_CHUNK_PREFIX;
      
      if (embedding && embedding.length > 0) {
        await localforage.setItem(`${prefix}${chunk.id}`, embedding);
        if (isNoteChunk) {
          notesUpdated++;
        } else {
          chatsUpdated++;
        }
      } else {
        console.warn(`Failed to generate embedding for chunk ${chunk.id} during update.`);
        if (isNoteChunk) {
          notesFailed++;
        } else {
          chatsFailed++;
        }
      }
    }
  }

  console.log(`Missing embedding update finished. Notes updated: ${notesUpdated}, Chats updated: ${chatsUpdated}, Notes failed: ${notesFailed}, Chats failed: ${chatsFailed}`);

  try {
    const configStr: string | null = await storage.getItem('config');
    let config: Config = configStr ? JSON.parse(configStr) : {};
     config = {
        ...config,
        rag: {
            ...config.rag,
            embeddingsLastUpdate: new Date().toLocaleString(),
        },
    };
    await storage.setItem('config', JSON.stringify(config));
  } catch (e) {
      console.error("Failed to update embeddingsLastUpdate timestamp in config:", e);
  }

  return { notesUpdated, chatsUpdated, notesFailed, chatsFailed };
};