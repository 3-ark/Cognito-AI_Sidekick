/// <reference types="vitest/globals" />
import { vi, describe, it, expect, beforeEach, afterEach, Mock } from "vitest";
import { chunkNote, chunkChatMessage } from "../chunkingUtils";
import * as textProcessing from "../textProcessing";
import * as storageUtil from "../storageUtil";
import { Note } from "../../types/noteTypes";
import { ChatMessageInputForChunking } from "../../types/chunkTypes";
import { RagConfig } from "../../types/config";

vi.mock("../textProcessing");
vi.mock("../storageUtil");

const mockRagConfig: RagConfig = {
  model: "test-model",
  use_gpu: false,
  semantic_top_k: 5,
  similarity_threshold: 0.5,
  BM25_top_k: 10,
  k: 1.2,
  b: 0.75,
  d: 0.5,
  bm25_weight: 0.5,
  autoEmbedOnSave: false,
  final_top_k: 10,
  maxChunkChars: 2000,
  minChunkChars: 150,
  overlapChars: 50,
  lambda: 0.5,
  useContextualSummaries: false,
};

describe("chunkingUtils", () => {
  beforeEach(() => {
    vi.spyOn(textProcessing, "lexicalProcessText").mockImplementation((text) => text.split(/\s+/));
    vi.spyOn(textProcessing, "gentleProcessText").mockImplementation((text) => text);
    (storageUtil.getStoredAppSettings as Mock).mockResolvedValue({ ragConfig: mockRagConfig });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("chunkNote", () => {
    it("should split a note into chunks based on markdown headings", async () => {
        const longContent1 = "This is the first piece of content, and it needs to be sufficiently long to pass the minimum character threshold of 150 characters, which is set in the mock RAG configuration for this specific test suite. We'll add some more text just to be safe.";
        const longContent2 = "This is the second piece of content, following a new heading. It also must be longer than 150 characters to ensure that the chunking utility does not merge it with the previous chunk, which would cause the test to fail.";

        const note: Note = {
            id: "note1",
            title: "Test Note",
            content: `# Title 1\n${longContent1}\n## Title 2\n${longContent2}`,
            tags: ["tag1"],
            createdAt: 0,
            lastUpdatedAt: 0,
            contentLastUpdatedAt: 0,
            bm25Content: ""
      };

      const { chunks } = await chunkNote(note, mockRagConfig);

      expect(chunks).toHaveLength(2);
      expect(chunks[0].content).toContain(longContent1);
      expect(chunks[0].headingPath).toEqual(["Title 1"]);
      expect(chunks[0].originalTags).toEqual(["tag1"]);
      expect(chunks[1].content).toContain(longContent2);
      expect(chunks[1].headingPath).toEqual(["Title 1", "Title 2"]);
    });
  });

  describe("chunkChatMessage", () => {
    it("should create a single chunk from a chat message", () => {
      const message: ChatMessageInputForChunking = {
        id: "msg1",
        conversationId: "conv1",
        content: "This is a test message.",
        role: "user",
        timestamp: 0,
        lastUpdatedAt: 0,
        parentTitle: "Chat about testing"
      };

      const chunks = chunkChatMessage(message);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe("This is a test message.");
      expect(chunks[0].parentId).toBe("msg1");
      expect(chunks[0].parentTitle).toBe("Chat about testing");
    });
  });
});
