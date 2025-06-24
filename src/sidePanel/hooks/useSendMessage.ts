import { Dispatch, SetStateAction, useRef } from 'react';
import { MessageTurn } from '../ChatHistory';
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
  tool_calls?: {
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }[];
}

export const getAuthHeader = (config: Config, currentModel: Model) => {
  if (currentModel?.host === 'groq' && config.groqApiKey) {
    return { Authorization: `Bearer ${config.groqApiKey}` };
  }
  if (currentModel?.host === 'gemini' && config.geminiApiKey) {
    return { Authorization: `Bearer ${config.geminiApiKey}` };
  }
  if (currentModel?.host === 'openai' && config.openAiApiKey) {
    return { Authorization: `Bearer ${config.openAiApiKey}` };
  }
  if (currentModel?.host === 'openrouter' && config.openRouterApiKey) {
    return { Authorization: `Bearer ${config.openRouterApiKey}` };
  }
  if (currentModel?.host === 'custom' && config.customApiKey) {
    return { Authorization: `Bearer ${config.customApiKey}` };
  }
  return undefined;
};

async function extractTextFromPdf(pdfUrl: string, callId?: number): Promise<string> {
  try {
    console.log(`[${callId || 'PDF'}] Attempting to fetch PDF from URL: ${pdfUrl}`);
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    console.log(`[${callId || 'PDF'}] PDF fetched, size: ${arrayBuffer.byteLength} bytes. Parsing...`);

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    console.log(`[${callId || 'PDF'}] PDF parsed. Number of pages: ${pdf.numPages}`);
    
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => ('str' in item ? item.str : '')).join(' ');
      fullText += pageText + '\n\n';
      if (i % 10 === 0 || i === pdf.numPages) {
        console.log(`[${callId || 'PDF'}] Extracted text from page ${i}/${pdf.numPages}`);
      }
    }
    console.log(`[${callId || 'PDF'}] PDF text extraction complete. Total length: ${fullText.length}`);
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
  setTurns: Dispatch<SetStateAction<MessageTurn[]>>,
  setMessage: Dispatch<SetStateAction<string>>,
  setWebContent: Dispatch<SetStateAction<string>>,
  setPageContent: Dispatch<SetStateAction<string>>,
  setLoading: Dispatch<SetStateAction<boolean>>,
  setChatStatus: Dispatch<SetStateAction<ChatStatus>>
) => {
  const completionGuard = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toolDefinitions, executeToolCall } = useTools();

  const updateAssistantTurn = (callId: number | null, update: string, isFinished: boolean, isError?: boolean, isCancelled?: boolean, toolCallsPayload?: LLMToolCall[]) => {
    if (completionGuard.current !== callId && !isFinished && !isError && !isCancelled) {
      console.log(`[${callId}] updateAssistantTurn: Guard mismatch (current: ${completionGuard.current}), skipping non-final update.`);
      return;
    }
    if (completionGuard.current === null && callId !== null) {
        if ((update === "" && isFinished && !isError && !isCancelled) ||
            (isError && (update.includes("Operation cancelled by user") || update.includes("Streaming operation cancelled")))) {
            console.log(`[${callId}] updateAssistantTurn: Signal received after operation already finalized. Preserving existing state.`);
            setLoading(false);
            setChatStatus('idle');
            return;
        }
    }

    setTurns(prevTurns => {
      if (prevTurns.length === 0 || prevTurns[prevTurns.length - 1].role !== 'assistant') {
        console.warn(`[${callId}] updateAssistantTurn: No assistant turn found or last turn is not assistant.`);
        if (isError) {
          const errorTurn: MessageTurn = {
            role: 'assistant',
            content: `Error: ${update || 'Unknown operation error'}`,
            status: 'error',
            timestamp: Date.now(),
            ...(toolCallsPayload && { tool_calls: toolCallsPayload })
          };
          return [...prevTurns, errorTurn];
        }
        return prevTurns;
      }
      const lastTurn = prevTurns[prevTurns.length - 1];
      
      const updatedStatus = (isError === true) ? 'error' : (isCancelled === true) ? 'cancelled' : (isFinished ? 'complete' : 'streaming');
      let finalContentForTurn: string;
      
      if (isCancelled) {
        const existingContent = lastTurn.content || "";
        finalContentForTurn = existingContent + (existingContent ? " " : "") + update;
      } else if (isError) {
        finalContentForTurn = `Error: ${update || 'Unknown stream/handler error'}`;
      } else {
        finalContentForTurn = update; 
      }
      
      return [...prevTurns.slice(0, -1), { ...lastTurn, content: finalContentForTurn, status: updatedStatus, timestamp: Date.now(), ...(toolCallsPayload && { tool_calls: toolCallsPayload }) }];
    });

    if (isFinished || (isError === true) || (isCancelled === true)) {
      let justFinishedLlmToolCallJson = false;
      if (isFinished && !isError && !isCancelled) {
        const potentialToolCall = robustlyParseLlmResponseForToolCall(update);
        if (potentialToolCall &&
            ((potentialToolCall.tool_name && typeof potentialToolCall.tool_arguments === 'object') ||
             (potentialToolCall.name && typeof potentialToolCall.arguments === 'object'))) {
          justFinishedLlmToolCallJson = true;
        }
      }

      console.log(`[${callId}] updateAssistantTurn: Final state (Finished: ${isFinished}, Error: ${isError}, Cancelled: ${isCancelled}). Tool JSON just finished: ${justFinishedLlmToolCallJson}.`);
      setLoading(false);

      if (justFinishedLlmToolCallJson) {
        console.log(`[${callId}] updateAssistantTurn: Detected finalization of LLM's tool call JSON. Completion guard will NOT be cleared yet to allow for final response processing.`);
      } else {
        setChatStatus(isError ? 'idle' : isCancelled ? 'idle' : 'done');
        if (completionGuard.current === callId) {
          completionGuard.current = null;
          if (abortControllerRef.current) {
              abortControllerRef.current = null;
          }
        } else {
          console.log(`[${callId}] updateAssistantTurn: Guard mismatch or already cleared (current: ${completionGuard.current}). Not clearing guard again.`);
        }
      }
    }
  };

  const turnToApiMessage = (turn: MessageTurn): ApiMessage => {
    let contentValue: string | null = turn.content || '';

    if (turn.role === 'assistant' && turn.tool_calls && turn.tool_calls.length > 0) {
      // contentValue = "";
    }

    const apiMsg: ApiMessage = {
      role: turn.role,
      content: contentValue
    };

    if (turn.role === 'tool') {
      if (turn.name) apiMsg.name = turn.name;
      if (turn.tool_call_id) apiMsg.tool_call_id = turn.tool_call_id;
    }

    if (turn.role === 'assistant' && turn.tool_calls && turn.tool_calls.length > 0) {
      apiMsg.tool_calls = turn.tool_calls;
    }

    return apiMsg;
  };

  const onSend = async (overridedMessage?: string) => {
    const callId = Date.now();
    console.log(`[${callId}] useSendMessage: onSend triggered.`);
    
    const originalMessageFromInput = overridedMessage || ""; 
    const messageForLLM = originalMessageFromInput.replace(/@\[([^\]]+)\]/g, '').trim();
        
    console.log(`[${callId}] Original message from input: "${originalMessageFromInput}"`);
    console.log(`[${callId}] Message for LLM (cleaned): "${messageForLLM}"`);

    if (!config) {
      console.log(`[${callId}] useSendMessage: Bailing out: Missing config.`);
      setLoading(false);
      return;
    }
    if (!originalMessageFromInput.trim() && (!selectedNotesForContext || selectedNotesForContext.length === 0)) {
      console.log(`[${callId}] useSendMessage: Bailing out: Empty message and no notes selected for context.`);
      setLoading(false);
      return;
    }

    if (completionGuard.current !== null) {
      console.warn(`[${callId}] useSendMessage: Another send operation (ID: ${completionGuard.current}) is already in progress. Aborting previous.`);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    console.log(`[${callId}] useSendMessage: Setting loading true.`);
    setLoading(true);
    setWebContent('');
    setPageContent('');

    const currentChatMode = config.chatMode as ChatMode || 'chat';
    if (currentChatMode === 'web') {
      setChatStatus('searching');
    } else if (currentChatMode === 'page') {
      setChatStatus('reading');
    } else {
      setChatStatus('thinking');
    }

    completionGuard.current = callId;

    // --- URL Detection and Scraping ---
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = originalMessageFromInput.match(urlRegex);
    let scrapedContent = '';
    if (urls && urls.length > 0) {
      setChatStatus('searching');
      try {
        const scrapedResults = await Promise.all(
          urls.map(url => scrapeUrlContent(url, controller.signal))
        );
        scrapedContent = scrapedResults
          .map((content, idx) => `Content from [${urls[idx]}]:\n${content}`)
          .join('\n\n');
      } catch (e) {
        scrapedContent = '[Error scraping one or more URLs]';
      }
      setChatStatus('thinking');
    }

    const userTurn: MessageTurn = {
      role: 'user',
      status: 'complete',
      content: originalMessageFromInput,
      timestamp: Date.now()
    };
    setTurns(prevTurns => [...prevTurns, userTurn]);
    setMessage('');
    console.log(`[${callId}] useSendMessage: User turn added to state.`);

    const assistantTurnPlaceholder: MessageTurn = {
        role: 'assistant',
        content: '',
        status: 'streaming',
        timestamp: Date.now() + 1 
    };
    setTurns(prevTurns => [...prevTurns, assistantTurnPlaceholder]);
    console.log(`[${callId}] useSendMessage: Assistant placeholder turn added early.`);

    let queryForProcessing = messageForLLM;
    let searchRes: string = '';
    let processedQueryDisplay = '';

    const performSearch = config?.chatMode === 'web';
    const currentModel = config?.models?.find(m => m.id === config.selectedModel);
    if (!currentModel) {
      console.error(`[${callId}] useSendMessage: No current model found.`);
      updateAssistantTurn(callId, "Configuration error: No model selected.", true, true);
      return;
    }
    const authHeader = getAuthHeader(config, currentModel);

    if (performSearch) {
      console.log(`[${callId}] useSendMessage: Optimizing query...`);
      setChatStatus('thinking');    
      const historyForQueryOptimization= currentTurns.map(turn => ({
        role: turn.role,
        content: turn.content
      }));
      try {
        const optimizedQuery = await processQueryWithAI(
          messageForLLM,
          config,
          currentModel,
          authHeader, 
          controller.signal,
          historyForQueryOptimization
        );
        if (optimizedQuery && optimizedQuery.trim() && optimizedQuery !== messageForLLM) {
          queryForProcessing = optimizedQuery;
          processedQueryDisplay = `**Optimized query:** "*${queryForProcessing}*"\n\n`;
          console.log(`[${callId}] useSendMessage: Query optimized to: "${queryForProcessing}"`);
        } else {
          queryForProcessing = messageForLLM;
          processedQueryDisplay = `**Original query:** "*${queryForProcessing}"\n\n`;
          console.log(`[${callId}] useSendMessage: Using original query (cleaned): "${queryForProcessing}"`);
        }
      } catch (optError) {
        console.error(`[${callId}] Query optimization failed:`, optError);
        queryForProcessing = messageForLLM;
        processedQueryDisplay = `**Fallback query:** "*${queryForProcessing}*"\n\n`;
      }
    } else {
      queryForProcessing = messageForLLM;
    }

    if (performSearch) {
      console.log(`[${callId}] useSendMessage: Performing web search...`);
      setChatStatus('searching');

      try {
        searchRes = await webSearch(queryForProcessing, config, controller.signal);
        setChatStatus('thinking');     
        if (controller.signal.aborted) {
          console.log(`[${callId}] Web search was aborted (signal check post-await).`);
          return;
        }
      } catch (searchError: any) {
        console.error(`[${callId}] Web search failed:`, searchError);
        if (searchError.name === 'AbortError' || controller.signal.aborted) {
          console.log(`[${callId}] Web search aborted. onStop handler will finalize UI.`);
          return;
        } else {
          searchRes = '';
          const errorMessage = `Web Search Failed: ${searchError instanceof Error ? searchError.message : String(searchError)}`;
          setChatStatus('idle');     
          updateAssistantTurn(callId, errorMessage, true, true, false);
          return;
        }
      }
      console.log(`[${callId}] useSendMessage: Web search completed. Length: ${searchRes.length}`);
      if (processedQueryDisplay) { 
        setTurns(prevTurns => prevTurns.map(t => (t.role === 'assistant' && prevTurns[prevTurns.length -1] === t && t.status !== 'complete' && t.status !== 'error' && t.status !== 'cancelled') ? { ...t, webDisplayContent: processedQueryDisplay } : t));
      }
    }
    
    const messageToUse = queryForProcessing;
    const webLimit = 1000 * (config?.webLimit || 1);
    const limitedWebResult = webLimit && typeof searchRes === 'string'
      ? searchRes.substring(0, webLimit)
      : searchRes;
    const webContentForLlm = config?.webLimit === 128 ? searchRes : limitedWebResult;

    const messageForApi: ApiMessage[] = currentTurns
      .map((turn): ApiMessage => ({
        content: turn.content || '',
        role: turn.role
      }))
      .concat({ role: 'user', content: messageForLLM });

    let pageContentForLlm = '';
    if (config?.chatMode === 'page') {
      let currentPageContent = '';
      console.log(`[${callId}] useSendMessage: Preparing page content...`);
      setChatStatus('reading');      
      try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        
        if (tab?.url && !tab.url.startsWith('chrome://')) {
          const tabUrl = tab.url;
          const tabMimeType = (tab as chrome.tabs.Tab & { mimeType?: string }).mimeType;
          const isPdfUrl = tabUrl.toLowerCase().endsWith('.pdf') ||
                           (tabMimeType && tabMimeType === 'application/pdf');

          if (isPdfUrl) {
            console.log(`[${callId}] Detected PDF URL: ${tabUrl}. Attempting to extract text.`);
            try {
              currentPageContent = await extractTextFromPdf(tabUrl, callId);
              console.log(`[${callId}] Successfully extracted text from PDF. Length: ${currentPageContent.length}`);
            } catch (pdfError) {
              console.error(`[${callId}] Failed to extract text from PDF ${tabUrl}:`, pdfError);
              currentPageContent = `Error extracting PDF content: ${pdfError instanceof Error ? pdfError.message : "Unknown PDF error"}. Falling back.`;
            }
          } else {
            console.log(`[${callId}] URL is not a PDF. Fetching from storage: ${tabUrl}`);
            const storedPageString = await storage.getItem('pagestring');
            currentPageContent = storedPageString || '';
            console.log(`[${callId}] Retrieved page text content from storage. Length: ${currentPageContent.length}`);
          }
        } else {
          console.log(`[${callId}] Not fetching page content for URL: ${tab?.url} (might be chrome:// or no active tab).`);
        }
      } catch (pageError) {
        console.error(`[${callId}] Error getting active tab or initial page processing:`, pageError);
        currentPageContent = `Error accessing page content: ${pageError instanceof Error ? pageError.message : "Unknown error"}`;
      }

      const charLimit = 1000 * (config?.contextLimit || 1);
      const safeCurrentPageContent = typeof currentPageContent === 'string' ? currentPageContent : '';
      const limitedContent = charLimit && safeCurrentPageContent
        ? safeCurrentPageContent.substring(0, charLimit)
        : safeCurrentPageContent;
      pageContentForLlm = config?.contextLimit === 128 ? safeCurrentPageContent : limitedContent;
      setPageContent(pageContentForLlm || '');
      setChatStatus('thinking');     
      console.log(`[${callId}] Page content prepared for LLM. Length: ${pageContentForLlm?.length}`);
    } else {
      setPageContent('');
    }

    const persona = config?.personas?.[config?.persona] || '';
    const pageContextString = (config?.chatMode === 'page' && pageContentForLlm)
      ? `Use the following page content for context: ${pageContentForLlm}`
      : '';
    const webContextString = (config?.chatMode === 'web' && webContentForLlm)
      ? `Refer to this web search summary: ${webContentForLlm}`
      : '';
    const noteContextString = (config?.useNote && config.noteContent)
      ? `Refer to this note for context: ${config.noteContent}`
      : '';

    let notesContextContent = "";
    if (selectedNotesForContext && selectedNotesForContext.length > 0) {
      notesContextContent = selectedNotesForContext.map(note => {
        return "```" + note.title + "\n" + note.content + "\n```";
      }).join("\n\n");
      console.log(`[${callId}] Constructed notesContextContent (from prop) length: ${notesContextContent.length}`);
    } else {
      console.log(`[${callId}] No notes provided via selectedNotesForContext prop, notesContextContent is empty.`);
    }
    
    let userContextStatement = '';
    const userName = config.userName?.trim();
    const userProfile = config.userProfile?.trim();

    if (userName && userName.toLowerCase() !== 'user' && userName !== '') {
      userContextStatement = `You are interacting with a user named "${userName}".`;
      if (userProfile) {
        userContextStatement += ` Their provided profile information is: "${userProfile}".`;
      }
    } else if (userProfile) {
      userContextStatement = `You are interacting with a user. Their provided profile information is: "${userProfile}".`;
    }

    const systemPromptParts = [];
    if (persona) systemPromptParts.push(persona);
    if (userContextStatement) systemPromptParts.push(userContextStatement);
    if (noteContextString) systemPromptParts.push(noteContextString);
    if (notesContextContent) systemPromptParts.push(notesContextContent);
    if (scrapedContent) systemPromptParts.push(`Use the following scraped content from URLs in the user's message:\n${scrapedContent}`);
    if (pageContextString) systemPromptParts.push(pageContextString);
    if (webContextString) systemPromptParts.push(webContextString);

    if (toolDefinitions && toolDefinitions.length > 0) {
      const toolDescriptions = toolDefinitions.map(tool => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters
      }));
      const toolsPrompt = `This is a strict instruction. You have access to the following tools. To use a tool, you MUST respond with a JSON object ONLY, with the structure: {"tool_name": "name_of_tool", "tool_arguments": {"arg1": "value1", ...}}. Do not add any other text, explanation, or formatting before or after this JSON. If you don't need to use a tool, respond normally.\n\nAvailable tools:\n${JSON.stringify(toolDescriptions, null, 2)}`;
      systemPromptParts.push("## AVAILABLE TOOLS\n" + toolsPrompt);
    }

    const systemContent = systemPromptParts.join('\n\n').trim();

    console.log(`[${callId}] useSendMessage: System prompt constructed. Persona: ${!!persona}, UserCtx: ${!!userContextStatement}, NoteCtx (single): ${!!noteContextString}, NotesCtx (multi): ${!!notesContextContent}, PageCtx: ${!!pageContextString}, WebCtx: ${!!webContextString}, LinkCtx: ${!!scrapedContent}, Tools: ${toolDefinitions && toolDefinitions.length > 0}`);

    try {
      setChatStatus('thinking'); 
      // NOTE: computeLevel (high/medium) logic removed as per refactoring.
      // All requests now use standard streaming.
      console.log(`[${callId}] useSendMessage: Starting standard streaming.`);
      const normalizedUrl = normalizeApiEndpoint(config?.customEndpoint);
      const configBody = { stream: true };
        const urlMap: Record<string, string> = {
          groq: 'https://api.groq.com/openai/v1/chat/completions',
          ollama: `${config?.ollamaUrl || ''}/api/chat`,
          gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
          lmStudio: `${config?.lmStudioUrl || ''}/v1/chat/completions`,
          openai: 'https://api.openai.com/v1/chat/completions',
          openrouter: 'https://openrouter.ai/api/v1/chat/completions',
          custom: config?.customEndpoint ? `${normalizedUrl}/v1/chat/completions` : '',
        };
        const host = currentModel.host || '';
        const url = urlMap[host];

        if (!url) {
          updateAssistantTurn(callId, `Configuration error: Could not determine API URL for host '${currentModel.host}'.`, true, true);
          return;
        }
        const messagesForApiPayload: ApiMessage[] = [];
        if (systemContent.trim() !== '') {
          messagesForApiPayload.push({ role: 'system', content: systemContent });
        }
        // Add history turns and the current user message
        messagesForApiPayload.push(...currentTurns.filter(t => t.role !== 'assistant' || t.status === 'complete').map(turnToApiMessage)); 
        messagesForApiPayload.push({ role: 'user', content: messageForLLM });

        const processLlmResponse = async () => {
          await fetchDataAsStream(
            url,
            {
              ...configBody,
              model: config?.selectedModel || '',
              messages: messagesForApiPayload,
              temperature: config?.temperature ?? 0.7,
              max_tokens: config?.maxTokens ?? 32048,
              top_p: config?.topP ?? 1,
              presence_penalty: config?.presencepenalty ?? 0,
            },
          async (part: string, isFinished?: boolean, isError?: boolean, rawResponse?: any) => {
            if (controller.signal.aborted && !isFinished && !isError) {
              console.log(`[${callId}] processLlmResponse: Aborted during streaming. Update will be handled by onStop or final error.`);
              return;
            }

            if (isFinished && !isError) {
              const assistantResponseContent = part;
              try {
                const potentialToolCall = robustlyParseLlmResponseForToolCall(assistantResponseContent);
                if (potentialToolCall &&
                    ((potentialToolCall.tool_name && typeof potentialToolCall.tool_arguments === 'object') ||
                     (potentialToolCall.name && typeof potentialToolCall.arguments === 'object'))) {
                  
                  const toolName = potentialToolCall.tool_name || potentialToolCall.name;
                  const toolArgumentsObject = potentialToolCall.tool_arguments || potentialToolCall.arguments;
                  const stringifiedArguments = JSON.stringify(toolArgumentsObject);

                  console.log(`[${callId}] Detected custom tool call:`, toolName);

                  const consistentToolCallId = `tool_${callId}_${toolName.replace(/\s+/g, '_')}_${Date.now()}`;
                  
                  const structuredToolCallsForAssistant: LLMToolCall[] = [{
                    id: consistentToolCallId,
                    type: 'function',
                    function: {
                      name: toolName,
                      arguments: stringifiedArguments
                    }
                  }];
                  updateAssistantTurn(callId, assistantResponseContent, true, false, false, structuredToolCallsForAssistant);

                  const executionResult = await executeToolCall({
                    id: consistentToolCallId,
                    name: toolName,
                    arguments: stringifiedArguments
                  });

                  let contentForToolTurn: string;
                  if (currentModel?.host === 'gemini') {
                    try {
                      const parsedResult = JSON.parse(executionResult.result);
                      contentForToolTurn = JSON.stringify({ result: parsedResult });
                    } catch (e) {
                      contentForToolTurn = JSON.stringify({ result: executionResult.result });
                    }
                  } else {
                    contentForToolTurn = executionResult.result;
                  }

                  const toolResultTurn: MessageTurn = {
                  role: 'tool',
                  tool_call_id: executionResult.toolCallId || `call_${Date.now()}`,
                  name: executionResult.name,
                  content: contentForToolTurn,
                  status: 'complete',
                  timestamp: Date.now(),
                  };                  
                  setTurns(prevTurns => [...prevTurns, toolResultTurn]);

                  // @ts-ignore Gemini API buggy requirement
                  const assistantApiMessageWithToolCall: ApiMessage = {
                    role: 'assistant',
                    // content: "",
                    tool_calls: structuredToolCallsForAssistant
                  };

                  const toolResultApiMessage = turnToApiMessage(toolResultTurn);

                  const messagesForNextApiCall: ApiMessage[] = [
                    ...messagesForApiPayload,
                    assistantApiMessageWithToolCall,
                    toolResultApiMessage
                  ];
                  // @ts-ignore For gemini api buggy requirement  
                  const finalAssistantPlaceholder: MessageTurn = {
                      role: 'assistant', 
                      // content: '',
                      status: 'streaming', 
                      timestamp: Date.now() + 1
                  };
                  setTurns(prevTurns => [...prevTurns, finalAssistantPlaceholder]);

                  console.log(`[${callId}] Sending tool result back to LLM and awaiting final response.`);
                  await fetchDataAsStream(
                    url,
                    { 
                       ...configBody, model: config?.selectedModel || '', messages: messagesForNextApiCall,
                       temperature: config?.temperature ?? 0.7, max_tokens: config?.maxTokens ?? 32048,
                       top_p: config?.topP ?? 1, presence_penalty: config?.presencepenalty ?? 0,
                    },
                    (finalPart, finalIsFinished, finalIsError) => {
                      updateAssistantTurn(callId, finalPart, Boolean(finalIsFinished), Boolean(finalIsError));
                    },
                    authHeader, currentModel.host || '', controller.signal
                  );
                  return;
                }
              } catch (e) {
              }
              updateAssistantTurn(callId, assistantResponseContent, true, false);
            } else {
              updateAssistantTurn(callId, part, Boolean(isFinished), Boolean(isError), controller.signal.aborted && isFinished);
            }
          },
          authHeader,
          currentModel.host || '',
          controller.signal
          );
        };
        console.log(`[${callId}] useSendMessage: Initial LLM call (processLlmResponse) INITIATED.`);
        await processLlmResponse();
      }
    } catch (error) {
      if (controller.signal.aborted) {
        console.log(`[${callId}] Send operation was aborted. 'onStop' handler is responsible for UI updates.`);
        if (isLoading) setLoading(false);
        setChatStatus('idle');
        if (completionGuard.current === callId) {
            completionGuard.current = null;
        }
        if (abortControllerRef.current && abortControllerRef.current.signal === controller.signal) {
            abortControllerRef.current = null;
        }
      } else {
        console.error(`[${callId}] useSendMessage: Error during send operation:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        updateAssistantTurn(callId, errorMessage, true, true);
      }
    }
    console.log(`[${callId}] useSendMessage: onSend processing logic completed.`);
  };

  const onStop = () => {
    const currentCallId = completionGuard.current;
    if (currentCallId !== null) {
      console.log(`[${currentCallId}] useSendMessage: onStop triggered.`);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      updateAssistantTurn(currentCallId, "[Operation cancelled by user]", true, false, true);
    } else {
      console.log(`[No CallID] useSendMessage: onStop triggered but no operation in progress.`);
      setLoading(false); 
      setChatStatus('idle'); 
    }
  };
  return { onSend, onStop };
}

export default useSendMessage;