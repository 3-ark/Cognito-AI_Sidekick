import { webSearch, processQueryWithAI } from '../network';
import { scrapeUrlContent } from '../utils/scrapers';
import { Config, Model } from 'src/types/config';
import { MessageTurn } from 'src/types/chatTypes';
import { getAuthHeader } from './useSendMessage';
import storage from 'src/background/storageUtil';
import { extractTextFromPdf } from '../../utils/pdf';

export const handlePageContent = async (
  config: Config,
  setChatStatus: (status: any) => void,
  setPageContent: (content: string) => void,
  callId: number
): Promise<string> => {
  let pageContentForLlm = '';
  setChatStatus('reading');

  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

    if (tab?.url && !tab.url.startsWith('chrome://')) {
      const tabUrl = tab.url;
      const tabMimeType = (tab as chrome.tabs.Tab & { mimeType?: string }).mimeType;
      const isPdfUrl = tabUrl.toLowerCase().endsWith('.pdf') || tabMimeType === 'application/pdf';

      if (isPdfUrl) {
        try {
          pageContentForLlm = await extractTextFromPdf(tabUrl);
        } catch (pdfError) {
          pageContentForLlm = `Error extracting PDF content: ${pdfError instanceof Error ? pdfError.message : "Unknown PDF error"}. Falling back.`;
        }
      } else {
        pageContentForLlm = await storage.getItem('pagestring') || '';
      }
    }
  } catch (pageError) {
    pageContentForLlm = `Error accessing page content: ${pageError instanceof Error ? pageError.message : "Unknown error"}`;
  }

  const charLimit = 1000 * (config?.contextLimit || 1);
  const safeCurrentPageContent = typeof pageContentForLlm === 'string' ? pageContentForLlm : '';

  pageContentForLlm = config?.contextLimit === 128 ? safeCurrentPageContent : safeCurrentPageContent.substring(0, charLimit);
  setPageContent(pageContentForLlm || '');
  setChatStatus('thinking');

  return pageContentForLlm;
}

export const handleWebSearch = async (
  messageForLLM: string,
  config: Config,
  currentModel: Model,
  turnsContext: MessageTurn[],
  controller: AbortController,
  setChatStatus: (status: any) => void,
  updateAssistantTurn: (callId: number, update: string, isFinished: boolean, isError?: boolean) => void,
  setTurns: (callback: (prevTurns: MessageTurn[]) => MessageTurn[]) => void,
  callId: number
): Promise<{ queryForProcessing: string; searchRes: string }> => {
  let queryForProcessing = messageForLLM;
  let searchRes = '';
  let processedQueryDisplay = '';

  setChatStatus('thinking');
  const historyForQueryOptimization = turnsContext.map(turn => ({
    role: turn.role,
    content: turn.content,
  }));

  try {
    const host = currentModel.host || '';
    let url = '';

    if (host.startsWith('custom_endpoint')) {
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

    const authHeader = getAuthHeader(config, currentModel);
    const optimizedQuery = await processQueryWithAI(
      messageForLLM,
      config,
      currentModel,
      url,
      authHeader,
      controller.signal,
      historyForQueryOptimization,
    );

    if (controller.signal.aborted) return { queryForProcessing, searchRes };

    if (optimizedQuery?.trim() && optimizedQuery !== messageForLLM) {
      queryForProcessing = optimizedQuery;
      processedQueryDisplay = `**Optimized query:** "*${queryForProcessing}*"\n\n`;
    } else {
      queryForProcessing = messageForLLM;
      processedQueryDisplay = `**Original query:** "${queryForProcessing}"\n\n`;
    }
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'name' in error && (error as any).name === 'AbortError') return { queryForProcessing, searchRes };
    queryForProcessing = messageForLLM;
    processedQueryDisplay = `**Fallback query:** "${queryForProcessing}"\n\n`;
  }

  setChatStatus('searching');

  try {
    searchRes = await webSearch(queryForProcessing, config, controller.signal);
    setChatStatus('thinking');

    if (controller.signal.aborted) return { queryForProcessing, searchRes };
  } catch (searchError: any) {
    if (searchError.name === 'AbortError') return { queryForProcessing, searchRes };
    const errorMessage = `Web Search Failed: ${searchError instanceof Error ? searchError.message : String(searchError)}`;
    updateAssistantTurn(callId, errorMessage, true, true);
    throw searchError;
  }

  if (processedQueryDisplay) {
    setTurns(prevTurns => prevTurns.map(t => (t.role === 'assistant' && prevTurns[prevTurns.length - 1] === t && t.status !== 'complete' && t.status !== 'error' && t.status !== 'cancelled') ? { ...t, webDisplayContent: processedQueryDisplay } : t));
  }

  return { queryForProcessing, searchRes };
};

export const handleUrlScraping = async (
  messageContent: string,
  signal: AbortSignal,
  setChatStatus: (status: any) => void
): Promise<string> => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = messageContent.match(urlRegex);
  let scrapedContent = '';

  if (urls?.length) {
    setChatStatus('searching');

    try {
      const scrapedResults = await Promise.all(
        urls.map(url => scrapeUrlContent(url, signal)),
      );

      scrapedContent = scrapedResults
        .map((content, idx) => `Content from [${urls[idx]}]:\n${content}`)
        .join('\n\n');
    } catch (e) {
      scrapedContent = '[Error scraping one or more URLs]';
    }

    setChatStatus('thinking');
  }

  return scrapedContent;
};

export const buildSystemPrompt = (
  config: Config,
  pageContentForLlm: string,
  webContentForLlm: string,
  scrapedContent: string,
  retrievedContext: string | undefined,
  finalSessionContext: string
): string => {
  const persona = config?.personas?.[config?.persona] || '';
  const readerLensString = (config?.chatMode === 'page' && config?.readerLens)
    ? `${config.readerLens}\n\n`
    : '';
  const pageContextString = (config?.chatMode === 'page' && pageContentForLlm)
    ? `Use the following page content for context: ${readerLensString}${pageContentForLlm}`
    : '';
  const webContextString = (config?.chatMode === 'web' && webContentForLlm)
    ? `Refer to this web search summary: ${webContentForLlm}`
    : '';
  const noteContextString = (config?.useNote && config.noteContent)
    ? `Refer to this note for context: ${config.noteContent}`
    : '';

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

  const citationInstruction = (retrievedContext && retrievedContext.trim().length > 0)
    ? "When you use information from the retrieved text segments, please cite the source using its corresponding number in brackets, like `[1]`."
    : '';

  const systemPromptParts = [
    persona,
    userContextStatement,
    noteContextString,
    "The user may provide notes directly in their message, formatted like (User note 'Title': ```...content...```). Please pay close attention to these if present, as they are specific context for their query in that turn.",
    scrapedContent ? `Use the following scraped content from URLs in the user's message:\n${scrapedContent}` : '',
    pageContextString,
    webContextString,
    retrievedContext || "",
    citationInstruction,
    finalSessionContext || "",
  ].filter(Boolean);

  return systemPromptParts.join('\n\n').trim();
}
