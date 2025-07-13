import localforage from 'localforage';
import {
  NOTE_STORAGE_PREFIX,
  EMBEDDING_NOTE_CHUNK_PREFIX,
  NOTE_CHUNK_TEXT_PREFIX,
  getAllNotesFromSystem,
  saveNoteInSystem, // May need a more targeted way if we want to avoid re-triggering full save logic
} from './noteStorage';
import {
  ChatMessage,
  CHAT_STORAGE_PREFIX,
  EMBEDDING_CHAT_CHUNK_PREFIX,
  CHAT_CHUNK_TEXT_PREFIX,
  getAllChatMessages as getAllChatMessagesFromStorage,
  saveChatMessage, // May need a more targeted way
} from './chatHistoryStorage';
import { chunkNoteContent, chunkChatMessageTurns } from './chunkingUtils';
import { generateEmbeddings, ensureEmbeddingServiceConfigured } from './embeddingUtils';
import { NoteChunk, ChatChunk, ChatMessageInputForChunking } from '../types/chunkTypes';
import storage from './storageUtil';
import { Config }
from '../types/config';

/**
 * Rebuilds embeddings for all notes and chat messages.
 * This function iterates through all notes and chat messages,
 * re-chunks them, generates new embeddings, and saves them.
 * Stale embeddings for deleted chunks are implicitly handled by the save functions if they clean up.
 */
