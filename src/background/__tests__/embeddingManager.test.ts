import { vi, describe, it, expect, beforeEach } from "vitest";
import localforage from "localforage";
import { buildAllEmbeddings, updateEmbeddings } from "../embeddingManager";
import * as noteStorage from "../noteStorage";
import * as chatHistoryStorage from "../chatHistoryStorage";
import * as embeddingUtils from "../embeddingUtils";
import * as chunkingUtils from "../chunkingUtils";
import * as chunkIndex from "../chunkIndex";
import * as storageUtil from "../storageUtil";
import { Note } from "../../types/noteTypes";
import { Conversation } from "../../types/chatTypes";

vi.mock("localforage");
vi.mock("../noteStorage");
vi.mock("../chatHistoryStorage");
vi.mock("../embeddingUtils");
vi.mock("../chunkingUtils");
vi.mock("../chunkIndex");
vi.mock("../storageUtil");

const chrome = {
  runtime: {
    sendMessage: vi.fn(),
    lastError: null,
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    },
  },
};

global.chrome = chrome as any;

describe("embeddingManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(storageUtil, "getStoredAppSettings").mockResolvedValue({
      ragConfig: { useContextualSummaries: false },
    } as any);
    vi.spyOn(localforage, "keys").mockResolvedValue([]);
    vi.spyOn(embeddingUtils, "getEmbedding").mockResolvedValue([0.1, 0.2, 0.3]);
  });

  describe("buildAllEmbeddings", () => {
    it("should build embeddings for all notes and conversations", async () => {
      const notes: Note[] = [
        { id: "note_1", title: "Note 1", content: "Note Content 1", createdAt: 0, lastUpdatedAt: 0, pinned: false, bm25Content: "", contentLastUpdatedAt: 0 },
      ];
      const conversations: Conversation[] = [
        { id: "conv_1", title: "Conv 1", lastUpdatedAt: 0, createdAt: 0 },
      ];
      const chatMessages = [{ id: "msg_1", role: "user" as const, content: "User message", timestamp: 0, conversationId: "conv_1", lastUpdatedAt: 0, status: 'complete' as const }];

      vi.spyOn(noteStorage, "getAllNotesFromSystem").mockResolvedValue(notes);
      vi.spyOn(chatHistoryStorage, "getAllConversations").mockResolvedValue(conversations);
      vi.spyOn(chatHistoryStorage, "getChatMessagesForConversation").mockResolvedValue(chatMessages);
      vi.spyOn(chunkingUtils, "chunkNote").mockResolvedValue({ chunks: [{ id: "chunk_note_1", parentId: "note_1", content: "Note Content 1" }] as any, summariesGenerated: 0 });
      vi.spyOn(chunkingUtils, "chunkChatMessage").mockReturnValue([{ id: "chunk_chat_1", parentId: "msg_1", content: "User message" }] as any);

      await buildAllEmbeddings();

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'EMBEDDING_START' }));
      expect(embeddingUtils.getEmbedding).toHaveBeenCalledTimes(2);
      expect(localforage.setItem).toHaveBeenCalledWith("chunk_note_1", expect.any(Object));
      expect(localforage.setItem).toHaveBeenCalledWith("chunk_chat_1", expect.any(Object));
      expect(chunkIndex.rebuildChunkIndex).toHaveBeenCalled();
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'EMBEDDING_END' }));
    });
  });

  describe("updateEmbeddings", () => {
    it("should process a new note", async () => {
      const newNote: Note = { id: "note_2", title: "New Note", content: "New Content", createdAt: 1, lastUpdatedAt: 1, pinned: false, bm25Content: "", contentLastUpdatedAt: 1 };

      vi.spyOn(chunkIndex, "getChunkIndex").mockResolvedValue({});
      vi.spyOn(noteStorage, "getAllNotesFromSystem").mockResolvedValue([newNote]);
      vi.spyOn(chatHistoryStorage, "getAllConversations").mockResolvedValue([]);
      vi.spyOn(chunkingUtils, "chunkNote").mockResolvedValue({ chunks: [{ id: "chunk_new_1", parentId: "note_2", content: "New Content" }] as any, summariesGenerated: 0 });

      await updateEmbeddings();

      expect(embeddingUtils.getEmbedding).toHaveBeenCalledWith("New Content");
      expect(localforage.setItem).toHaveBeenCalledWith("chunk_new_1", expect.any(Object));
      expect(chunkIndex.saveChunkIndex).toHaveBeenCalled();
    });

    it("should prune chunks for deleted notes", async () => {
      vi.spyOn(chunkIndex, "getChunkIndex").mockResolvedValue({ "deleted_note": ["chunk_deleted_1"] });
      vi.spyOn(noteStorage, "getAllNotesFromSystem").mockResolvedValue([]);
      vi.spyOn(chatHistoryStorage, "getAllConversations").mockResolvedValue([]);

      await updateEmbeddings();

      expect(localforage.removeItem).toHaveBeenCalledWith("chunk_deleted_1");
      expect(chunkIndex.saveChunkIndex).toHaveBeenCalledWith({});
    });
  });
});
