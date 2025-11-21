import localforage from 'localforage';

import { Conversation, MessageTurn } from '../types/chatTypes';
import { ChatMessageInputForChunking } from '../types/chunkTypes';

import { getChunksForParent, removeParentFromIndex, setChunksForParent } from './chunkIndex';
import { chunkChatMessage } from './chunkingUtils';
import { getEmbedding } from './embeddingUtils';
import { getSearchService } from './searchUtils';
import { getStoredAppSettings } from './storageUtil';
import { aggressiveProcessText, cleanMarkdownForSemantics } from './textProcessing';

// Constants
export const CONVERSATION_STORAGE_PREFIX = 'conv_';
export const MESSAGE_STORAGE_PREFIX = 'msg_';

// #region Utility Functions
export const generateConversationId = (): string => `${CONVERSATION_STORAGE_PREFIX}${Date.now()}_${Math.random().toString(16).slice(2)}`;
export const generateMessageId = (): string => `${MESSAGE_STORAGE_PREFIX}${Date.now()}_${Math.random().toString(16).slice(2)}`;

// #endregion

// #region Conversation Functions
/**
 * Saves a new conversation or updates an existing one.
 */
export const saveConversation = async (conversationData: Partial<Conversation> & { id?: string }): Promise<Conversation> => {
  const now = Date.now();
  const conversationId = conversationData.id && conversationData.id.startsWith(CONVERSATION_STORAGE_PREFIX)
    ? conversationData.id
    : generateConversationId();

  const existingConversation = await getConversation(conversationId);

  const conversation: Conversation = {
    id: conversationId,
    title: conversationData.title || '',
    createdAt: existingConversation?.createdAt || now,
    lastUpdatedAt: now,
    model: conversationData.model,
    chatMode: conversationData.chatMode,
    noteContentUsed: conversationData.noteContentUsed,
    useNoteActive: conversationData.useNoteActive,
    webMode: conversationData.webMode,
    url: conversationData.url,
  };

  await localforage.setItem(conversationId, conversation);

  return conversation;
};

/**
 * Fetches a single conversation by its ID.
 */
export const getConversation = async (conversationId: string): Promise<Conversation | null> => {
  return localforage.getItem<Conversation>(conversationId);
};

/**
 * Fetches all conversations, sorted by creation date.
 */
export const getAllConversations = async (): Promise<Conversation[]> => {
  const keys = await localforage.keys();
  const conversationKeys = keys.filter(key => key.startsWith(CONVERSATION_STORAGE_PREFIX));
  const conversations: Conversation[] = [];

  for (const key of conversationKeys) {
    const conv = await localforage.getItem<Conversation>(key);

    if (conv) {
      conversations.push(conv);
    }
  }

  return conversations.sort((a, b) => b.createdAt - a.createdAt);
};

/**
 * Deletes a conversation and all its associated messages.
 */
export const deleteConversation = async (conversationId: string): Promise<void> => {
  const messages = await getChatMessagesForConversation(conversationId);

  for (const message of messages) {
    await deleteChatMessage(message.id); // This will also remove from index
  }

  await localforage.removeItem(conversationId);
  console.log(`Conversation ${conversationId} and all its messages have been deleted.`);
};

// #endregion

// #region Message Functions
/**
 * Saves a single chat message.
 */
export const saveChatMessage = async (messageData: Partial<MessageTurn> & { id?: string, conversationId: string }): Promise<MessageTurn> => {
  const now = Date.now();
  const messageId = messageData.id && messageData.id.startsWith(MESSAGE_STORAGE_PREFIX)
    ? messageData.id
    : generateMessageId();

  const existingMessage = messageData.id ? await localforage.getItem<MessageTurn>(messageId) : null;

  const cleanContent = cleanMarkdownForSemantics(messageData.content || '');
  const bm25Content = aggressiveProcessText(cleanContent).join(' ');

  const message: MessageTurn = {
    ...(existingMessage || {}),
    ...messageData,
    id: messageId,
    role: messageData.role || 'user',
    status: messageData.status || 'complete',
    content: messageData.content || '',
    timestamp: existingMessage?.timestamp || now,
    lastUpdatedAt: now,
    bm25Content: bm25Content,
  };

  // If the message is being updated, use the index to efficiently delete its old chunks.
  if (existingMessage) {
    const oldChunkIds = await getChunksForParent(messageId);
    for (const chunkId of oldChunkIds) {
        await localforage.removeItem(chunkId);
    }
    console.log(`Deleted ${oldChunkIds.length} old chunks for message ${messageId}.`);
  }

  await localforage.setItem(messageId, message);

  const appSettings = await getStoredAppSettings();

  if (appSettings?.ragConfig?.autoEmbedOnSave) {
    const conversation = await getConversation(message.conversationId);
    const messageInput: ChatMessageInputForChunking = {
      id: messageId,
      conversationId: message.conversationId,
      content: message.content,
      role: message.role,
      timestamp: message.timestamp,
      parentTitle: conversation?.title,
      lastUpdatedAt: message.lastUpdatedAt,
    };
    const chunks = chunkChatMessage(messageInput);
    const chunkIds = chunks.map(chunk => chunk.id);
    await setChunksForParent(messageId, chunkIds); // Update the index with the new chunks

    for (const chunk of chunks) {
      chunk.embedding = await getEmbedding(chunk.content);
      await localforage.setItem(chunk.id, chunk);
    }
  }

  (await getSearchService()).indexSingleMessage(message); // Index the message in MiniSearch

  return message;
};

