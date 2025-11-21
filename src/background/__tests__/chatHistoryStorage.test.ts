/// <reference types="vitest/globals" />
import { vi, describe, it, expect, beforeEach, afterEach, Mock } from "vitest";
import localforage from "localforage";
import {
  saveConversation,
  getConversation,
  getAllConversations,
  deleteConversation,
  saveChatMessage,
  getChatMessagesForConversation,
  deleteChatMessage,
  deleteAllChatData,
  getChatMessageById,
  CONVERSATION_STORAGE_PREFIX,
  MESSAGE_STORAGE_PREFIX,
} from "../chatHistoryStorage";
import * as chunkIndex from "../chunkIndex";
import * as embeddingUtils from "../embeddingUtils";
import * as searchUtils from "../searchUtils";
import * as textProcessing from "../textProcessing";
import * as storageUtil from "../storageUtil";
import { Conversation, MessageTurn } from "../../types/chatTypes";

vi.mock("localforage");
vi.mock("../chunkIndex");
vi.mock("../embeddingUtils");
vi.mock("../searchUtils");
vi.mock("../textProcessing");
vi.mock("../storageUtil");

const mockSearchService = {
  indexSingleMessage: vi.fn(),
  removeItemFromIndex: vi.fn(),
};

describe("chatHistoryStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (searchUtils.getSearchService as Mock).mockReturnValue(mockSearchService as any);
    (storageUtil.getStoredAppSettings as Mock).mockResolvedValue({
      ragConfig: { autoEmbedOnSave: false },
    } as any);
    (textProcessing.cleanMarkdownForSemantics as Mock).mockImplementation(content => content);
    (textProcessing.aggressiveProcessText as Mock).mockImplementation(content => content.split(' '));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("saveConversation", () => {
    it("should create a new conversation with a generated ID", async () => {
      const conversationData = { title: "Test Conversation" };
      const result = await saveConversation(conversationData);

      expect(result.id).toContain(CONVERSATION_STORAGE_PREFIX);
      expect(result.title).toBe("Test Conversation");
      expect(localforage.setItem).toHaveBeenCalledWith(result.id, result);
    });

    it("should update an existing conversation", async () => {
      const existingId = `${CONVERSATION_STORAGE_PREFIX}123`;
      const conversationData = { id: existingId, title: "Updated Title" };
      (localforage.getItem as Mock).mockResolvedValue({
        id: existingId,
        title: "Old Title",
        createdAt: Date.now() - 1000,
      });

      const result = await saveConversation(conversationData);

      expect(result.id).toBe(existingId);
      expect(result.title).toBe("Updated Title");
      expect(localforage.setItem).toHaveBeenCalledWith(existingId, result);
    });
  });

  describe("getConversation", () => {
    it("should retrieve a conversation by ID", async () => {
      const conversationId = `${CONVERSATION_STORAGE_PREFIX}123`;
      const mockConversation = { id: conversationId, title: "Test" };
      (localforage.getItem as Mock).mockResolvedValue(mockConversation);

      const result = await getConversation(conversationId);

      expect(result).toEqual(mockConversation);
      expect(localforage.getItem).toHaveBeenCalledWith(conversationId);
    });
  });

  describe("getAllConversations", () => {
    it("should retrieve all conversations and sort them by creation date", async () => {
      const now = Date.now();
      const conversations = [
        { id: `${CONVERSATION_STORAGE_PREFIX}1`, createdAt: now - 2000 },
        { id: `${CONVERSATION_STORAGE_PREFIX}2`, createdAt: now },
        { id: `${CONVERSATION_STORAGE_PREFIX}3`, createdAt: now - 1000 },
      ];
      (localforage.keys as Mock).mockResolvedValue(conversations.map(c => c.id));
      (localforage.getItem as Mock).mockImplementation(async (key) => {
        return conversations.find(c => c.id === key) || null;
      });

      const result = await getAllConversations();

      expect(result.map(r => r.id)).toEqual([`${CONVERSATION_STORAGE_PREFIX}2`, `${CONVERSATION_STORAGE_PREFIX}3`, `${CONVERSATION_STORAGE_PREFIX}1`]);
    });
  });

  describe("deleteConversation", () => {
    it("should delete a conversation and its messages", async () => {
      const conversationId = `${CONVERSATION_STORAGE_PREFIX}123`;
      const messages = [
        { id: `${MESSAGE_STORAGE_PREFIX}1`, conversationId },
        { id: `${MESSAGE_STORAGE_PREFIX}2`, conversationId },
      ];
      (localforage.keys as Mock).mockResolvedValue([conversationId, ...messages.map(m => m.id)]);
      (localforage.getItem as Mock).mockImplementation(async (key) => {
        if (key.startsWith(MESSAGE_STORAGE_PREFIX)) {
          return { ...messages.find(m => m.id === key), conversationId };
        }
        return null;
      });
      (chunkIndex.getChunksForParent as Mock).mockResolvedValue([]);

      await deleteConversation(conversationId);

      expect(localforage.removeItem).toHaveBeenCalledWith(conversationId);
      expect(localforage.removeItem).toHaveBeenCalledWith(`${MESSAGE_STORAGE_PREFIX}1`);
      expect(localforage.removeItem).toHaveBeenCalledWith(`${MESSAGE_STORAGE_PREFIX}2`);
    });
  });

  describe("saveChatMessage", () => {
    it("should save a new chat message", async () => {
      const messageData = { conversationId: `${CONVERSATION_STORAGE_PREFIX}1`, content: "Hello" };
      const result = await saveChatMessage(messageData);

      expect(result.id).toContain(MESSAGE_STORAGE_PREFIX);
      expect(result.content).toBe("Hello");
      expect(localforage.setItem).toHaveBeenCalledWith(result.id, expect.any(Object));
      expect(mockSearchService.indexSingleMessage).toHaveBeenCalledWith(expect.any(Object));
    });
  });

  describe("getChatMessagesForConversation", () => {
    it("should retrieve all messages for a conversation, sorted by timestamp", async () => {
      const conversationId = `${CONVERSATION_STORAGE_PREFIX}1`;
      const now = Date.now();
      const messages = [
        { id: `${MESSAGE_STORAGE_PREFIX}1`, conversationId, timestamp: now - 1000 },
        { id: `${MESSAGE_STORAGE_PREFIX}2`, conversationId: "other_conv", timestamp: now - 2000 },
        { id: `${MESSAGE_STORAGE_PREFIX}3`, conversationId, timestamp: now },
      ];
      (localforage.keys as Mock).mockResolvedValue(messages.map(m => m.id));
      (localforage.getItem as Mock).mockImplementation(async (key) => {
        return messages.find(m => m.id === key) || null;
      });

      const result = await getChatMessagesForConversation(conversationId);
      expect(result.length).toBe(2);
      expect(result.map(r => r.id)).toEqual([`${MESSAGE_STORAGE_PREFIX}1`, `${MESSAGE_STORAGE_PREFIX}3`]);
    });
  });

  describe("deleteChatMessage", () => {
    it("should delete a chat message and its chunks", async () => {
      const messageId = `${MESSAGE_STORAGE_PREFIX}123`;
      (localforage.keys as Mock).mockResolvedValue([`chunk_${messageId}_0`]);

      await deleteChatMessage(messageId);

      expect(localforage.removeItem).toHaveBeenCalledWith(messageId);
      expect(mockSearchService.removeItemFromIndex).toHaveBeenCalledWith(messageId);
      expect(localforage.removeItem).toHaveBeenCalledWith(`chunk_${messageId}_0`);
      expect(chunkIndex.removeParentFromIndex).toHaveBeenCalledWith(messageId);
    });
  });

  describe("deleteAllChatData", () => {
    it("should delete all conversations and messages", async () => {
      const conversationKeys = [`${CONVERSATION_STORAGE_PREFIX}1`, `${CONVERSATION_STORAGE_PREFIX}2`];
      const messageKeys = [`${MESSAGE_STORAGE_PREFIX}1`, `${MESSAGE_STORAGE_PREFIX}2`];
      const chunkKeys = ["msgchunk_1_0", "msgchunk_2_0"];
      const allKeys = [...conversationKeys, ...messageKeys, ...chunkKeys];

      (localforage.keys as Mock).mockResolvedValue(allKeys);
      (chunkIndex.getChunkIndex as Mock).mockResolvedValue({
        [`${MESSAGE_STORAGE_PREFIX}1`]: ["msgchunk_1_0"],
        [`${MESSAGE_STORAGE_PREFIX}2`]: ["msgchunk_2_0"],
      });

      await deleteAllChatData();

      expect(localforage.removeItem).toHaveBeenCalledTimes(6);
      expect(mockSearchService.removeItemFromIndex).toHaveBeenCalledTimes(2);
      expect(chunkIndex.saveChunkIndex).toHaveBeenCalled();
    });
  });

  describe("getChatMessageById", () => {
    it("should retrieve a message by its ID", async () => {
      const messageId = `${MESSAGE_STORAGE_PREFIX}123`;
      const mockMessage = { id: messageId, content: "Test" };
      (localforage.getItem as Mock).mockResolvedValue(mockMessage);

      const result = await getChatMessageById(messageId);

      expect(result).toEqual(mockMessage);
      expect(localforage.getItem).toHaveBeenCalledWith(messageId);
    });

    it("should return null for an invalid ID", async () => {
      const result = await getChatMessageById("invalid_id");
      expect(result).toBeNull();
    });
  });
});
