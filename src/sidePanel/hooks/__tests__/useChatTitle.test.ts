import { renderHook, act, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach, Mock } from "vitest";
import { useChatTitle } from "../useChatTitle";
import { useConfig } from "../../ConfigContext";
import OpenAI from "openai";
import { Conversation, MessageTurn } from "src/types/chatTypes";

vi.mock("../../ConfigContext");

const mockCreate = vi.fn();
vi.mock("openai", () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: mockCreate,
      },
    };
  }
  return { default: MockOpenAI };
});

const mockUseConfig = useConfig as Mock;

describe("useChatTitle", () => {
  let mockOnTitleGenerated: Mock;
  let mockConversation: Conversation;
  let mockTurns: MessageTurn[];

  beforeEach(() => {
    mockOnTitleGenerated = vi.fn();
    mockCreate.mockClear();

    const mockStream = {
      [Symbol.asyncIterator]: async function* () {
        yield { choices: [{ delta: { content: "Generated" } }] };
        yield { choices: [{ delta: { content: " Title" } }] };
      },
    };
    mockCreate.mockResolvedValue(mockStream);

    mockConversation = {
      id: "conv_1",
      title: "",
      createdAt: 0,
      lastUpdatedAt: 0,
    };

    mockTurns = [
      { id: "1", role: "user", content: "Hello", status: "complete", timestamp: 0, conversationId: 'conv_1' },
      { id: "2", role: "assistant", content: "Hi there", status: "complete", timestamp: 1, conversationId: 'conv_1' },
    ];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should strip prefix from model ID for custom endpoints when generating title", async () => {
    const customEndpointId = 'custom_endpoint_for_title';
    const rawModelId = 'my-title-model';
    const prefixedModelId = `${customEndpointId}_${rawModelId}`;

    mockUseConfig.mockReturnValue({
      config: {
        generateTitle: true,
        selectedModel: prefixedModelId,
        models: [{ id: prefixedModelId, host: customEndpointId }],
        customEndpoints: [{
            id: customEndpointId,
            name: 'My Custom Title API',
            endpoint: 'https://my.custom.api/v1',
            apiKey: 'custom-key-title',
            connected: true
        }]
      },
    });

    const { result } = renderHook(() =>
      useChatTitle(false, mockConversation, mockTurns, mockOnTitleGenerated)
    );

    await waitFor(() => {
        expect(mockCreate).toHaveBeenCalled();
    });

    const lastCallArgs = mockCreate.mock.calls[0][0];
    expect(lastCallArgs.model).toBe(rawModelId);
  });
});
