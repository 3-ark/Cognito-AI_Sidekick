import { renderHook, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach, Mock } from "vitest";
import { useUpdateModels } from "../useUpdateModels";
import { useConfig } from "../../ConfigContext";
import { Config, Model } from "../../../types/config";

vi.mock("../../ConfigContext");

const mockUseConfig = useConfig as Mock;

describe("useUpdateModels", () => {
  let mockUpdateConfig: Mock;
  let mockConfig: Config;

  beforeEach(() => {
    mockUpdateConfig = vi.fn();
    mockConfig = {
      personas: {},
      persona: 'default',
      contextLimit: 4096,
      temperature: 0.7,
      maxTokens: 1024,
      topP: 1,
      presencePenalty: 0,
      panelOpen: true,
      models: [],
      ollamaUrl: "http://localhost:11434",
      ollamaConnected: true,
      geminiApiKey: "test-gemini-key",
    } as Config;

    mockUseConfig.mockReturnValue({
      config: mockConfig,
      updateConfig: mockUpdateConfig,
    });

    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch models from enabled services and update config", async () => {
    const ollamaModels: Model[] = [{ id: "ollama_model", name: "Ollama Model", host: "ollama" }];
    const geminiModels: Model[] = [{ id: "gemini_model", name: "Gemini Model", host: "gemini" }];

    (fetch as Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: ollamaModels }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: geminiModels }),
      });

    const { result } = renderHook(() => useUpdateModels());

    await act(async () => {
      await result.current.fetchAllModels();
    });

    expect(fetch).toHaveBeenCalledWith("http://localhost:11434/v1/models", expect.any(Object));
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("generativelanguage.googleapis.com"), expect.any(Object));

    expect(mockUpdateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        models: expect.arrayContaining([
            expect.objectContaining({ id: 'ollama_model' }),
            expect.objectContaining({ id: 'gemini_model' }),
        ]),
      })
    );
  });

  it("should handle fetch errors gracefully and update connection status", async () => {
    (fetch as Mock).mockResolvedValue({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useUpdateModels());

    await act(async () => {
      await result.current.fetchAllModels();
    });

    expect(mockUpdateConfig).toHaveBeenCalledWith({
        ollamaConnected: false
    });
  });

  it("should not update config if models have not changed", async () => {
    const existingModels: Model[] = [{ id: "ollama_model", name: "Ollama Model", host: "ollama" }];
    mockConfig.models = existingModels;
    mockConfig.selectedModel = "ollama_model";

    (fetch as Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: existingModels }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

    const { result } = renderHook(() => useUpdateModels());

    await act(async () => {
        await result.current.fetchAllModels();
    });

    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });
});