/**
 * Fetches all messages for a given conversation, sorted by timestamp.
 */
export const getChatMessagesForConversation = async (conversationId: string): Promise<MessageTurn[]> => {
  const keys = await localforage.keys();
  const messageKeys = keys.filter(key => key.startsWith(MESSAGE_STORAGE_PREFIX));
  const messages: MessageTurn[] = [];

  for (const key of messageKeys) {
    const msg = await localforage.getItem<MessageTurn>(key);

    if (msg && msg.conversationId === conversationId) {
      messages.push(msg);
    }
  }

  return messages.sort((a, b) => a.timestamp - b.timestamp);
};

/**
 * Deletes a single chat message by its ID.
 */
export const deleteChatMessage = async (messageId: string): Promise<void> => {
  if (!messageId.startsWith(MESSAGE_STORAGE_PREFIX)) {
    console.warn(`deleteChatMessage called with an invalid ID: ${messageId}`);

    return;
  }

  await localforage.removeItem(messageId);
  (await getSearchService()).removeItemFromIndex(messageId); // Remove from MiniSearch index

  // Also, delete all associated chunks.
  const allKeys = await localforage.keys();
  const chunkKeysToDelete = allKeys.filter(key => key.includes(`chunk_${messageId}`));

  for (const key of chunkKeysToDelete) {
    await localforage.removeItem(key);
  }

  await removeParentFromIndex(messageId);

  console.log(`Chat message ${messageId} and its chunks deleted.`);
};

import { getChunkIndex, saveChunkIndex } from './chunkIndex';

/**
 * Deletes all chat messages and conversations efficiently.
 */
export const deleteAllChatData = async (): Promise<void> => {
    const searchService = await getSearchService();
    const chunkIndex = await getChunkIndex();
    const keys = await localforage.keys();

    const conversationKeys = keys.filter(key => key.startsWith(CONVERSATION_STORAGE_PREFIX));
    const messageKeys = keys.filter(key => key.startsWith(MESSAGE_STORAGE_PREFIX));

    const messageChunkKeysToDelete = new Set<string>();

    for (const messageId of messageKeys) {
        const chunkIds = chunkIndex[messageId] || [];
        for (const chunkId of chunkIds) {
            messageChunkKeysToDelete.add(chunkId);
        }
        delete chunkIndex[messageId]; // Remove parent from chunk index
    }

    // Also find any orphaned message chunks, just in case
    keys.forEach(key => {
        if (key.startsWith('msgchunk_')) {
            messageChunkKeysToDelete.add(key);
        }
    });

    const allKeysToDelete = [
        ...conversationKeys,
        ...messageKeys,
        ...Array.from(messageChunkKeysToDelete)
    ];

    // Batch remove from search index (MiniSearch doesn't have bulk remove, but this is still better)
    for (const key of messageKeys) {
        await searchService.removeItemFromIndex(key);
    }

    // Batch remove all items from localforage
    await Promise.all(allKeysToDelete.map(key => localforage.removeItem(key)));

    // Save the modified chunk index once
    await saveChunkIndex(chunkIndex);

    console.log('All chat data has been deleted efficiently.');
};

/**
 * Gets a single chat message by its ID.
 */
export const getChatMessageById = async (messageId: string): Promise<MessageTurn | null> => {
    if (!messageId.startsWith(MESSAGE_STORAGE_PREFIX)) {
        return null;
    }

    return localforage.getItem<MessageTurn>(messageId);
};

// #endregion
