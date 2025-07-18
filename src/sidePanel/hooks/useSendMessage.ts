import { Dispatch, SetStateAction, useRef } from 'react';
import { MessageTurn } from '../../background/chatHistoryStorage';
import { fetchDataAsStream, webSearch, processQueryWithAI } from '../network';
import { scrapeUrlContent } from '../utils/scrapers';
import storage from 'src/background/storageUtil';
import type { Config, Model } from 'src/types/config';
import { normalizeApiEndpoint } from 'src/background/util';
import { ChatMode, ChatStatus } from '../../types/config';
import { useTools } from './useTools';
import type { LLMToolCall } from './useTools';
import type { Note } from '../../types/noteTypes';
import * as pdfjsLib from 'pdfjs-dist';
import type { HybridRankedChunk } from 'src/background/retrieverUtils';

// --- NEW HELPER FUNCTION FOR RAG RESULTS ---
const buildPromptFromRetrieverChunks = (
  retrieverChunks: HybridRankedChunk[]
): { promptContext: string; sourcesString: string } => {
  if (!retrieverChunks || retrieverChunks.length === 0) {
    return { promptContext: "", sourcesString: "" };
  }

  let promptContext = "Use the following search results to answer. Cite sources using the provided footnote markers (e.g., [^1], [^2]) where appropriate. Do NOT include a 'Sources' or 'Footnotes' section at the end of your response; this will be added automatically.\n\n";
  let sourcesString = "### Sources\n";
  let citationCounter = 1;

  const chunksBySource = new Map<string, HybridRankedChunk[]>();
  const sourceInfoMap = new Map<string, { citationNum: number; chunk: HybridRankedChunk }>();

  for (const chunk of retrieverChunks) {
    const sourceKey = chunk.parentId;
    if (!chunksBySource.has(sourceKey)) {
      chunksBySource.set(sourceKey, []);
      sourceInfoMap.set(sourceKey, { citationNum: citationCounter++, chunk });
    }
    chunksBySource.get(sourceKey)!.push(chunk);
  }

  const sortedSourceInfo = Array.from(sourceInfoMap.entries()).sort((a, b) => a[1].citationNum - b[1].citationNum);

  for (const [sourceKey, { citationNum, chunk }] of sortedSourceInfo) {
    const sourceType = chunk.parentType === 'note' ? 'Note' : 'Chat';
    const title = chunk.parentTitle || 'Untitled';
    
    promptContext += `### Source [${citationNum}]: ${sourceType}: "${title}"\n`;
    const chunks = chunksBySource.get(sourceKey)!;
    for (const c of chunks) {
      promptContext += `${c.chunkText}\n\n`;
    }

    sourcesString += `[^${citationNum}]: ${sourceType}: "${title}"`;
    if (chunk.parentType === 'note' && chunk.originalUrl) {
      sourcesString += ` (URL: ${chunk.originalUrl})`;
    }
    sourcesString += '\n';
  }

  return { promptContext, sourcesString };
};


export const robustlyParseLlmResponseForToolCall = (responseText: string): any | null => {
  try {
    return JSON.parse(responseText);
  } catch (e) { /* Ignore */ }

  const jsonFenceMatch = responseText.match(/```json\n([\s\S]*?)\n```/s);
  if (jsonFenceMatch && jsonFenceMatch[1]) {
    try {
      return JSON.parse(jsonFenceMatch[1]);
    } catch (e) { /* Ignore */ }
  }

  const genericFenceMatch = responseText.match(/```\n([\s\S]*?)\n```/s);
  if (genericFenceMatch && genericFenceMatch[1]) {
    try {
      return JSON.parse(genericFenceMatch[1]);
    } catch (e) { /* Ignore */ }
  }

  const firstBrace = responseText.indexOf('{');
  const lastBrace = responseText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const potentialJson = responseText.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(potentialJson);
    } catch (e) { /* Ignore */ }
  }

  return null;
};

