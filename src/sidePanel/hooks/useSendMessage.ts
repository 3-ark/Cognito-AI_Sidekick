import {
 Dispatch, SetStateAction, useEffect, useRef, 
} from 'react';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import * as pdfjsLib from 'pdfjs-dist';

import storage from 'src/background/storageUtil';
import type { Config, Model } from 'src/types/config';
import ChannelNames from '../../types/ChannelNames';
import { Conversation, MessageTurn, RetrieverResult } from '../../types/chatTypes';
import { ChatMode, ChatStatus } from '../../types/config';
import { Note } from '../../types/noteTypes';
import type { LLMToolCall } from '../../types/toolTypes';
import { processQueryWithAI,webSearch } from '../network';
import { scrapeUrlContent } from '../utils/scrapers';

import { useTools } from './useTools';
import { handleUrlScraping, handleWebSearch, handlePageContent, buildSystemPrompt } from './useSendMessageHelpers';

try {
  const workerUrl = chrome.runtime.getURL('pdf.worker.mjs');

  if (workerUrl) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  }
} catch (e) {
  console.error("Error setting pdf.js worker source:", e);
}

export const getAuthHeader = (config: Config, currentModel: Model) => {
  const host = currentModel?.host?.toLowerCase();
  let apiKey: string | undefined;
  const standardHosts = ['groq', 'gemini', 'openai', 'openrouter', 'ollama', 'lmstudio'];

  if (host && !standardHosts.includes(host)) {
    const endpoint = config.customEndpoints?.find(e => e.id === host);
    apiKey = endpoint?.apiKey;
  } else {
    const hostMap = {
      groq: config.groqApiKey,
      gemini: config.geminiApiKey,
      openai: config.openAiApiKey,
      openrouter: config.openRouterApiKey,
    };
    apiKey = hostMap[host as keyof typeof hostMap];
  }

  return apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined;
};

