import localforage from 'localforage';
import { rebuildFullIndex, removeChatMessageFromIndex } from './searchUtils';
import { ChatChunk, ChatMessageInputForChunking, ChatChunkingResult } from '../types/chunkTypes'; // Ensure ChatChunkingResult is imported
import { chunkChatMessageTurns } from './chunkingUtils';
import { generateEmbeddings, ensureEmbeddingServiceConfigured } from './embeddingUtils';
import storage from './storageUtil';
import { Config } from '../types/config';

// --- INTERFACES ---
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

// --- CONSTANTS ---
export const CHAT_STORAGE_PREFIX = 'chat_';
export const EMBEDDING_CHAT_PREFIX = 'embedding_chat_';
export const EMBEDDING_CHAT_CHUNK_PREFIX = 'embedding_chatchunk_';
export const CHAT_CHUNK_TEXT_PREFIX = 'chatchunktext_';
// NEW: Constant for the parent-to-chunk index
export const CHAT_CHUNK_INDEX_PREFIX = 'chat-chunk-index:';

// --- UTILITY FUNCTIONS ---
export const generateChatId = (): string => `${CHAT_STORAGE_PREFIX}${Date.now()}_${Math.random().toString(16).slice(2)}`;

/**
 * Saves a new chat message or updates an existing one.
 * This function now also handles chunking and saving the parent-to-chunk index.
 */
