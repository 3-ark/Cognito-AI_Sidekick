/// <reference types="vitest/globals" />
import { vi, describe, it, expect, beforeEach, afterEach, Mock } from "vitest";
import storage, { getStoredAppSettings, getEffectiveBm25Params } from "../storageUtil";
import { Config } from "../../types/config";

const mockChrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
  },
};

global.chrome = mockChrome as any;

const completeMockConfig: Config = {
    personas: {},
    persona: "default",
    contextLimit: 4096,
    temperature: 0.7,
    maxTokens: 512,
    topP: 1,
    presencePenalty: 0,
    panelOpen: true,
    theme: "dark",
    models: [],
    ragConfig: {
        model: "test-model",
        use_gpu: false,
        semantic_top_k: 5,
        similarity_threshold: 0.5,
        BM25_top_k: 10,
        k: 1.5,
        b: 0.8,
        d: 0.6,
        bm25_weight: 0.5,
        autoEmbedOnSave: false,
        final_top_k: 10,
        maxChunkChars: 1,
        minChunkChars: 1,
        overlapChars: 1,
        lambda: 0.5,
        useContextualSummaries: false
    }
};

describe("storageUtil", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getStoredAppSettings", () => {
    it("should retrieve and parse app settings from chrome storage", async () => {
      (mockChrome.storage.local.get as Mock).mockResolvedValue({ config: JSON.stringify(completeMockConfig) });

      const settings = await getStoredAppSettings();
      expect(settings).toEqual(completeMockConfig);
      expect(mockChrome.storage.local.get).toHaveBeenCalledWith("config");
    });

    it("should return null if settings are not found", async () => {
      (mockChrome.storage.local.get as Mock).mockResolvedValue({});
      const settings = await getStoredAppSettings();
      expect(settings).toBeNull();
    });
  });

  describe("getEffectiveBm25Params", () => {
    it("should return params from settings if they exist", async () => {
        (mockChrome.storage.local.get as Mock).mockResolvedValue({ config: JSON.stringify(completeMockConfig) });
        const params = await getEffectiveBm25Params();
        expect(params).toEqual({ k: 1.5, b: 0.8, d: 0.6 });
    });

    it("should return default params if settings or ragConfig are missing", async () => {
        (mockChrome.storage.local.get as Mock).mockResolvedValue({});
        const params = await getEffectiveBm25Params();
        expect(params).toEqual({ k: 1.2, b: 0.75, d: 0.5 });
    });
  });

  describe("default storage object", () => {
    it("storage.getItem should retrieve an item", async () => {
      (mockChrome.storage.local.get as Mock).mockResolvedValue({ myKey: "myValue" });
      const value = await storage.getItem("myKey");
      expect(value).toBe("myValue");
      expect(mockChrome.storage.local.get).toHaveBeenCalledWith("myKey");
    });

    it("storage.setItem should save an item", async () => {
      await storage.setItem("myKey", "myValue");
      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({ myKey: 'myValue' });
    });

    it("storage.deleteItem should remove an item", async () => {
      await storage.deleteItem("myKey");
      expect(mockChrome.storage.local.remove).toHaveBeenCalledWith("myKey");
    });
  });
});