try {
  const workerUrl = chrome.runtime.getURL('pdf.worker.mjs');
  if (workerUrl) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  } else {
    console.error("Failed to get URL for pdf.worker.mjs. PDF parsing might fail.");
  }
} catch (e) {
    console.error("Error setting pdf.js worker source:", e);
}

interface ApiMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: LLMToolCall[];
}

export const getAuthHeader = (config: Config, currentModel: Model) => {
  if (currentModel?.host === 'groq' && config.groqApiKey) return { Authorization: `Bearer ${config.groqApiKey}` };
  if (currentModel?.host === 'gemini' && config.geminiApiKey) return { Authorization: `Bearer ${config.geminiApiKey}` };
  if (currentModel?.host === 'openai' && config.openAiApiKey) return { Authorization: `Bearer ${config.openAiApiKey}` };
  if (currentModel?.host === 'openrouter' && config.openRouterApiKey) return { Authorization: `Bearer ${config.openRouterApiKey}` };
  if (currentModel?.host === 'custom' && config.customApiKey) return { Authorization: `Bearer ${config.customApiKey}` };
  return undefined;
};

async function extractTextFromPdf(pdfUrl: string, callId?: number): Promise<string> {
  try {
    const response = await fetch(pdfUrl);
    if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
    const arrayBuffer = await response.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      fullText += textContent.items.map(item => ('str' in item ? item.str : '')).join(' ') + '\n\n';
    }
    return fullText.trim();
  } catch (error) {
    console.error(`[${callId || 'PDF'}] Error extracting text from PDF (${pdfUrl}):`, error);
    throw error;
  }
}

