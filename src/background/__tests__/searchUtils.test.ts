import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { SearchService } from "../searchUtils";
import * as noteStorage from "../noteStorage";
import * as embeddingUtils from "../embeddingUtils";
import * as storageUtil from "../storageUtil";
import * as chunkIndex from "../chunkIndex";
import localforage from "localforage";

vi.mock("../noteStorage");
vi.mock("../embeddingUtils");
vi.mock("../storageUtil");
vi.mock("../chunkIndex");
vi.mock("localforage");

const chrome = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
    },
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

describe("SearchService", () => {
  let searchService: SearchService;

  beforeEach(async () => {
    vi.spyOn(storageUtil, "getStoredAppSettings").mockResolvedValue({
      ragConfig: {
        bm25_weight: 0.5,
        semantic_top_k: 5,
        BM25_top_k: 5,
        lambda: 0.5,
      },
    } as any);
    vi.spyOn(localforage, "getItem").mockResolvedValue(null);
    vi.spyOn(localforage, "setItem").mockResolvedValue(undefined);
    vi.spyOn(localforage, "keys").mockResolvedValue([]);
    vi.spyOn(noteStorage, "getAllNotesFromSystem").mockResolvedValue([]);
    vi.spyOn(chunkIndex, "isChunkIndexBuilt").mockResolvedValue(true);

    searchService = new SearchService();
    await searchService.initializationPromise;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should initialize correctly", () => {
    expect(searchService).toBeInstanceOf(SearchService);
  });

  it("should index a single note", async () => {
    const note = { id: "note_1", title: "Test Note", content: "Test content", bm25Content: "test content" } as any;
    const addSpy = vi.spyOn(searchService['engine'], 'add');
    const setSpy = vi.spyOn(searchService['inMemoryItemsStore'], 'set');

    await searchService.indexSingleNote(note);

    expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({ id: "note_1" }));
    expect(setSpy).toHaveBeenCalledWith("note_1", expect.objectContaining({ id: "note_1" }));
  });

  it("should remove an item from the index", async () => {
    const noteId = "note_1";
    const discardSpy = vi.spyOn(searchService['engine'], 'discard');
    const deleteSpy = vi.spyOn(searchService['inMemoryItemsStore'], 'delete');

    await searchService.removeItemFromIndex(noteId);

    expect(discardSpy).toHaveBeenCalledWith(noteId);
    expect(deleteSpy).toHaveBeenCalledWith(noteId);
  });

  it("should perform a search", async () => {
    const query = "test";
    const note = { id: "note_1", title: "Test Note", content: "This is a test", bm25Content: "test" };
    const chunk = { id: 'notechunk_chunk_1', parentId: 'note_1', content: 'This is a test', embedding: [0.1, 0.2, 0.3], originalType: 'note' };

    vi.spyOn(searchService['engine'], 'search').mockReturnValue([{ id: 'note_1', score: 1, doc: note }] as any);
    vi.spyOn(embeddingUtils, "getEmbedding").mockImplementation(async (text) => {
        if (text.toLowerCase() === 'test') return [0.1, 0.2, 0.3];
        return [0.4, 0.5, 0.6];
    });
    vi.spyOn(localforage, "keys").mockResolvedValue(["notechunk_chunk_1"]);
    vi.spyOn(localforage, "getItem").mockImplementation(async (key) => {
        if (key === "notechunk_chunk_1") return chunk;
        return null;
    });
    vi.spyOn(chunkIndex, "getChunksForParent").mockResolvedValue(['notechunk_chunk_1']);

    const results = await searchService.searchItems(query);

    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe("notechunk_chunk_1");
  });
});
