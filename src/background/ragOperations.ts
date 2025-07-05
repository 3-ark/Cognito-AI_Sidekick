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
  let notesProcessed = 0;
  let chatsProcessed = 0;
  let notesFailed = 0;
  let chatsFailed = 0;

  try {
    await ensureEmbeddingServiceConfigured();
  } catch (error) {
    console.error("Embedding service not configured. Cannot rebuild embeddings.", error);
    throw new Error("Embedding service not configured. Please configure it first.");
  }

  // Process Notes
  try {
    const allNotes = await getAllNotesFromSystem();
    console.log(`Found ${allNotes.length} notes to process for embedding rebuild.`);
    for (const note of allNotes) {
      try {
        console.log(`Rebuilding embeddings for note: ${note.id} - ${note.title}`);
        // 1. Chunk the note
        const noteChunks: NoteChunk[] = chunkNoteContent({
          id: note.id,
          content: note.content,
          title: note.title,
          url: note.url,
          tags: note.tags,
        });

        const currentChunkIds = new Set(noteChunks.map(chunk => chunk.id));

        // 2. Clean up old chunk texts and embeddings for this note specifically
        const allStorageKeys = await localforage.keys();
        const oldChunkTextKeys = allStorageKeys.filter(key =>
          key.startsWith(NOTE_CHUNK_TEXT_PREFIX) && key.includes(note.id)
        );
        const oldChunkEmbeddingKeys = allStorageKeys.filter(key =>
          key.startsWith(EMBEDDING_NOTE_CHUNK_PREFIX) && key.includes(note.id)
        );

        for (const oldKey of oldChunkTextKeys) {
          const chunkId = oldKey.substring(NOTE_CHUNK_TEXT_PREFIX.length);
          if (!currentChunkIds.has(chunkId)) {
            await localforage.removeItem(oldKey);
            await localforage.removeItem(`${EMBEDDING_NOTE_CHUNK_PREFIX}${chunkId}`);
          }
        }
        for (const oldEmbeddingKey of oldChunkEmbeddingKeys) {
          const chunkId = oldEmbeddingKey.substring(EMBEDDING_NOTE_CHUNK_PREFIX.length);
          if (!currentChunkIds.has(chunkId)) {
            await localforage.removeItem(oldEmbeddingKey);
          }
        }

        // 3. Save new chunk texts
        for (const chunk of noteChunks) {
          await localforage.setItem(`${NOTE_CHUNK_TEXT_PREFIX}${chunk.id}`, chunk.content);
        }

        // 4. Generate and save new embeddings
        if (noteChunks.length > 0) {
          const chunkContents = noteChunks.map(chunk => chunk.content);
          const embeddings = await generateEmbeddings(chunkContents);
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
    // This would be a more general error, like failing to get all notes.
  }

  // Process Chat Messages
  try {
    const allChats = await getAllChatMessagesFromStorage();
    console.log(`Found ${allChats.length} chats to process for embedding rebuild.`);
    for (const chat of allChats) {
      try {
        console.log(`Rebuilding embeddings for chat: ${chat.id} - ${chat.title}`);
        // 1. Chunk the chat
        const chatInputForChunking: ChatMessageInputForChunking = {
          id: chat.id,
          title: chat.title,
          turns: chat.turns.map(turn => ({
            role: turn.role,
            content: turn.content,
            timestamp: turn.timestamp,
          })),
        };
        const chatChunks: ChatChunk[] = chunkChatMessageTurns(chatInputForChunking);
        const currentChunkIds = new Set(chatChunks.map(chunk => chunk.id));

        // 2. Clean up old chunk texts and embeddings for this chat
        const allStorageKeys = await localforage.keys();
        const oldChunkTextKeys = allStorageKeys.filter(key =>
          key.startsWith(CHAT_CHUNK_TEXT_PREFIX) && key.includes(chat.id)
        );
        const oldChunkEmbeddingKeys = allStorageKeys.filter(key =>
          key.startsWith(EMBEDDING_CHAT_CHUNK_PREFIX) && key.includes(chat.id)
        );
        for (const oldKey of oldChunkTextKeys) {
          const chunkId = oldKey.substring(CHAT_CHUNK_TEXT_PREFIX.length);
          if (!currentChunkIds.has(chunkId)) {
            await localforage.removeItem(oldKey);
            await localforage.removeItem(`${EMBEDDING_CHAT_CHUNK_PREFIX}${chunkId}`);
          }
        }
         for (const oldEmbeddingKey of oldChunkEmbeddingKeys) {
          const chunkId = oldEmbeddingKey.substring(EMBEDDING_CHAT_CHUNK_PREFIX.length);
          if (!currentChunkIds.has(chunkId)) {
            await localforage.removeItem(oldEmbeddingKey);
          }
        }

        // 3. Save new chunk texts
        for (const chunk of chatChunks) {
          await localforage.setItem(`${CHAT_CHUNK_TEXT_PREFIX}${chunk.id}`, chunk.content);
        }

        // 4. Generate and save new embeddings
        if (chatChunks.length > 0) {
          const chunkContents = chatChunks.map(chunk => chunk.content);
          const embeddings = await generateEmbeddings(chunkContents);
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
  let notesUpdated = 0;
  let chatsUpdated = 0;
  let notesFailed = 0;
  let chatsFailed = 0;

  try {
    await ensureEmbeddingServiceConfigured();
  } catch (error) {
    console.error("Embedding service not configured. Cannot update embeddings.", error);
    throw new Error("Embedding service not configured. Please configure it first.");
  }

  // Process Notes
  try {
    const allNotes = await getAllNotesFromSystem();
    console.log(`Found ${allNotes.length} notes to check for missing embeddings.`);
    for (const note of allNotes) {
      let noteActuallyUpdated = false;
      try {
        const noteChunks: NoteChunk[] = chunkNoteContent({
          id: note.id,
          content: note.content,
          title: note.title,
          url: note.url,
          tags: note.tags,
        });

        if (noteChunks.length > 0) {
          const chunksToEmbed: NoteChunk[] = [];
          const chunkContentsToEmbed: string[] = [];

          for (const chunk of noteChunks) {
            // Save chunk text if not already there (rebuild does this, update should ensure it too)
            // This is important if a note was saved in manual mode and then update is hit.
            await localforage.setItem(`${NOTE_CHUNK_TEXT_PREFIX}${chunk.id}`, chunk.content);

            const existingEmbedding = await localforage.getItem(`${EMBEDDING_NOTE_CHUNK_PREFIX}${chunk.id}`);
            if (!existingEmbedding) {
              chunksToEmbed.push(chunk);
              chunkContentsToEmbed.push(chunk.content);
            }
          }

          if (chunksToEmbed.length > 0) {
            console.log(`Found ${chunksToEmbed.length} chunks missing embeddings for note ${note.id}. Generating...`);
            const embeddings = await generateEmbeddings(chunkContentsToEmbed);
            for (let i = 0; i < chunksToEmbed.length; i++) {
              const chunk = chunksToEmbed[i];
              const embedding = embeddings[i];
              if (embedding && embedding.length > 0) {
                await localforage.setItem(`${EMBEDDING_NOTE_CHUNK_PREFIX}${chunk.id}`, embedding);
                noteActuallyUpdated = true;
              } else {
                console.warn(`Failed to generate embedding for note chunk ${chunk.id} during update. It will not be saved.`);
              }
            }
          }
        }
        if (noteActuallyUpdated) notesUpdated++;
      } catch (e) {
        console.error(`Failed to update embeddings for note ${note.id}:`, e);
        notesFailed++;
      }
    }
  } catch (error) {
    console.error("Error processing notes during missing embedding update:", error);
  }

  // Process Chat Messages
  try {
    const allChats = await getAllChatMessagesFromStorage();
    console.log(`Found ${allChats.length} chats to check for missing embeddings.`);
    for (const chat of allChats) {
      let chatActuallyUpdated = false;
      try {
        const chatInputForChunking: ChatMessageInputForChunking = {
          id: chat.id,
          title: chat.title,
          turns: chat.turns.map(turn => ({
            role: turn.role,
            content: turn.content,
            timestamp: turn.timestamp,
          })),
        };
        const chatChunks: ChatChunk[] = chunkChatMessageTurns(chatInputForChunking);

        if (chatChunks.length > 0) {
          const chunksToEmbed: ChatChunk[] = [];
          const chunkContentsToEmbed: string[] = [];

          for (const chunk of chatChunks) {
            await localforage.setItem(`${CHAT_CHUNK_TEXT_PREFIX}${chunk.id}`, chunk.content);

            const existingEmbedding = await localforage.getItem(`${EMBEDDING_CHAT_CHUNK_PREFIX}${chunk.id}`);
            if (!existingEmbedding) {
              chunksToEmbed.push(chunk);
              chunkContentsToEmbed.push(chunk.content);
            }
          }

          if (chunksToEmbed.length > 0) {
            console.log(`Found ${chunksToEmbed.length} chunks missing embeddings for chat ${chat.id}. Generating...`);
            const embeddings = await generateEmbeddings(chunkContentsToEmbed);
            for (let i = 0; i < chunksToEmbed.length; i++) {
              const chunk = chunksToEmbed[i];
              const embedding = embeddings[i];
              if (embedding && embedding.length > 0) {
                await localforage.setItem(`${EMBEDDING_CHAT_CHUNK_PREFIX}${chunk.id}`, embedding);
                chatActuallyUpdated = true;
              } else {
                console.warn(`Failed to generate embedding for chat chunk ${chunk.id} during update. It will not be saved.`);
              }
            }
          }
        }
        if (chatActuallyUpdated) chatsUpdated++;
      } catch (e) {
        console.error(`Failed to update embeddings for chat ${chat.id}:`, e);
        chatsFailed++;
      }
    }
  } catch (error) {
    console.error("Error processing chat messages during missing embedding update:", error);
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