const useSendMessage = (
  isLoading: boolean,
  originalMessage: string,
  currentTurns: MessageTurn[],
  _webContent: string,
  config: Config | null | undefined,
  selectedNotesForContext: Note[],
  retrieverQuery: string,
  setTurns: Dispatch<SetStateAction<MessageTurn[]>>,
  setMessage: Dispatch<SetStateAction<string>>,
  setRetrieverQuery: Dispatch<SetStateAction<string>>,
  setWebContent: Dispatch<SetStateAction<string>>,
  setPageContent: Dispatch<SetStateAction<string>>,
  setLoading: Dispatch<SetStateAction<boolean>>,
  setChatStatus: Dispatch<SetStateAction<ChatStatus>>
) => {
  const completionGuard = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toolDefinitions, executeToolCall } = useTools();

  const updateAssistantTurn = (
    callId: number | null,
    update: string,
    isFinished: boolean,
    isError?: boolean,
    isCancelled?: boolean,
    toolCallsPayload?: LLMToolCall[]
  ) => {
    if (completionGuard.current !== callId && !isFinished && !isError && !isCancelled) {
      if (completionGuard.current !== null) console.warn(`[${callId}] updateAssistantTurn: Guard mismatch (current: ${completionGuard.current}), skipping non-final update.`);
      return;
    }
    setTurns(prevTurns => {
      if (prevTurns.length === 0 || prevTurns[prevTurns.length - 1].role !== 'assistant') {
        if (isError) return [...prevTurns, { role: 'assistant', content: `Error: ${update || 'Unknown operation error'}`, status: 'error', timestamp: Date.now(), ...(toolCallsPayload && { tool_calls: toolCallsPayload }) }];
        return prevTurns;
      }
      const lastTurn = prevTurns[prevTurns.length - 1];
      const updatedStatus = (isError === true) ? 'error' : (isCancelled === true) ? 'cancelled' : (isFinished ? 'complete' : 'streaming');
      let finalContentForTurn = isCancelled ? (lastTurn.content || "") + (lastTurn.content ? " " : "") + update : isError ? `Error: ${update || 'Unknown stream/handler error'}` : update;
      return [...prevTurns.slice(0, -1), { ...lastTurn, content: finalContentForTurn, status: updatedStatus, timestamp: Date.now(), ...(toolCallsPayload && { tool_calls: toolCallsPayload }) }];
    });

    if (isFinished || isError || isCancelled) {
      setLoading(false);
      setChatStatus(isError || isCancelled ? 'idle' : 'done');
      if (completionGuard.current === callId) completionGuard.current = null;
    }
  };

  const turnToApiMessage = (turn: MessageTurn): ApiMessage => {
    const apiMsg: ApiMessage = { role: turn.role, content: turn.content || null };
    if (turn.role === 'tool') {
      if (turn.name) apiMsg.name = turn.name;
      if (turn.tool_call_id) apiMsg.tool_call_id = turn.tool_call_id;
    }
    if (turn.role === 'assistant' && turn.tool_calls && turn.tool_calls.length > 0) {
      apiMsg.tool_calls = turn.tool_calls;
      // **FIX 1: API Compliance** - Content must be null when tool_calls is present.
      apiMsg.content = null;
    }
    return apiMsg;
  };

  const onSend = async (overridedMessage?: string) => {
    const callId = Date.now();
    console.log(`[${callId}] onSend triggered.`);

    if (!config) return console.log(`[${callId}] Bailing out: Missing config.`);
    const originalMessageFromInput = overridedMessage || "";
    let messageForLLM = originalMessageFromInput.trim();
    if (!messageForLLM && !selectedNotesForContext?.length && !retrieverQuery) return console.log(`[${callId}] Bailing out: Empty message and no context.`);

    if (completionGuard.current !== null) {
      console.warn(`[${callId}] Aborting previous send operation (ID: ${completionGuard.current}).`);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    completionGuard.current = callId;

    setLoading(true);
    setWebContent('');
    setPageContent('');
    setMessage('');

    let sourcesStringForAppending = "";

    // --- CONTEXT PREPARATION ---
    if (retrieverQuery && retrieverQuery.trim() !== "") {
      setChatStatus('searching');
      try {
        console.log(`[${callId}] Performing hybrid search for query: "${retrieverQuery}"`);
        
        const response = await new Promise<{ success: boolean; results?: HybridRankedChunk[]; error?: string }>((resolve, reject) => {
          chrome.runtime.sendMessage({ type: 'GET_BM25_SEARCH_RESULTS', payload: { query: retrieverQuery } }, (res) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message)); else resolve(res);
          });
        });
        if (response.success) {
          const { promptContext, sourcesString } = buildPromptFromRetrieverChunks(response.results || []);
          if (promptContext) {
            messageForLLM = `${promptContext}\n\n---\n\n${messageForLLM}`;
            sourcesStringForAppending = sourcesString;
          }
        } else throw new Error(response.error || "Unknown search error.");
      } catch (error: any) {
        messageForLLM = `(I tried to search my knowledge base but got an error: ${error.message})\n${messageForLLM}`;
      }
      setRetrieverQuery('');
    }
    if (selectedNotesForContext?.length) messageForLLM += selectedNotesForContext.map(note => `\n\n---\nUser-provided note: "${note.title}"\nContent:\n${note.content}\n---`).join('');
    const urls = originalMessageFromInput.match(/(https?:\/\/[^\s]+)/g);
    console.log(`[${callId}] Message for LLM: "${messageForLLM}"`);
    let scrapedContent = '';
    if (urls?.length) {
      setChatStatus('searching');
      try {
        scrapedContent = (await Promise.all(urls.map(url => scrapeUrlContent(url, controller.signal)))).map((content, idx) => `Content from [${urls[idx]}]:\n${content}`).join('\n\n');
      } catch (e) { scrapedContent = '[Error scraping one or more URLs]'; }
    }

    const userTurn: MessageTurn = { role: 'user', status: 'complete', content: originalMessageFromInput, timestamp: Date.now() };
    setTurns(prevTurns => [...prevTurns, userTurn]);
    const assistantTurnPlaceholder: MessageTurn = { role: 'assistant', content: '', status: 'streaming', timestamp: Date.now() + 1 };
    setTurns(prevTurns => [...prevTurns, assistantTurnPlaceholder]);

    const currentModel = config.models?.find(m => m.id === config.selectedModel);
    if (!currentModel) {
      updateAssistantTurn(callId, "Configuration error: No model selected.", true, true);
      return;
    }
    const authHeader = getAuthHeader(config, currentModel);

    let queryForProcessing = messageForLLM;
    let searchRes: string = '';
    let processedQueryDisplay = '';
    const performSearch = config?.chatMode === 'web';

    if (performSearch) {
      setChatStatus('thinking');
      const historyForQueryOptimization = currentTurns.map(turn => ({ role: turn.role, content: turn.content }));
      try {
        const optimizedQuery = await processQueryWithAI(messageForLLM, config, currentModel, authHeader, controller.signal, historyForQueryOptimization);
        if (optimizedQuery && optimizedQuery.trim() && optimizedQuery !== messageForLLM) {
          queryForProcessing = optimizedQuery;
          processedQueryDisplay = `**Optimized query:** "*${queryForProcessing}*"\n\n`;
        } else {
          queryForProcessing = messageForLLM;
          processedQueryDisplay = `**Original query:** "*${queryForProcessing}"\n\n`;
        }
      } catch (optError) {
        console.error(`[${callId}] Query optimization failed:`, optError);
        queryForProcessing = messageForLLM;
        processedQueryDisplay = `**Fallback query:** "*${queryForProcessing}*"\n\n`;
      }
      
      setChatStatus('searching');
      try {
        searchRes = await webSearch(queryForProcessing, config, controller.signal);
        if (controller.signal.aborted) return;
      } catch (searchError: any) {
        if (searchError.name === 'AbortError' || controller.signal.aborted) return;
        updateAssistantTurn(callId, `Web Search Failed: ${searchError instanceof Error ? searchError.message : String(searchError)}`, true, true);
        return;
      }
      if (processedQueryDisplay) {
        setTurns(prevTurns => prevTurns.map(t => (t.role === 'assistant' && prevTurns[prevTurns.length - 1] === t && t.status !== 'complete') ? { ...t, webDisplayContent: processedQueryDisplay } : t));
      }
    }

    const webLimit = 1000 * (config?.webLimit || 1);
    const limitedWebResult = webLimit && typeof searchRes === 'string' ? searchRes.substring(0, webLimit) : searchRes;
    const webContentForLlm = config?.webLimit === 128 ? searchRes : limitedWebResult;

    let pageContentForLlm = '';
    if (config?.chatMode === 'page') {
      setChatStatus('reading');
      try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tab?.url && !tab.url.startsWith('chrome://')) {
          const tabUrl = tab.url;
          const isPdfUrl = tabUrl.toLowerCase().endsWith('.pdf') || ((tab as any).mimeType === 'application/pdf');
          if (isPdfUrl) {
            pageContentForLlm = await extractTextFromPdf(tabUrl, callId);
          } else {
            pageContentForLlm = await storage.getItem('pagestring') || '';
          }
        }
      } catch (pageError) {
        pageContentForLlm = `Error accessing page content: ${pageError instanceof Error ? pageError.message : "Unknown error"}`;
      }
      const charLimit = 1000 * (config?.contextLimit || 1);
      const safeCurrentPageContent = typeof pageContentForLlm === 'string' ? pageContentForLlm : '';
      pageContentForLlm = charLimit ? safeCurrentPageContent.substring(0, charLimit) : safeCurrentPageContent;
      setPageContent(pageContentForLlm || '');
    }

    // --- SYSTEM PROMPT CONSTRUCTION ---
    const systemPromptParts = [];
    if (config.personas?.[config.persona]) systemPromptParts.push(config.personas[config.persona]);
    
    let userContextStatement = '';
    const userName = config.userName?.trim();
    const userProfile = config.userProfile?.trim();
    if (userName && userName.toLowerCase() !== 'user' && userName !== '') {
      userContextStatement = `You are interacting with a user named "${userName}".`;
      if (userProfile) userContextStatement += ` Their provided profile information is: "${userProfile}".`;
    } else if (userProfile) {
      userContextStatement = `You are interacting with a user. Their provided profile information is: "${userProfile}".`;
    }
    if (userContextStatement) systemPromptParts.push(userContextStatement);

    if (config?.useNote && config.noteContent) systemPromptParts.push(`Refer to this note for context: ${config.noteContent}`);
    if (scrapedContent) systemPromptParts.push(`Use the following scraped content from URLs in the user's message:\n${scrapedContent}`);
    if (config?.chatMode === 'page' && pageContentForLlm) systemPromptParts.push(`Use the following page content for context: ${pageContentForLlm}`);
    if (config?.chatMode === 'web' && webContentForLlm) systemPromptParts.push(`Refer to this web search summary: ${webContentForLlm}`);

    const enableTools = config.useTools !== false;
    if (enableTools && toolDefinitions?.length) {
      const toolDescriptions = toolDefinitions.map(tool => ({ name: tool.function.name, description: tool.function.description, parameters: tool.function.parameters }));
      const toolsPrompt = `To help you respond, you have access to the tools listed below. Please follow these guidelines carefully when using them:

Tool Use Guidelines:
Before deciding to use a tool, carefully consider if you can answer the user's request adequately with your existing knowledge. Only resort to a tool if essential information is missing or an action is explicitly required that only a tool can perform.

If tool use is necessary:
1.  **Argument Precision:** Always use the exact values for tool arguments. Do not use placeholders or variable names.
2.  **Necessity Check:** Only call a tool if it's genuinely needed. For instance, don't use a search tool if the information is likely within your general knowledge or already provided in the conversation. Prioritize answering directly.
3.  **Direct Answers:** If no tool is needed, provide a direct, conversational answer.
4.  **Avoid Redundancy:** Do not repeat a tool call with the exact same arguments if it has been made previously.
5.  **Strict JSON Format:** To use a tool, you MUST respond *only* with a single JSON object adhering to this structure: \`{"tool_name": "tool_name", "tool_arguments": {"arg_name": "value", ...}}\`. No conversational text or explanations should precede or follow this JSON object.

Available tools:
${JSON.stringify(toolDescriptions, null, 2)}
`;
      systemPromptParts.push("## AVAILABLE TOOLS\n" + toolsPrompt);
    }
    const systemContent = systemPromptParts.join('\n\n').trim();

    try {
      setChatStatus('thinking');
      const normalizedUrl = normalizeApiEndpoint(config.customEndpoint);
      const urlMap: Record<string, string> = {
        groq: 'https://api.groq.com/openai/v1/chat/completions', ollama: `${config.ollamaUrl || ''}/api/chat`, gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        lmStudio: `${config.lmStudioUrl || ''}/v1/chat/completions`, openai: 'https://api.openai.com/v1/chat/completions', openrouter: 'https://openrouter.ai/api/v1/chat/completions',
        custom: config.customEndpoint ? `${normalizedUrl}/v1/chat/completions` : '',
      };
      const url = urlMap[currentModel.host || ''];
      if (!url) throw new Error(`Configuration error: Could not determine API URL for host '${currentModel.host}'.`);

      const processLlmResponse = async (currentMessages: ApiMessage[]) => {
        if (controller.signal.aborted) return;
  
        await fetchDataAsStream(
          url,
          { stream: true, model: config.selectedModel || '', messages: currentMessages, temperature: config.temperature ?? 0.7, max_tokens: config.maxTokens ?? 32048, top_p: config.topP ?? 1, presence_penalty: config.presencepenalty ?? 0 },
          async (part, isFinished, isError) => {
            if (controller.signal.aborted && !isFinished && !isError) return;
  
            if (isFinished && !isError) {
              const assistantResponseContent = part;
              const potentialToolCall = robustlyParseLlmResponseForToolCall(assistantResponseContent);
  
              if (potentialToolCall && ((potentialToolCall.tool_name && typeof potentialToolCall.tool_arguments === 'object') || (potentialToolCall.name && typeof potentialToolCall.arguments === 'object'))) {
                try {
                  const toolName = potentialToolCall.tool_name || potentialToolCall.name;
                  const toolArgumentsObject = potentialToolCall.tool_arguments || potentialToolCall.arguments;
                  const stringifiedArguments = JSON.stringify(toolArgumentsObject);
                  const consistentToolCallId = `tool_${callId}_${toolName.replace(/\s+/g, '_')}_${Date.now()}`;
                  const structuredToolCalls: LLMToolCall[] = [{ id: consistentToolCallId, type: 'function', function: { name: toolName, arguments: stringifiedArguments } }];
    
                  setTurns(prevTurns => {
                    const lastTurn = prevTurns[prevTurns.length - 1];
                    return [...prevTurns.slice(0, -1), { ...lastTurn, content: assistantResponseContent, status: 'complete', tool_calls: structuredToolCalls }];
                  });
    
                  const executionResult = await executeToolCall({ id: consistentToolCallId, name: toolName, arguments: stringifiedArguments });
                  const toolResultTurn: MessageTurn = { role: 'tool', tool_call_id: executionResult.toolCallId || `call_${Date.now()}`, name: executionResult.name, content: executionResult.result, status: 'complete', timestamp: Date.now() };
                  setTurns(prevTurns => [...prevTurns, toolResultTurn]);
    
                  const assistantApiMessageWithToolCall: ApiMessage = { role: 'assistant', content: null, tool_calls: structuredToolCalls };
                  const toolResultApiMessage = turnToApiMessage(toolResultTurn);
                  const messagesForNextApiCall: ApiMessage[] = [...currentMessages, assistantApiMessageWithToolCall, toolResultApiMessage];
    
                  const finalAssistantPlaceholder: MessageTurn = { role: 'assistant', content: '', status: 'streaming', timestamp: Date.now() + 1 };
                  setTurns(prevTurns => [...prevTurns, finalAssistantPlaceholder]);
    
                  await processLlmResponse(messagesForNextApiCall); // Recursive call
                } catch (toolError) {
                  // **FIX 3: Robustness** - Catch errors from tool execution
                  const errorMessage = toolError instanceof Error ? toolError.message : String(toolError);
                  updateAssistantTurn(callId, `Tool execution failed: ${errorMessage}`, true, true);
                }
              } else {
                // **FIX 2: Logic Bug** - Append sources to the final answer
                let finalContent = assistantResponseContent;
                if (sourcesStringForAppending) finalContent += `\n\n---\n\n${sourcesStringForAppending}`;
                updateAssistantTurn(callId, finalContent, true, false);
              }
            } else {
              updateAssistantTurn(callId, part, Boolean(isFinished), Boolean(isError), controller.signal.aborted && isFinished);
            }
          },
          authHeader, currentModel.host || '', controller.signal
        );
      };
  
      const initialMessages: ApiMessage[] = [];
      if (systemContent) initialMessages.push({ role: 'system', content: systemContent });
      initialMessages.push(...currentTurns.filter(t => t.role !== 'assistant' || t.status === 'complete').map(turnToApiMessage));
      initialMessages.push({ role: 'user', content: messageForLLM });

      await processLlmResponse(initialMessages);
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error(`[${callId}] Error during send operation:`, error);
        updateAssistantTurn(callId, error instanceof Error ? error.message : String(error), true, true);
      } else {
        console.log(`[${callId}] Send operation was aborted.`);
        updateAssistantTurn(callId, "[Operation cancelled by user]", true, false, true);
      }
    }
  };

  const onStop = () => {
    const currentCallId = completionGuard.current;
    if (currentCallId !== null) {
      console.log(`[${currentCallId}] onStop triggered.`);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setTurns(prev => prev.map(t => t.status === 'streaming' ? { ...t, status: 'cancelled', content: (t.content || '') + " [Cancelled]" } : t));
      setLoading(false);
      setChatStatus('idle');
      completionGuard.current = null;
    } else {
      setLoading(false);
      setChatStatus('idle');
    }
  };

  return { onSend, onStop };
}

export default useSendMessage;