const useSendMessage = (
  isLoading: boolean,
  originalMessage: string,
  conversation: Conversation | null,
  turns: MessageTurn[],
  setTurns: Dispatch<SetStateAction<MessageTurn[]>>,
  config: Config | null | undefined,
  selectedNotesForContext: Note[],
  retrieverResults: RetrieverResult | null,
  setMessage: Dispatch<SetStateAction<string>>,
  setWebContent: Dispatch<SetStateAction<string>>,
  setPageContent: Dispatch<SetStateAction<string>>,
  setLoading: Dispatch<SetStateAction<boolean>>,
  setChatStatus: Dispatch<SetStateAction<ChatStatus>>,
  sessionContext: string,
  setSessionContext: Dispatch<SetStateAction<string>>,
) => {
  const completionGuard = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const assistantMessageIdRef = useRef<string | null>(null);
  const { toolDefinitions, executeToolCall } = useTools();

  useEffect(() => {
    const loadContext = async () => {
      if (conversation?.id) {
        const contextKey = `session_context_${conversation.id}`;
        const result = await chrome.storage.local.get(contextKey);

        if (result[contextKey]) {
          setSessionContext(result[contextKey] as string);
        } else {
          setSessionContext("");
        }
      }
    };

    loadContext();
  }, [conversation?.id, setSessionContext]);

  const updateAssistantTurn = (
    callId: number | null,
    update: string,
    isFinished: boolean,
    isError?: boolean,
    isCancelled?: boolean,
    toolCallsPayload?: LLMToolCall[],
    conversationOverride?: Conversation | null,
    generationInfo?: {
      promptTokens: number;
      completionTokens: number;
      tokensPerSecond: number;
    },
    retrieverResults?: RetrieverResult | null,
  ) => {
    if (completionGuard.current !== callId && !isFinished && !isError && !isCancelled) return;

    if (completionGuard.current === null && callId !== null) {
      if ((update === "" && isFinished && !isError && !isCancelled) ||
        (isError && (update.includes("Operation cancelled by user") || update.includes("Streaming operation cancelled")))) {
        setLoading(false);
        setChatStatus('idle');

        return;
      }
    }

    const assistantMessageId = assistantMessageIdRef.current;

    if (!assistantMessageId) return;

    setTurns(prevTurns => {
        const turnIndex = prevTurns.findIndex(t => t.id === assistantMessageId);

        if (turnIndex === -1) return prevTurns;

        const turnToUpdate = prevTurns[turnIndex];
        const updatedStatus: MessageTurn['status'] = isError ? 'error' : isCancelled ? 'cancelled' : isFinished ? 'complete' : 'streaming';
        let finalContentForTurn: string;

        if (isCancelled) {
            const existingContent = turnToUpdate.content || "";

            finalContentForTurn = existingContent + (existingContent ? " " : "") + update;
        } else if (isError) {
            finalContentForTurn = `Error: ${update || 'Unknown stream/handler error'}`;
        } else {
            finalContentForTurn = update;
        }

        const updatedTurn = {
            ...turnToUpdate,
            content: finalContentForTurn,
            status: updatedStatus,
            timestamp: Date.now(),
            ...(toolCallsPayload && { tool_calls: toolCallsPayload }),
            ...(generationInfo && {
              promptTokens: generationInfo.promptTokens,
              completionTokens: generationInfo.completionTokens,
              tokensPerSecond: generationInfo.tokensPerSecond,
            }),
            ...(retrieverResults && { retrieverResults: retrieverResults }),
        };

        const newTurns = [...prevTurns];

        newTurns[turnIndex] = updatedTurn;

        return newTurns;
    });

    if (isFinished || isError || isCancelled) {
      setLoading(false);
      setChatStatus(isError || isCancelled ? 'idle' : 'done');

      if (completionGuard.current === callId) {
        completionGuard.current = null;
        abortControllerRef.current = null;
      }

      setTurns(prevTurns => {
        const finalTurn = prevTurns.find(t => t.id === assistantMessageId);

        if (finalTurn) {
            chrome.runtime.sendMessage({
                type: ChannelNames.SAVE_CHAT_REQUEST,
                payload: { conversation: conversationOverride || conversation, message: finalTurn },
            });
        }

        return prevTurns;
      });
      assistantMessageIdRef.current = null;
    }
  };

  const turnToApiMessage = (turn: MessageTurn): ChatCompletionMessageParam => {
    const content = turn.content || "";

    switch (turn.role) {
      case 'user':
        return { role: 'user', content };

      case 'assistant': {
        const assistantMsg: Partial<OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam> = { role: 'assistant' };

        if (turn.content) assistantMsg.content = turn.content;

        if (turn.tool_calls?.length) {
          assistantMsg.tool_calls = turn.tool_calls.map((tc: LLMToolCall) => ({
            id: tc.id,
            type: tc.type,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          }));
          delete assistantMsg.content;
        }

        return assistantMsg as OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam;
      }

      case 'tool':
        if (!turn.tool_call_id) {
          return {
            role: 'tool',
            tool_call_id: `error_missing_id_for_${turn.name || 'unknown_tool'}`,
            content: `Error: Tool call ID missing. Original content: ${content}`,
          };
        }

        return {
          role: 'tool',
          tool_call_id: turn.tool_call_id,
          content: content,
        };

      default:
        return { role: 'user', content: `Error: Unhandled role '${(turn as any).role}'. Original content: ${content}` };
    }
  };

  const onSend = async (
    overridedMessage?: string,
    conversationOverride?: Conversation,
    options?: { turns?: MessageTurn[]; deleteMessageId?: string; context?: string, skipUserTurn?: boolean },
  ): Promise<Conversation | null | undefined> => {
    console.log(`[Cognito DEBUG] useSendMessage.onSend called with message: "${overridedMessage}"`);

    if (options?.deleteMessageId) {
      chrome.runtime.sendMessage({
        type: ChannelNames.DELETE_CHAT_MESSAGE_REQUEST,
        payload: { messageId: options.deleteMessageId },
      });
    }

    let conversationToUse = conversationOverride || conversation;
    const callId = Date.now();
    const isContinuation = !!options?.turns;
    const turnsContext = options?.turns || turns;
    const isNewMessage = overridedMessage !== undefined;
    const originalMessageFromInput = overridedMessage || "";
    const messageForLLM = originalMessageFromInput.trim();

    if (retrieverResults && retrieverResults.formattedResults.trim() !== "") {
      // Will be added to system prompt later
    }

    if (!config || !conversationToUse) {
      setLoading(false);
      return;
    }

    if (isNewMessage && !originalMessageFromInput.trim() && (!selectedNotesForContext || selectedNotesForContext.length === 0) && (!retrieverResults || retrieverResults.formattedResults.trim() === "")) {
      setLoading(false);
      return;
    }

    if (completionGuard.current !== null) {
      abortControllerRef.current?.abort();
    }

    const controller = new AbortController();

    abortControllerRef.current = controller;
    setLoading(true);
    setWebContent('');
    setPageContent('');

    const currentChatMode = config.chatMode || 'chat';
    const statusMap: Record<ChatMode, ChatStatus> = {
 web: 'searching', page: 'reading', chat: 'thinking', file: 'reading', 
};

    setChatStatus(statusMap[currentChatMode]);
    completionGuard.current = callId;

    const scrapedContent = await handleUrlScraping(originalMessageFromInput, controller.signal, setChatStatus);

    const sendMessagePromise = (payload: any) => {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(payload, response => {
          if (response.success) {
            resolve(response);
          } else {
            reject(new Error(response.error));
          }
        });
      });
    };

    const turnsToProcess = [];

    if (isNewMessage && !isContinuation && !options?.skipUserTurn) {
      const userTurn: Partial<MessageTurn> = {
        role: 'user',
        status: 'complete',
        content: originalMessageFromInput,
        timestamp: Date.now(),
        conversationId: conversationToUse?.id,
        ...(retrieverResults && { retrieverResults: retrieverResults }),
      };
      turnsToProcess.push(userTurn);
    }

    const assistantTurnPlaceholder: Partial<MessageTurn> = {
      role: 'assistant',
      content: '',
      status: 'streaming',
      timestamp: Date.now() + 1,
      conversationId: conversationToUse?.id,
    };
    turnsToProcess.push(assistantTurnPlaceholder);

    try {
      const saveTurnsResponse: any = await sendMessagePromise({
        type: ChannelNames.SAVE_CHAT_REQUEST,
        payload: { conversation: conversationToUse, messages: turnsToProcess },
      });

      if (saveTurnsResponse.success && saveTurnsResponse.conversation) {
        conversationToUse = saveTurnsResponse.conversation;
        const newTurns = saveTurnsResponse.messages || [];
        const assistantMessage = newTurns.find((m: MessageTurn) => m.role === 'assistant');

        if (isContinuation) {
          setTurns([...turnsContext, ...newTurns]);
        } else if (isNewMessage) {
          setTurns(prev => [...prev, ...newTurns]);
        } else {
          setTurns(prev => [...prev, assistantMessage]);
        }
        if (assistantMessage) {
          assistantMessageIdRef.current = assistantMessage.id;
        }
      }

      const performSearch = config?.chatMode === 'web';
      const currentModel = config?.models?.find(m => m.id === config.selectedModel);
      let queryForProcessing = messageForLLM;
      let searchRes = '';

      if (!currentModel) {
        updateAssistantTurn(callId, "Configuration error: No model selected.", true, true, false, [], undefined, undefined, retrieverResults);
        return;
      }

      const authHeader = getAuthHeader(config, currentModel);

      if (performSearch) {
        try {
          const webSearchResult = await handleWebSearch(
            messageForLLM,
            config,
            currentModel,
            turnsContext,
            controller,
            setChatStatus,
            (callId, update, isFinished, isError) => updateAssistantTurn(callId, update, isFinished, isError),
            setTurns,
            callId
          );
          queryForProcessing = webSearchResult.queryForProcessing;
          searchRes = webSearchResult.searchRes;
        } catch (error) {
          // Error is already handled in handleWebSearch, just stop execution here
          return;
        }
      }

      const messageToUse = performSearch ? queryForProcessing : messageForLLM;
      const webLimit = 1000 * (config?.webLimit || 1);
      const webContentForLlm = config?.webLimit === 128 ? searchRes : searchRes.substring(0, webLimit);

      let pageContentForLlm = '';
      if (config?.chatMode === 'page') {
        pageContentForLlm = await handlePageContent(config, setChatStatus, setPageContent, callId);
      } else {
        setPageContent('');
      }

      const finalSessionContext = options?.context ?? sessionContext;
      const systemContent = buildSystemPrompt(
        config,
        pageContentForLlm,
        webContentForLlm,
        scrapedContent,
        retrieverResults?.formattedResults,
        finalSessionContext
      );

      setChatStatus('thinking');
      const host = currentModel.host || '';
      let url = '';
      const standardHosts = ['groq', 'ollama', 'gemini', 'lmStudio', 'openai', 'openrouter'];

      if (host && !standardHosts.includes(host)) {
        const endpoint = config.customEndpoints?.find(e => e.id === host);

        if (endpoint?.endpoint) {
          url = endpoint.endpoint;
        }
      } else {
        const urlMap: Record<string, string> = {
            groq: 'https://api.groq.com/openai/v1',
            ollama: `${config?.ollamaUrl || ''}/v1`,
            gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
            lmStudio: `${config?.lmStudioUrl || ''}/v1`,
            openai: 'https://api.openai.com/v1',
            openrouter: 'https://openrouter.ai/api/v1',
        };

        url = urlMap[host];
      }

      if (!url) {
        updateAssistantTurn(callId, `Configuration error: Could not determine API URL for host '${currentModel.host}'.`, true, true, false, [], conversationToUse, undefined, retrieverResults);

        return;
      }

      const openai = new OpenAI({
        apiKey: authHeader ? authHeader.Authorization.split(' ')[1] : '',
        baseURL: url,
        dangerouslyAllowBrowser: true,
      });

      const messagesToSendToApi: ChatCompletionMessageParam[] = [];

      if (systemContent) messagesToSendToApi.push({ role: 'system', content: systemContent });

      const previousTurnsApi = turnsContext
        .filter(t => t.role !== 'assistant' || t.status === 'complete')
        .map(turnToApiMessage);

      messagesToSendToApi.push(...previousTurnsApi);

      if (isNewMessage) {
        if (messagesToSendToApi.length > 0 && messagesToSendToApi[messagesToSendToApi.length - 1].role === 'user') {
          messagesToSendToApi.pop();
        }

        messagesToSendToApi.push({ role: 'user', content: messageForLLM });
      }

      const modelIdToSend = (currentModel.host && config.selectedModel?.startsWith(`${currentModel.host}_`))
        ? config.selectedModel.substring(currentModel.host.length + 1)
        : config.selectedModel;

      const callOpenAI = (messages: ChatCompletionMessageParam[]) => {
        const apiCallParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
          model: modelIdToSend || '',
          stream: true,
          messages: messages,
          temperature: config?.temperature ?? 0.7,
          max_tokens: config?.maxTokens ?? 32048,
          top_p: config?.topP ?? 1,
          presence_penalty: config?.presencePenalty ?? 0,
          stream_options: { include_usage: true },
        };

        if (host !== 'openrouter' && toolDefinitions && toolDefinitions.length > 0) {
          apiCallParams.tools = toolDefinitions;
        }

        return openai.chat.completions.create(apiCallParams);
      };

      let startTime = Date.now();
      const stream = await callOpenAI(messagesToSendToApi);
      let collectedContent = "";
      let usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      } | undefined;
      const collectedToolCalls: any[] = [];

      for await (const chunk of stream) {
        if (controller.signal.aborted) break;

        const delta = chunk.choices[0]?.delta;

        if (delta?.content) collectedContent += delta.content;

        if (delta?.tool_calls) {
          delta.tool_calls.forEach((toolCallChunk, index) => {
            if (!collectedToolCalls[index]) collectedToolCalls[index] = { function: { arguments: "" } };
            if (toolCallChunk.id) collectedToolCalls[index].id = toolCallChunk.id;
            if (toolCallChunk.type) collectedToolCalls[index].type = toolCallChunk.type;
            if (toolCallChunk.function?.name) collectedToolCalls[index].function.name = toolCallChunk.function.name;
            if (toolCallChunk.function?.arguments) collectedToolCalls[index].function.arguments += toolCallChunk.function.arguments;
          });
        }

        if (chunk.usage) {
          usage = chunk.usage;
        }

        if (collectedContent) updateAssistantTurn(callId, collectedContent, false, false, false, [], conversationToUse, undefined, retrieverResults);
      }

      if (controller.signal.aborted) {
        updateAssistantTurn(callId, collectedContent, true, false, true, [], conversationToUse, undefined, retrieverResults);
        return;
      }

      if (collectedToolCalls.length > 0) {
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        const tokensPerSecond = usage ? Math.round(usage.completion_tokens / duration) : 0;
        const generationInfo = usage ? {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          tokensPerSecond: tokensPerSecond,
        } : undefined;

        collectedToolCalls.forEach(tc => { if (!tc.id) tc.id = tc.function.name; });
        updateAssistantTurn(callId, collectedContent, true, false, false, collectedToolCalls, conversationToUse, generationInfo, retrieverResults);

        const toolResults = await Promise.all(collectedToolCalls.map(executeToolCall));

        const toolErrors = toolResults.filter(result =>
            typeof result.result === 'string' && (
            result.result.startsWith('[Error') ||
            result.result.startsWith('[Timeout') ||
            result.result.startsWith('Error:') ||
            result.result.includes('failed with status')
            ),
        );

        if (toolErrors.length > 0) {
            const errorMessage = `I encountered an error with the following tool(s): ${toolErrors.map(e => e.name).join(', ')}. Details: ${toolErrors.map(e => e.result).join('; ')}`;
            updateAssistantTurn(callId, errorMessage, true, true, false, [], conversationToUse, undefined, retrieverResults);
            return;
        }

        const toolTurnPromises = toolResults.map(result => {
          let finalResult = result.result;
          if (typeof finalResult === 'string' && finalResult.trim() === '') {
            finalResult = `[Tool '${result.name}' executed but returned no content.]`;
          }
          return new Promise<MessageTurn>((resolve, reject) => {
            const turn: Partial<MessageTurn> = {
              role: 'tool',
              status: 'complete',
              tool_call_id: result.toolCallId,
              name: result.name,
              content: finalResult,
              timestamp: Date.now(),
              conversationId: conversationToUse ? conversationToUse.id : undefined,
            };
            chrome.runtime.sendMessage(
              { type: ChannelNames.SAVE_CHAT_REQUEST, payload: { conversation: conversationToUse, message: turn } },
              response => {
                if (response.success) {
                  resolve(response.message);
                } else {
                  console.error("Failed to save tool turn:", response.error);
                  reject(new Error(response.error || "Failed to save tool turn"));
                }
              },
            );
          });
        });

        const newToolTurns = await Promise.all(toolTurnPromises);
        setTurns(prevTurns => [...prevTurns, ...newToolTurns]);

        const finalAssistantPlaceholder: Partial<MessageTurn> = {
          role: 'assistant',
          content: '',
          status: 'streaming',
          timestamp: Date.now() + 1,
          conversationId: conversationToUse ? conversationToUse.id : undefined,
        };
        const assistantResponse: any = await new Promise(resolve => {
            chrome.runtime.sendMessage({ type: ChannelNames.SAVE_CHAT_REQUEST, payload: { conversation: conversationToUse, message: finalAssistantPlaceholder } }, response => {
                resolve(response);
            });
        });

        if (assistantResponse.success) {
            setTurns(prevTurns => [...prevTurns, assistantResponse.message]);
            assistantMessageIdRef.current = assistantResponse.message.id;
        }

        const messagesForSecondCall = [...messagesToSendToApi];
        messagesForSecondCall.push({ role: 'assistant', content: null, tool_calls: collectedToolCalls });
        messagesForSecondCall.push(...newToolTurns.map(turnToApiMessage));

        startTime = Date.now();
        const finalStream = await callOpenAI(messagesForSecondCall);
        let finalContent = "";
        let finalUsage: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        } | undefined;

        for await (const chunk of finalStream) {
          if (controller.signal.aborted) break;
          finalContent += chunk.choices[0]?.delta?.content || "";
          if (chunk.usage) finalUsage = chunk.usage;
          updateAssistantTurn(callId, finalContent, false, false, false, [], conversationToUse, undefined, retrieverResults);
        }

        if (!controller.signal.aborted || finalContent) {
          const endTime = Date.now();
          const duration = (endTime - startTime) / 1000;
          const tokensPerSecond = finalUsage ? Math.round(finalUsage.completion_tokens / duration) : 0;
          const generationInfo = finalUsage ? {
            promptTokens: finalUsage.prompt_tokens,
            completionTokens: finalUsage.completion_tokens,
            tokensPerSecond: tokensPerSecond,
          } : undefined;
          updateAssistantTurn(callId, finalContent, true, false, controller.signal.aborted, [], conversationToUse, generationInfo, retrieverResults);
        }
      } else {
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;
        const tokensPerSecond = usage ? Math.round(usage.completion_tokens / duration) : 0;
        const generationInfo = usage ? {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          tokensPerSecond: tokensPerSecond,
        } : undefined;
        updateAssistantTurn(callId, collectedContent, true, false, controller.signal.aborted, [], conversationToUse, generationInfo, retrieverResults);
      }
    } catch (error) {
      if (controller.signal.aborted) {
        updateAssistantTurn(callId, "[Operation cancelled by user]", true, false, true, [], conversationToUse, undefined, retrieverResults);
      } else if (typeof error === 'object' && error !== null && 'name' in error && (error as any).name !== 'AbortError') {
        const errorMessage = error instanceof Error ? error.message : String(error);
        updateAssistantTurn(callId, errorMessage, true, true, false, [], conversationToUse, undefined, retrieverResults);
      }
    } finally {
      // The clearing of retriever results is now handled by the parent component.
    }
    return conversationToUse;
  };

  const onStop = () => {
    if (completionGuard.current !== null && abortControllerRef.current) {
      abortControllerRef.current.abort();
    } else {
      setLoading(false);
      setChatStatus('idle');
    }
  };

  return { onSend, onStop };
};

export default useSendMessage;
