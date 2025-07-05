import localforage from 'localforage';
import { rebuildFullIndex, removeChatMessageFromIndex } from './searchUtils';
import { ChatChunk, ChatMessageInputForChunking } from '../types/chunkTypes'; // Added ChatChunk and ChatMessageInputForChunking
import { chunkChatMessageTurns } from './chunkingUtils'; // Added
import { generateEmbeddings, ensureEmbeddingServiceConfigured } from './embeddingUtils'; // Added
import storage from './storageUtil'; // Added for config access
import { Config } from '../types/config'; // Added for config type

// Interfaces
export interface MessageTurn {
  role: 'user' | 'assistant' | 'tool';
  status: 'complete' | 'streaming' | 'error' | 'cancelled' | 'awaiting_tool_results';
  content: string;
  webDisplayContent?: string;
  tool_call_id?: string;
  timestamp: number;
  name?: string;
  tool_calls?: {
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }[];
}

export interface ChatMessage {
  id: string;
  last_updated: number;
  title?: string;
  model?: string;
  turns: MessageTurn[];
  chatMode?: string;
  noteContentUsed?: string;
  useNoteActive?: boolean;
  webMode?: string;
}

export interface ChatMessageWithEmbedding extends ChatMessage {
  embedding?: number[];
}

// Constants
export const CHAT_STORAGE_PREFIX = 'chat_';
export const EMBEDDING_CHAT_PREFIX = 'embedding_chat_'; // Used for whole chat embeddings
export const EMBEDDING_CHAT_CHUNK_PREFIX = 'embedding_chatchunk_';
export const CHAT_CHUNK_TEXT_PREFIX = 'chatchunktext_'; // For storing text of chat chunks

// Utility Functions
export const generateChatId = (): string => `${CHAT_STORAGE_PREFIX}${Date.now()}_${Math.random().toString(16).slice(2)}`;

/**
 * Saves a new chat message or updates an existing one in localforage.
 * Embedding is saved separately.
 */