export const saveChatMessage = async (chatMessageData: Partial<Omit<ChatMessage, 'id' | 'last_updated'>> & { id?: string; turns: MessageTurn[]; embedding?: number[] }): Promise<ChatMessage> => {
  const now = Date.now();
  const chatId = chatMessageData.id || generateChatId();
  const fullChatId = chatId.startsWith(CHAT_STORAGE_PREFIX) ? chatId : `${CHAT_STORAGE_PREFIX}${chatId.replace(/^chat_/, '')}`;

  const chatToSaveToStorage: ChatMessage = {
    id: fullChatId,
    title: chatMessageData.title || `Chat - ${new Date(now).toLocaleDateString([], { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
    turns: chatMessageData.turns,
    last_updated: now,
    model: chatMessageData.model,
    chatMode: chatMessageData.chatMode,
    noteContentUsed: chatMessageData.noteContentUsed,
    useNoteActive: chatMessageData.useNoteActive,
    webMode: chatMessageData.webMode,
  };

  await localforage.setItem(fullChatId, chatToSaveToStorage);

  if (chatMessageData.embedding && chatMessageData.embedding.length > 0) {
    await localforage.setItem(`${EMBEDDING_CHAT_PREFIX}${fullChatId}`, chatMessageData.embedding);
  } else {
    await localforage.removeItem(`${EMBEDDING_CHAT_PREFIX}${fullChatId}`);
  }

  try {
    const configStr: string | null = await storage.getItem('config');
    const config: Config | null = configStr ? JSON.parse(configStr) : null;
    const embeddingMode = config?.rag?.embeddingMode ?? 'manual';

    const chatInputForChunking: ChatMessageInputForChunking = {
      id: chatToSaveToStorage.id,
      title: chatToSaveToStorage.title,
      turns: chatToSaveToStorage.turns.map(turn => ({
        role: turn.role,
        content: turn.content || '',
        timestamp: turn.timestamp,
      })),
    };
    
    const { chunks: currentChunks, chunkIds } = chunkChatMessageTurns(chatInputForChunking);
    const currentChunkIdsSet = new Set(chunkIds);
    const allStorageKeys = await localforage.keys();

    const oldChunkTextKeys = allStorageKeys.filter(key =>
      key.startsWith(CHAT_CHUNK_TEXT_PREFIX) && key.includes(chatToSaveToStorage.id)
    );
    const oldChunkEmbeddingKeys = allStorageKeys.filter(key =>
      key.startsWith(EMBEDDING_CHAT_CHUNK_PREFIX) && key.includes(chatToSaveToStorage.id)
    );

    for (const oldKey of oldChunkTextKeys) {
      const chunkId = oldKey.substring(CHAT_CHUNK_TEXT_PREFIX.length);
      if (!currentChunkIdsSet.has(chunkId)) {
        await localforage.removeItem(oldKey);
        await localforage.removeItem(`${EMBEDDING_CHAT_CHUNK_PREFIX}${chunkId}`);
      }
    }
     for (const oldEmbeddingKey of oldChunkEmbeddingKeys) {
        const chunkId = oldEmbeddingKey.substring(EMBEDDING_CHAT_CHUNK_PREFIX.length);
        if (!currentChunkIdsSet.has(chunkId)) {
            await localforage.removeItem(oldEmbeddingKey);
        }
    }

    for (const chunk of currentChunks) {
      await localforage.setItem(`${CHAT_CHUNK_TEXT_PREFIX}${chunk.id}`, chunk.content);
    }

    // NEW: Save the parent-to-chunk index
    await localforage.setItem(`${CHAT_CHUNK_INDEX_PREFIX}${chatToSaveToStorage.id}`, chunkIds);

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
                        await localforage.setItem(`${EMBEDDING_CHAT_CHUNK_PREFIX}${chunk.id}`, embedding);
                    } else {
                        await localforage.removeItem(`${EMBEDDING_CHAT_CHUNK_PREFIX}${chunk.id}`);
                    }
                }
            }
        } catch (configError) {
            console.warn(`Embedding service not configured. Skipping automatic embedding for chat ${chatToSaveToStorage.id}. Error: ${configError}`);
        }
      }
    }
    console.log(`Processed and saved ${currentChunks.length} chunk texts and index for chat ${chatToSaveToStorage.id}.`);
  } catch (error) {
    console.error(`Error during chunking or conditional embedding generation for chat ${chatToSaveToStorage.id}:`, error);
  }
  
  return chatToSaveToStorage; 
};

/**
 * Fetches all chat messages from localforage and their embeddings.
 * (This function is unchanged)
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
 * Deletes a chat message and all its associated data (embedding, chunks, index).
 */
export const deleteChatMessage = async (fullChatId: string): Promise<void> => {
  if (!fullChatId.startsWith(CHAT_STORAGE_PREFIX)) {
    console.warn(`deleteChatMessage called with an ID that does not have the correct prefix: ${fullChatId}.`);
  }
  
  // 1. Remove from main search index
  await removeChatMessageFromIndex(fullChatId);
  
  // 2. Remove the core chat object, its whole-chat embedding, and its parent-to-chunk index
  await localforage.removeItem(fullChatId);
  await localforage.removeItem(`${EMBEDDING_CHAT_PREFIX}${fullChatId}`);
  await localforage.removeItem(`${CHAT_CHUNK_INDEX_PREFIX}${fullChatId}`);
  
  // 3. Find and remove all associated chunk texts and chunk embeddings
  const allKeys = await localforage.keys();
  const chunkTextKeysToDelete = allKeys.filter(key =>
    key.startsWith(CHAT_CHUNK_TEXT_PREFIX) && key.includes(fullChatId)
  );
  const chunkEmbeddingKeysToDelete = allKeys.filter(key =>
    key.startsWith(EMBEDDING_CHAT_CHUNK_PREFIX) && key.includes(fullChatId)
  );

  for (const key of chunkTextKeysToDelete) {
    await localforage.removeItem(key);
  }
  for (const key of chunkEmbeddingKeysToDelete) {
    await localforage.removeItem(key);
  }
  
  console.log(`Deleted chat ${fullChatId} and all associated data.`);
};

/**
 * Deletes all chat messages and their associated data from localforage.
 */
export const deleteAllChatMessages = async (): Promise<void> => {
  const keys = await localforage.keys();
  const keysToDelete: string[] = [];

  for (const key of keys) {
    if (
      key.startsWith(CHAT_STORAGE_PREFIX) ||
      key.startsWith(EMBEDDING_CHAT_PREFIX) ||
      key.startsWith(CHAT_CHUNK_TEXT_PREFIX) ||
      key.startsWith(EMBEDDING_CHAT_CHUNK_PREFIX) ||
      key.startsWith(CHAT_CHUNK_INDEX_PREFIX) // Include the index prefix
    ) {
      keysToDelete.push(key);
    }
  }

  await Promise.all(keysToDelete.map(key => localforage.removeItem(key)));
  
  console.log('All chat messages and associated data deleted.');
  await rebuildFullIndex();
};

/**
 * Gets a single chat message by ID, including its embedding.
 * (This function is unchanged)
 */
export const getChatMessageById = async (fullChatId: string): Promise<ChatMessageWithEmbedding | null> => {
  if (!fullChatId.startsWith(CHAT_STORAGE_PREFIX)) {
    console.warn(`getChatMessageById called with an ID that does not have the correct prefix: ${fullChatId}.`);
  }
  const rawChat = await localforage.getItem<ChatMessage>(fullChatId);
  if (!rawChat) {
    return null;
  }
  const embedding = await localforage.getItem<number[]>(`${EMBEDDING_CHAT_PREFIX}${fullChatId}`);
  return { ...rawChat, embedding: embedding || undefined };
};