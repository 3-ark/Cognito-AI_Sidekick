/// <reference types="vitest/globals" />
import { vi, describe, it, expect, beforeEach, afterEach, Mock } from "vitest";
import { getCompletion } from "../generationUtils";
import * as storageUtil from "../storageUtil";

vi.mock("../storageUtil");

// Mock fetch globally
global.fetch = vi.fn();

describe("generationUtils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (fetch as Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "test completion" } }] }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should call ollama compatible endpoint", async () => {
    (storageUtil.getStoredAppSettings as Mock).mockResolvedValue({
      selectedModel: "ollama-model",
      models: [{ id: "ollama-model", host: "ollama" }],
      ollamaUrl: "http://localhost:11434",
    } as any);

    await getCompletion([]);
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:11434/v1/chat/completions",
      expect.any(Object)
    );
  });

  it("should call groq endpoint", async () => {
    (storageUtil.getStoredAppSettings as Mock).mockResolvedValue({
      selectedModel: "groq-model",
      models: [{ id: "groq-model", host: "groq" }],
      groqApiKey: "groq-key",
    } as any);

    await getCompletion([]);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/chat/completions",
      expect.any(Object)
    );
  });

  it("should call openai endpoint", async () => {
    (storageUtil.getStoredAppSettings as Mock).mockResolvedValue({
      selectedModel: "openai-model",
      models: [{ id: "openai-model", host: "openai" }],
      openAiApiKey: "openai-key",
    } as any);

    await getCompletion([]);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.any(Object)
    );
  });

  it("should call gemini endpoint", async () => {
    (storageUtil.getStoredAppSettings as Mock).mockResolvedValue({
      selectedModel: "gemini-model",
      models: [{ id: "gemini-model", host: "gemini" }],
      geminiApiKey: "gemini-key",
    } as any);

    await getCompletion([]);
    expect(fetch).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      expect.any(Object)
    );
  });
});
