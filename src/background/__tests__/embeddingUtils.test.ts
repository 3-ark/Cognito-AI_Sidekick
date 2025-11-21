/// <reference types="vitest/globals" />
import { vi, describe, it, expect, beforeEach, afterEach, Mock } from "vitest";
import { getEmbedding } from "../embeddingUtils";
import * as storageUtil from "../storageUtil";

// Mock fetch globally since the module uses it for API calls
global.fetch = vi.fn();

vi.mock("../storageUtil");

describe("embeddingUtils", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // This mock now correctly provides `ragConfig.model`
    (storageUtil.getStoredAppSettings as Mock).mockResolvedValue({
      models: [{ id: "test-model", host: "ollama" }],
      ragConfig: {
        model: "test-model", // Correct property is 'model'
      },
      ollamaUrl: "http://localhost:11434",
    } as any);

    (fetch as Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should call the ollama api and return an embedding", async () => {
    const mockEmbedding = [0.1, 0.2, 0.3];

    const result = await getEmbedding("test content");

    expect(result).toEqual(mockEmbedding);
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:11434/v1/embeddings",
      expect.objectContaining({
        body: JSON.stringify({
          input: "test content",
          model: "test-model",
        }),
      })
    );
  });

  it("should throw an error if the api call fails", async () => {
    (fetch as Mock).mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: "API Error" } }),
    });

    // The function now throws an error, so we test for that
    await expect(getEmbedding("test content")).rejects.toThrow("Failed to get embedding: API Error");
  });
});