export const rebuildAllEmbeddings = async (): Promise<{ notesProcessed: number, chatsProcessed: number, notesFailed: number, chatsFailed: number }> => {
  console.log("Starting full embedding rebuild process...");
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

  totalChunksToProcess += allNotes.reduce((acc, note) => acc + chunkNoteContent({ id: note.id, content: note.content, title: note.title, url: note.url, tags: note.tags }).length, 0);
  totalChunksToProcess += allChats.reduce((acc, chat) => acc + chunkChatMessageTurns({ id: chat.id, title: chat.title, turns: chat.turns }).length, 0);

  const progressCallback = (processedInBatch: number) => {
    processedChunks += processedInBatch;
    chrome.runtime.sendMessage({
      type: 'EMBEDDING_PROGRESS',
      payload: {
        processed: processedChunks,
        total: totalChunksToProcess,
        operation: 'rebuild'
      }
    });
  };

  // Process Notes
  try {
    console.log(`Found ${allNotes.length} notes to process for embedding rebuild.`);
    for (const note of allNotes) {
      try {
        console.log(`Rebuilding embeddings for note: ${note.id} - ${note.title}`);
        const noteChunks: NoteChunk[] = chunkNoteContent({ id: note.id, content: note.content, title: note.title, url: note.url, tags: note.tags });
        const currentChunkIds = new Set(noteChunks.map(chunk => chunk.id));

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

        if (noteChunks.length > 0) {
          const chunkContents = noteChunks.map(chunk => chunk.content);
          const embeddings = await generateEmbeddings(chunkContents, 5, progressCallback);
          for (let i = 0; i < noteChunks.length; i++) {
            const chunk = noteChunks[i];
            const embedding = embeddings[i];
            if (embedding && embedding.length > 0) {
              await localforage.setItem(`${EMBEDDING_NOTE_CHUNK_PREFIX}${chunk.id}`, embedding);
            } else {
              console.warn(`Failed to generate embedding for note chunk ${chunk.id} during rebuild. It will not be saved.`);
              await localforage.removeItem(`${EMBEDDING_NOTE_CHUNK_PREFIX}${chunk.id}`);
            }
          }
        }
        notesProcessed++;
      } catch (e) {
        console.error(`Failed to rebuild embeddings for note ${note.id}:`, e);
        notesFailed++;
      }
    }
  } catch (error) {
    console.error("Error processing notes during embedding rebuild:", error);
  }

  // Process Chat Messages
  try {
    console.log(`Found ${allChats.length} chats to process for embedding rebuild.`);
    for (const chat of allChats) {
      try {
        console.log(`Rebuilding embeddings for chat: ${chat.id} - ${chat.title}`);
        const chatInputForChunking: ChatMessageInputForChunking = { id: chat.id, title: chat.title, turns: chat.turns.map(turn => ({ role: turn.role, content: turn.content, timestamp: turn.timestamp })) };
        const chatChunks: ChatChunk[] = chunkChatMessageTurns(chatInputForChunking);
        const currentChunkIds = new Set(chatChunks.map(chunk => chunk.id));

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

        if (chatChunks.length > 0) {
          const chunkContents = chatChunks.map(chunk => chunk.content);
          const embeddings = await generateEmbeddings(chunkContents, 5, progressCallback);
          for (let i = 0; i < chatChunks.length; i++) {
            const chunk = chatChunks[i];
            const embedding = embeddings[i];
            if (embedding && embedding.length > 0) {
              await localforage.setItem(`${EMBEDDING_CHAT_CHUNK_PREFIX}${chunk.id}`, embedding);
            } else {
              console.warn(`Failed to generate embedding for chat chunk ${chunk.id} during rebuild. It will not be saved.`);
              await localforage.removeItem(`${EMBEDDING_CHAT_CHUNK_PREFIX}${chunk.id}`);
            }
          }
        }
        chatsProcessed++;
      } catch (e) {
        console.error(`Failed to rebuild embeddings for chat ${chat.id}:`, e);
        chatsFailed++;
      }
    }
  } catch (error) {
    console.error("Error processing chat messages during embedding rebuild:", error);
  }

  console.log(`Embedding rebuild finished. Notes processed: ${notesProcessed}, Chats processed: ${chatsProcessed}, Notes failed: ${notesFailed}, Chats failed: ${chatsFailed}`);

  // Update timestamp in config
  try {
    const configStr: string | null = await storage.getItem('config');
    let config: Config = configStr ? JSON.parse(configStr) : {}; // Provide a default if null
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
  let processedChunks = 0;

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
    const noteChunks = chunkNoteContent({ id: note.id, content: note.content, title: note.title, url: note.url, tags: note.tags });
    for (const chunk of noteChunks) {
      await localforage.setItem(`${NOTE_CHUNK_TEXT_PREFIX}${chunk.id}`, chunk.content);
      if (!await localforage.getItem(`${EMBEDDING_NOTE_CHUNK_PREFIX}${chunk.id}`)) {
        chunksToEmbed.push(chunk);
      }
    }
  }

  for (const chat of allChats) {
    const chatChunks = chunkChatMessageTurns({ id: chat.id, title: chat.title, turns: chat.turns });
    for (const chunk of chatChunks) {
      await localforage.setItem(`${CHAT_CHUNK_TEXT_PREFIX}${chunk.id}`, chunk.content);
      if (!await localforage.getItem(`${EMBEDDING_CHAT_CHUNK_PREFIX}${chunk.id}`)) {
        chunksToEmbed.push(chunk);
      }
    }
  }

  totalChunksToProcess = chunksToEmbed.length;

  if (totalChunksToProcess > 0) {
    console.log(`Found ${totalChunksToProcess} chunks missing embeddings. Generating...`);
    const chunkContents = chunksToEmbed.map(c => c.content);
    const embeddings = await generateEmbeddings(chunkContents, 5, (processedInBatch) => {
      processedChunks += processedInBatch;
      chrome.runtime.sendMessage({
        type: 'EMBEDDING_PROGRESS',
        payload: {
          processed: processedChunks,
          total: totalChunksToProcess,
          operation: 'update'
        }
      });
    });

    for (let i = 0; i < chunksToEmbed.length; i++) {
      const chunk = chunksToEmbed[i];
      const embedding = embeddings[i];
      const prefix = 'noteId' in chunk ? EMBEDDING_NOTE_CHUNK_PREFIX : EMBEDDING_CHAT_CHUNK_PREFIX;
      if (embedding && embedding.length > 0) {
        await localforage.setItem(`${prefix}${chunk.id}`, embedding);
        if ('noteId' in chunk) notesUpdated++; else chatsUpdated++;
      } else {
        console.warn(`Failed to generate embedding for chunk ${chunk.id} during update.`);
        if ('noteId' in chunk) notesFailed++; else chatsFailed++;
      }
    }
  }


  console.log(`Missing embedding update finished. Notes updated: ${notesUpdated}, Chats updated: ${chatsUpdated}, Notes failed: ${notesFailed}, Chats failed: ${chatsFailed}`);

  // Update timestamp in config
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