export const saveChatMessage = async (chatMessageData: Partial<Omit<ChatMessage, 'id' | 'last_updated'>> & { id?: string; turns: MessageTurn[]; embedding?: number[] }): Promise<ChatMessage> => {
  const now = Date.now();
  const chatId = chatMessageData.id || generateChatId();
  
  // Ensure the ID starts with the prefix if it's provided but doesn't have it
  const fullChatId = chatId.startsWith(CHAT_STORAGE_PREFIX) ? chatId : `${CHAT_STORAGE_PREFIX}${chatId.replace(/^chat_/, '')}`;


  const chatToSaveToStorage: ChatMessage = { // This is the object that will be returned and indexed
    id: fullChatId,
    title: chatMessageData.title || `Chat - ${new Date(now).toLocaleDateString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    turns: chatMessageData.turns,
    last_updated: now, // This will be the source of truth for last_updated for new chats
    model: chatMessageData.model,
    chatMode: chatMessageData.chatMode,
    noteContentUsed: chatMessageData.noteContentUsed,
    useNoteActive: chatMessageData.useNoteActive,
    webMode: chatMessageData.webMode,
  };

  await localforage.setItem(fullChatId, chatToSaveToStorage);

  // This "whole chat" embedding might be legacy or used by features other than chunk-based RAG.
  if (chatMessageData.embedding && chatMessageData.embedding.length > 0) {
    await localforage.setItem(`${EMBEDDING_CHAT_PREFIX}${fullChatId}`, chatMessageData.embedding);
  } else {
    await localforage.removeItem(`${EMBEDDING_CHAT_PREFIX}${fullChatId}`);
  }

  // --- New Chunking and Embedding Logic for Chat Messages ---
  try {
    // Load config to check embeddingMode
    const configStr: string | null = await storage.getItem('config');
    const config: Config | null = configStr ? JSON.parse(configStr) : null;
    const embeddingMode = config?.rag?.embeddingMode ?? 'manual';

    // 1. Prepare input for chunking (always do this)
    const chatInputForChunking: ChatMessageInputForChunking = {
      id: chatToSaveToStorage.id,
      title: chatToSaveToStorage.title,
      turns: chatToSaveToStorage.turns.map(turn => ({ // Ensure turn structure matches input type
        role: turn.role,
        content: turn.content,
        timestamp: turn.timestamp,
      })),
    };
    const currentChunks: ChatChunk[] = chunkChatMessageTurns(chatInputForChunking);
    const currentChunkIds = new Set(currentChunks.map(chunk => chunk.id));
    const allStorageKeys = await localforage.keys();

    // 2. Clean up stale chat chunk texts and embeddings
    const oldChunkTextKeys = allStorageKeys.filter(key =>
      key.startsWith(CHAT_CHUNK_TEXT_PREFIX) && key.includes(chatToSaveToStorage.id) // Check parentId
    );
    const oldChunkEmbeddingKeys = allStorageKeys.filter(key =>
      key.startsWith(EMBEDDING_CHAT_CHUNK_PREFIX) && key.includes(chatToSaveToStorage.id) // Check parentId
    );

    for (const oldKey of oldChunkTextKeys) {
      // Extract chunkId from key: chatchunktext_<parentId>_<turnIndex>_<timestamp>_<role>
      // A simple check is if the currentChunkIds (which are full chunk IDs) does not contain the ID derived from oldKey
      const chunkId = oldKey.substring(CHAT_CHUNK_TEXT_PREFIX.length);
      if (!currentChunkIds.has(chunkId)) {
        await localforage.removeItem(oldKey);
        await localforage.removeItem(`${EMBEDDING_CHAT_CHUNK_PREFIX}${chunkId}`);
        console.log(`Removed stale chat chunk text and embedding for chunk ID: ${chunkId}`);
      }
    }
     for (const oldEmbeddingKey of oldChunkEmbeddingKeys) {
        const chunkId = oldEmbeddingKey.substring(EMBEDDING_CHAT_CHUNK_PREFIX.length);
        if (!currentChunkIds.has(chunkId)) {
            await localforage.removeItem(oldEmbeddingKey);
            console.log(`Removed stale chat chunk embedding (orphan check) for chunk ID: ${chunkId}`);
        }
    }


    // 3. Save texts for current chat chunks
    for (const chunk of currentChunks) {
      await localforage.setItem(`${CHAT_CHUNK_TEXT_PREFIX}${chunk.id}`, chunk.content);
    }

    // 4. Generate and save embeddings for current chat chunks (conditional on embeddingMode)
    if (embeddingMode === 'automatic') {
      if (currentChunks.length > 0) {
        // Ensure embedding service is configured before proceeding
        try {
            await ensureEmbeddingServiceConfigured();
        } catch (configError) {
            console.warn(`Embedding service not configured. Skipping automatic embedding for chat ${chatToSaveToStorage.id}. Error: ${configError}`);
        }

        if (config?.rag?.embedding_model) { // Check if service is configured
            const chunkContents = currentChunks.map(chunk => chunk.content);
            const embeddings = await generateEmbeddings(chunkContents);

            for (let i = 0; i < currentChunks.length; i++) {
                const chunk = currentChunks[i];
                const embedding = embeddings[i];
                if (embedding && embedding.length > 0) {
                    await localforage.setItem(`${EMBEDDING_CHAT_CHUNK_PREFIX}${chunk.id}`, embedding);
                } else {
                    console.warn(`Failed to generate embedding for chat chunk ${chunk.id}. It will not be saved.`);
                    await localforage.removeItem(`${EMBEDDING_CHAT_CHUNK_PREFIX}${chunk.id}`);
                }
            }
            console.log(`Automatically processed and saved ${currentChunks.length} chunk embeddings for chat ${chatToSaveToStorage.id}`);
        } else {
            console.log(`Automatic embedding skipped for chat ${chatToSaveToStorage.id} as embedding service is not fully configured.`);
        }
      }
    } else {
      console.log(`Manual embedding mode: Skipped embedding generation for chat ${chatToSaveToStorage.id}. Chunks saved without embeddings.`);
    }
    console.log(`Processed and saved ${currentChunks.length} chunk texts for chat ${chatToSaveToStorage.id}. Embedding mode: ${embeddingMode}`);
  } catch (error) {
    console.error(`Error during chunking or conditional embedding generation for chat ${chatToSaveToStorage.id}:`, error);
    // Allow chat saving to succeed even if chunk processing fails.
  }
  // --- End of New Chunking and Embedding Logic ---
  
  return chatToSaveToStorage; 
};

/**
 * Fetches all chat messages from localforage and their embeddings.
 */
export const getAllChatMessages = async (): Promise<ChatMessageWithEmbedding[]> => {
  const keys = await localforage.keys();
  const chatKeys = keys.filter(key => key.startsWith(CHAT_STORAGE_PREFIX));
  const processedChats: ChatMessageWithEmbedding[] = [];

  for (const key of chatKeys) {
    const rawChatData = await localforage.getItem<ChatMessage>(key);
    if (rawChatData && rawChatData.id) {
      const embedding = await localforage.getItem<number[]>(`${EMBEDDING_CHAT_PREFIX}${rawChatData.id}`);
      processedChats.push({ ...rawChatData, embedding: embedding || undefined });
    }
  }
  return processedChats.sort((a, b) => b.last_updated - a.last_updated);
};

/**
 * Deletes a chat message and its embedding from localforage by its ID.
 * The ID provided should be the full key (e.g., "chat_12345").
 */
export const deleteChatMessage = async (fullChatId: string): Promise<void> => {
  if (!fullChatId.startsWith(CHAT_STORAGE_PREFIX)) {
    console.warn(`deleteChatMessage called with an ID that does not have the correct prefix: ${fullChatId}. Attempting to delete anyway.`);
  }
  await removeChatMessageFromIndex(fullChatId); // <-- This must be present!
  await localforage.removeItem(fullChatId);
  await localforage.removeItem(`${EMBEDDING_CHAT_PREFIX}${fullChatId}`);
  console.log('Chat message and its embedding deleted from system:', fullChatId);
};

/**
 * Deletes all chat messages and their embeddings from localforage.
 */
export const deleteAllChatMessages = async (): Promise<void> => {
  const keys = await localforage.keys();
  const chatKeysToDelete: string[] = [];
  const embeddingKeysToDelete: string[] = [];

  for (const key of keys) {
    if (key.startsWith(CHAT_STORAGE_PREFIX)) {
      chatKeysToDelete.push(key);
    } else if (key.startsWith(EMBEDDING_CHAT_PREFIX)) {
      embeddingKeysToDelete.push(key);
    }
  }

  await Promise.all(chatKeysToDelete.map(key => localforage.removeItem(key)));
  await Promise.all(embeddingKeysToDelete.map(key => localforage.removeItem(key)));
  
  console.log('All chat messages and their embeddings deleted from system.');
  await rebuildFullIndex(); // <-- This ensures the index is rebuilt after bulk delete
};

/**
 * Gets a single chat message by ID, including its embedding.
 * The ID provided should be the full key (e.g., "chat_12345").
 */
export const getChatMessageById = async (fullChatId: string): Promise<ChatMessageWithEmbedding | null> => {
  if (!fullChatId.startsWith(CHAT_STORAGE_PREFIX)) {
    console.warn(`getChatMessageById called with an ID that does not have the correct prefix: ${fullChatId}. Attempting to fetch anyway.`);
  }
  const rawChat = await localforage.getItem<ChatMessage>(fullChatId);
  if (!rawChat) {
    return null;
  }
  const embedding = await localforage.getItem<number[]>(`${EMBEDDING_CHAT_PREFIX}${fullChatId}`);
  return { ...rawChat, embedding: embedding || undefined };
};
