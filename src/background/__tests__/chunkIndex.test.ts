/// <reference types="vitest/globals" />
import { vi, describe, it, expect, beforeEach, afterEach, Mock } from "vitest";
import localforage from "localforage";

// Mock localforage at the top level
vi.mock("localforage");

const PARENT_TO_CHUNK_INDEX_KEY = 'parent_to_chunk_index_v1';

describe("chunkIndex", () => {
    // Declare variables to hold the imported functions
    let getChunkIndex: any, saveChunkIndex: any, getChunksForParent: any, setChunksForParent: any, removeParentFromIndex: any;

    beforeEach(async () => {
        // Reset modules before each test to clear the in-memory cache (indexCache)
        vi.resetModules();
        vi.clearAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => {});

        // Dynamically import the module to get a fresh instance for each test
        const chunkIndexModule = await import("../chunkIndex");
        getChunkIndex = chunkIndexModule.getChunkIndex;
        saveChunkIndex = chunkIndexModule.saveChunkIndex;
        getChunksForParent = chunkIndexModule.getChunksForParent;
        setChunksForParent = chunkIndexModule.setChunksForParent;
        removeParentFromIndex = chunkIndexModule.removeParentFromIndex;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getChunkIndex", () => {
        it("should retrieve and parse the chunk index from localforage", async () => {
            const mockIndex = { parent1: ["chunk1", "chunk2"] };
            (localforage.getItem as Mock).mockResolvedValue(mockIndex);
            const index = await getChunkIndex();
            expect(localforage.getItem).toHaveBeenCalledWith(PARENT_TO_CHUNK_INDEX_KEY);
            expect(index).toEqual(mockIndex);
        });

        it("should return an empty object if the index doesn't exist", async () => {
            (localforage.getItem as Mock).mockResolvedValue(null);
            const index = await getChunkIndex();
            expect(index).toEqual({});
        });
    });

    describe("saveChunkIndex", () => {
        it("should save the chunk index to localforage", async () => {
            const mockIndex = { parent1: ["chunk1"] };
            await saveChunkIndex(mockIndex);
            expect(localforage.setItem).toHaveBeenCalledWith(PARENT_TO_CHUNK_INDEX_KEY, mockIndex);
        });
    });

    describe("getChunksForParent", () => {
        it("should return the chunk IDs for a given parent", async () => {
            const mockIndex = { parent1: ["chunk1", "chunk2"] };
            (localforage.getItem as Mock).mockResolvedValue(mockIndex);
            const chunks = await getChunksForParent("parent1");
            expect(chunks).toEqual(["chunk1", "chunk2"]);
        });

        it("should return an empty array if the parent is not in the index", async () => {
            const mockIndex = { parent1: ["chunk1", "chunk2"] };
            (localforage.getItem as Mock).mockResolvedValue(mockIndex);
            const chunks = await getChunksForParent("nonexistent");
            expect(chunks).toEqual([]);
        });
    });

    describe("setChunksForParent", () => {
        it("should set the chunk IDs for a new parent", async () => {
            (localforage.getItem as Mock).mockResolvedValue({});
            await setChunksForParent("parent2", ["chunk3", "chunk4"]);
            expect(localforage.setItem).toHaveBeenCalledWith(PARENT_TO_CHUNK_INDEX_KEY, {
                parent2: ["chunk3", "chunk4"],
            });
        });

        it("should overwrite the chunk IDs for an existing parent", async () => {
            const mockIndex = { parent1: ["chunk1"] };
            (localforage.getItem as Mock).mockResolvedValue(mockIndex);
            await setChunksForParent("parent1", ["newchunk1"]);
            expect(localforage.setItem).toHaveBeenCalledWith(PARENT_TO_CHUNK_INDEX_KEY, {
                parent1: ["newchunk1"],
            });
        });
    });

    describe("removeParentFromIndex", () => {
        it("should remove a parent and its chunks from the index", async () => {
            const mockIndex = { parent1: ["chunk1"], parent2: ["chunk2"] };
            (localforage.getItem as Mock).mockResolvedValue(mockIndex);
            await removeParentFromIndex("parent1");
            expect(localforage.setItem).toHaveBeenCalledWith(PARENT_TO_CHUNK_INDEX_KEY, {
                parent2: ["chunk2"],
            });
        });

        it("should do nothing if the parent is not in the index", async () => {
            const mockIndex = { parent1: ["chunk1"] };
            (localforage.getItem as Mock).mockResolvedValue(mockIndex);
            await removeParentFromIndex("nonexistent");
            expect(localforage.setItem).not.toHaveBeenCalled();
        });
    });
});
