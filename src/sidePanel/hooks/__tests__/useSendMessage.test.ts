import { renderHook, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach, Mock } from "vitest";
import useSendMessage from "../useSendMessage";
import { useConfig } from "../../ConfigContext";
import { useTools } from "../useTools";
import * as useSendMessageHelpers from "../useSendMessageHelpers";
import OpenAI from "openai";

vi.mock("../../ConfigContext");
vi.mock("../useTools");
vi.mock("../useSendMessageHelpers");

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

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {
    workerSrc: "",
  },
  getDocument: vi.fn(),
  version: "3.0.0",
}));

const mockUseConfig = useConfig as Mock;
const mockUseTools = useTools as Mock;

describe("useSendMessage", () => {
  let mockSetTurns: Mock;
  let mockSetLoading: Mock;
  let mockSetChatStatus: Mock;

  beforeEach(() => {
    mockCreate.mockClear();
    mockSetTurns = vi.fn();
    mockSetLoading = vi.fn();
    mockSetChatStatus = vi.fn();

    vi.spyOn(chrome.runtime, 'sendMessage').mockImplementation((...args: any[]) => {
        let message: any;
        let callback: ((response: any) => void) | undefined;

        if (typeof args[0] === 'string') {
            message = args[1];
            callback = typeof args[2] === 'function' ? args[2] : args[3];
        } else {
            message = args[0];
            callback = typeof args[1] === 'function' ? args[1] : args[2];
        }

        if (callback && typeof message === 'object' && message?.payload) {
            const messagesToSave = message.payload.messages || (message.payload.message ? [message.payload.message] : []);
            const savedMessages = (messagesToSave || []).map((m: any, i: number) => ({
              ...m,
              id: m.role === 'assistant' ? 'assistant_1' : `user_${Date.now()}_${i}`
            }));
            callback({ success: true, conversation: message.payload.conversation, messages: savedMessages });
        }
    });

    mockUseConfig.mockReturnValue({
      config: {
        chatMode: "chat",
        selectedModel: "test_model",
        models: [{ id: "test_model", host: "ollama" }],
        ollamaUrl: "http://localhost:11434",
      },
    });

    mockUseTools.mockReturnValue({
      toolDefinitions: [],
      executeToolCall: vi.fn(),
    });

    vi.spyOn(useSendMessageHelpers, "buildSystemPrompt").mockReturnValue("System prompt");
    vi.spyOn(useSendMessageHelpers, "handleUrlScraping").mockResolvedValue("");

    const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: { content: "Hello" } }] };
          yield { choices: [{ delta: { content: " world" } }] };
        },
      };

      mockCreate.mockResolvedValue(mockStream);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should send a message and receive a response", async () => {
    const { result } = renderHook(() =>
      useSendMessage(
        false, "", {id: 'conv_1', title: 'Test Conversation', createdAt: 0, lastUpdatedAt: 0}, [], mockSetTurns, mockUseConfig().config, [], null,
        vi.fn(), vi.fn(), vi.fn(), mockSetLoading, mockSetChatStatus, "", vi.fn()
      )
    );

    await act(async () => {
      await result.current.onSend("Test message");
    });

    expect(mockSetLoading).toHaveBeenCalledWith(true);
    expect(mockSetChatStatus).toHaveBeenCalledWith("thinking");

    const finalUpdateCall = mockSetTurns.mock.calls[mockSetTurns.mock.calls.length - 2];
    expect(finalUpdateCall).toBeDefined();

    if(finalUpdateCall) {
        const updater = finalUpdateCall[0];
        const prevState = [
            { id: 'user_1', role: 'user', content: 'Test message', status: 'complete' },
            { id: 'assistant_1', role: 'assistant', content: 'Hello world', status: 'streaming' }
        ];
        const finalState = updater(prevState);
        const assistantTurn = finalState.find((t: any) => t.id === 'assistant_1');

        expect(assistantTurn.content).toBe("Hello world");
        expect(assistantTurn.status).toBe("complete");
    }
  });

  it("should strip prefix from model ID for custom endpoints", async () => {
    const customEndpointId = 'custom_endpoint_123';
    const rawModelId = 'my-custom-model';
    const prefixedModelId = `${customEndpointId}_${rawModelId}`;

    mockUseConfig.mockReturnValue({
      config: {
        chatMode: "chat",
        selectedModel: prefixedModelId,
        models: [{ id: prefixedModelId, host: customEndpointId }],
        customEndpoints: [{
            id: customEndpointId,
            name: 'My Custom API',
            endpoint: 'https://my.custom.api/v1',
            apiKey: 'custom-key-123',
            connected: true
        }]
      },
    });

    const { result } = renderHook(() =>
      useSendMessage(
        false, "", {id: 'conv_1', title: 'Test Conversation', createdAt: 0, lastUpdatedAt: 0}, [], mockSetTurns, mockUseConfig().config, [], null,
        vi.fn(), vi.fn(), vi.fn(), mockSetLoading, mockSetChatStatus, "", vi.fn()
      )
    );

    await act(async () => {
      await result.current.onSend("Test message to custom endpoint");
    });

    expect(mockCreate).toHaveBeenCalled();
    const lastCallArgs = mockCreate.mock.calls[0][0];
    expect(lastCallArgs.model).toBe(rawModelId);
  });
});
