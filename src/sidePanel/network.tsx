import { events } from 'fetch-event-stream';
import '../types/config.ts';
import type { Config, Model } from 'src/types/config';

interface ApiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const cleanResponse = (response: string): string => {
  return response
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/["']/g, '')
    .trim();
};

export const processQueryWithAI = async (
  query: string,
  config: Config,
  currentModel: Model,
  authHeader?: Record<string, string>,
  abortSignal?: AbortSignal,
  contextMessages: ApiMessage[] = [],
  temperatureOverride?: number
): Promise<string> => {
  try {
   if (!currentModel?.host) {
    console.error('processQueryWithAI: currentModel or currentModel.host is undefined. Cannot determine API URL.');
    return query;
  }

  const formattedContext = contextMessages
      .map(msg => `{{${msg.role}}}: ${msg.content}`)
      .join('\n');
  const systemPrompt = `You are a Google search query optimizer. Your task is to rewrite user's input [The user's raw input && chat history:${formattedContext}].
\n
Instructions:
**Important** No Explanation, just the optimized query!
\n
1. Extract the key keywords and named entities from the user's input.
2. Correct any obvious spelling errors.
3. Remove unnecessary words (stop words) unless they are essential for the query's meaning.
4. If the input is nonsensical or not a query, return the original input.
5. Using previous chat history to understand the user's intent.
\n
Output:
'The optimized Google search query'
\n
Example 1:
Input from user ({{user}}): where can i find cheep flights to london
Output:
'cheap flights London'
\n
Example 2:
Context: {{user}}:today is a nice day in paris i want to have a walk and find a restaurant to have a nice meal. {{assistant}}: Bonjour, it's a nice day!
Input from user ({{user}}): please choose me the best restarant
Output:
'best restaurants Paris France'
\n
Example 3:
Input from user ({{user}}): asdf;lkjasdf
Output:
'asdf;lkjasdf'
`;

    const urlMap: Record<string, string> = {
      groq: 'https://api.groq.com/openai/v1/chat/completions',
      ollama: `${config?.ollamaUrl || ''}/api/chat`,
      gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      lmStudio: `${config?.lmStudioUrl || ''}/v1/chat/completions`,
      openai: 'https://api.openai.com/v1/chat/completions',
      openrouter: 'https://openrouter.ai/api/v1/chat/completions',
      custom: `${config?.customEndpoint || ''}/v1/chat/completions`
    };
    const apiUrl = urlMap[currentModel.host];
    if (!apiUrl) {
      console.error('processQueryWithAI: Could not determine API URL for host:', currentModel.host);
      return query;
    }

    console.log(`processQueryWithAI: Using API URL: ${apiUrl} for host: ${currentModel.host}`);
    console.log('Formatted Context for Prompt:', formattedContext);

    const requestBody: {
      model: string;
      messages: ApiMessage[];
      stream: boolean;
      temperature?: number;
    } = {
      model: config?.selectedModel || currentModel.id || '',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ],
      stream: false
    };

    let effectiveTemperature: number | undefined = undefined;
    if (temperatureOverride !== undefined) {
      effectiveTemperature = temperatureOverride;
    } else if (config.temperature !== undefined) {
      effectiveTemperature = config.temperature;
    }

    if (effectiveTemperature !== undefined) {
      requestBody.temperature = effectiveTemperature;
    }

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(authHeader || {})
        },
        signal: abortSignal,
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`API request failed with status ${response.status}: ${errorBody}`);
        throw new Error(`API request failed: ${response.statusText}`);
    }

    const responseData = await response.json();
    const rawContent = responseData?.choices?.[0]?.message?.content;
    return typeof rawContent === 'string'
      ? cleanResponse(rawContent)
      : query;

  } catch (error: any) {
    if (abortSignal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      console.log('processQueryWithAI: Operation aborted.');
      throw error;
    }
    console.error('processQueryWithAI: Error during execution:', error);
    return query;
  }
};

export const urlRewriteRuntime = async function (domain: string) {
  try {
    const url = new URL(domain);
    if (url.protocol === 'chrome:') return;

    const domains = [url.hostname];
    const origin = `${url.protocol}//${url.hostname}`;

    const rules = [
      {
        id: 1,
        priority: 1,
        condition: { requestDomains: domains },
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            {
              header: 'Origin',
              operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
              value: origin
            }
          ]
        }
      }
    ];

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: rules.map(r => r.id),
      addRules: rules as chrome.declarativeNetRequest.Rule[]
    });
  } catch (error) {
    console.debug('URL rewrite skipped:', error);
  }
};

const extractMainContent = (htmlString: string): string => {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');

        doc.querySelectorAll(
            'script, style, nav, footer, header, svg, img, noscript, iframe, form, aside, .sidebar, .ad, .advertisement, .banner, .popup, .modal, .cookie-banner, link[rel="stylesheet"], button, input, select, textarea, [role="navigation"], [role="banner"], [role="contentinfo"], [aria-hidden="true"]'
        ).forEach(el => el.remove());

        let contentElement = doc.querySelector('main')
            || doc.querySelector('article')
            || doc.querySelector('.content')
            || doc.querySelector('#content')
            || doc.querySelector('.main-content')
            || doc.querySelector('#main-content')
            || doc.querySelector('.post-content')
            || doc.body;

        let text = contentElement?.textContent || '';
        text = text.replace(/\s+/g, ' ').trim();
        text = text.split('\n').filter(line => line.trim().length > 20).join('\n');

        return text;
    } catch (error) {
        console.error("Error parsing HTML for content extraction:", error);
        return "[Error extracting content]";
    }
};

interface WikiSearchResultBlock {
    document_title: string;
    section_title: string;
    content: string;
    block_type: "text" | "table" | "infobox";
    language: string;
    url?: string | null;
    last_edit_date?: string | null;
    similarity_score: number;
    probability_score: number;
    summary?: string[];
}

interface WikiQueryResult {
    results: WikiSearchResultBlock[];
}

interface GoogleCustomSearchItem {
  title: string;
  link: string;
  snippet: string;
  htmlTitle?: string;
  htmlSnippet?: string;
  pagemap?: Record<string, any>;
}

interface GoogleCustomSearchResponse {
  kind?: string;
  items?: GoogleCustomSearchItem[];
  error?: {
    code: number;
    message: string;
    errors: Array<{ message: string; domain: string; reason: string; }>;
  };
  searchInformation?: {
    totalResults?: string;
  }
}

export const webSearch = async (
    query: string,
    config: Config,
    abortSignal?: AbortSignal
): Promise<string> => {
    console.log('[webSearch] Received query:', query);
    console.log('[webSearch] Web Mode from config:', config?.webMode);

    const webMode = config.webMode;
    const maxLinksToVisit = config.serpMaxLinksToVisit ?? 3;
    const charLimitPerPage = (config.webLimit && config.webLimit !== 128) ? config.webLimit * 1000 : Infinity;

    const effectiveSignal = abortSignal || new AbortController().signal;

    console.log(`Performing ${webMode} search for: "${query}"`);
    if (webMode === 'Duckduckgo' || webMode === 'Brave' || webMode === 'Google' || webMode === 'GoogleCustomSearch') {
        console.log(`[webSearch - ${webMode}] Max links to visit for content scraping: ${maxLinksToVisit}`);
    }

    if (!webMode) {
        console.error('[webSearch] Web search mode is undefined. Aborting search. Config was:', JSON.stringify(config));
        return `Error: Web search mode is undefined. Please check your configuration.`;
    }

    try {
        if (webMode === 'Duckduckgo' || webMode === 'Brave' || webMode === 'Google') {
            const serpTimeoutController = new AbortController();
            const serpApiTimeoutId = setTimeout(() => {
                console.warn(`[webSearch - ${webMode}] SERP API call timed out after 15s.`);
                serpTimeoutController.abort();
            }, 15000);

            const signalForSerpFetch = (typeof AbortSignal.any === 'function')
                ? AbortSignal.any([effectiveSignal, serpTimeoutController.signal])
                : effectiveSignal;

          const baseUrl = webMode === 'Brave'
                ? `https://search.brave.com/search?q=${encodeURIComponent(query)}`
                : webMode === 'Google'
                    ? `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=us`
                    : `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

            const response = await fetch(baseUrl, {
                signal: signalForSerpFetch,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'sec-fetch-dest': 'document',
                    'sec-fetch-mode': 'navigate',
                    'sec-fetch-site': 'none',
                    'sec-fetch-user': '?1',
                    'upgrade-insecure-requests': '1',
                    ...(webMode === 'Brave' ? { 'Referer': 'https://search.brave.com/' } : {}),
                    ...(webMode === 'Google' ? { 'Referer': 'https://www.google.com/' } : {}),
                }
            }).finally(() => {
                clearTimeout(serpApiTimeoutId);
            });

            if (!response.ok) {
                throw new Error(`Web search failed (${webMode}) with status: ${response.status}`);
            }
            if (effectiveSignal.aborted) throw new Error("Web search operation aborted.");
            const htmlString = await response.text();
            const parser = new DOMParser();
            console.log(`[webSearch - ${webMode}] SERP HTML (first 500 chars):`, htmlString.substring(0, 500));
            const htmlDoc = parser.parseFromString(htmlString, 'text/html');

            interface SearchResult {
                title: string;
                snippet: string;
                url: string | null;
                content?: string;
            }
            const searchResults: SearchResult[] = [];

            if (webMode === 'Duckduckgo') {
                const results = htmlDoc.querySelectorAll('.web-result');
                for (const result of results) {
                     const titleEl = result.querySelector('.result__a');
                     const snippetEl = result.querySelector('.result__snippet');
                     const title = titleEl?.textContent?.trim() || '';
                     const rawUrl = titleEl?.getAttribute('href') || '';
                     const snippet = snippetEl?.textContent?.trim() || '';
                     const extractRealUrl = (duckduckgoRedirectUrl: string): string => {
                        try {
                            const urlObj = new URL(duckduckgoRedirectUrl, 'https://duckduckgo.com');
                            const encodedUrl = urlObj.searchParams.get("uddg");
                            return encodedUrl ? decodeURIComponent(encodedUrl) : duckduckgoRedirectUrl;
                        } catch (e) {
                            console.error("Invalid redirect URL:", duckduckgoRedirectUrl);
                            return duckduckgoRedirectUrl;
                        }
                     };

                     const realUrl = extractRealUrl(rawUrl);
                     if (title && realUrl) {
                     searchResults.push({
                         title,
                         snippet,
                         url: realUrl,
                        });
                      }
                    }
            } else if (webMode === 'Google') {
                htmlDoc.querySelectorAll('div.g, div.MjjYud, div.hlcw0c').forEach(result => {
                    const linkEl = result.querySelector('a[href]');
                    const url = linkEl?.getAttribute('href');
                    const titleEl = result.querySelector('h3');
                    const title = titleEl?.textContent?.trim() || '';
                    let snippet = '';
                    const snippetEls = result.querySelectorAll('div[style="-webkit-line-clamp:2"], div[data-sncf="1"], .VwiC3b span, .MUxGbd span');
                    if (snippetEls.length > 0) {
                        snippet = Array.from(snippetEls).map(el => el.textContent).join(' ').replace(/\s+/g, ' ').trim();
                    } else {
                        const containerText = result.textContent || '';
                        const titleIndex = title ? containerText.indexOf(title) : -1;
                        if (titleIndex !== -1) {
                           snippet = containerText.substring(titleIndex + title.length).replace(/\s+/g, ' ').trim().substring(0, 300);
                        }
                    }
                    if (title && url && url.startsWith('http')) {
                        searchResults.push({ title, snippet, url });
                    }
                });
            } else if (webMode === 'Brave') {
                htmlDoc.querySelectorAll('#results .snippet[data-type="web"]').forEach(result => {
                    const linkEl = result.querySelector('a[href]');
                    const url = linkEl?.getAttribute('href');
                    const title = linkEl?.querySelector('.title')?.textContent?.trim() || '';
                    const snippet = result.querySelector('.snippet-description')?.textContent?.trim() || '';
                    if (title && url && url.startsWith('http')) {
                        searchResults.push({ title, snippet, url });
                    }
                });
                 if (searchResults.length === 0) { 
                     htmlDoc.querySelectorAll('.organic-result').forEach(result => {
                        const linkEl = result.querySelector('a[href]');
                        const url = linkEl?.getAttribute('href');
                        const title = result.querySelector('h3')?.textContent?.trim() || '';
                        const snippet = result.querySelector('.snippet-content')?.textContent?.trim() || '';
                         if (title && url && url.startsWith('http')) {
                             searchResults.push({ title, snippet, url });
                         }
                     });
                 }
            }
            console.log(`[webSearch - ${webMode}] Parsed SERP Results (${searchResults.length} found, showing first 5):`, JSON.stringify(searchResults.slice(0, 5)));

            if (searchResults.length === 0) {
                console.log("No search results found on SERP.");
                return 'No results found.';
            }

            const linksToFetch = searchResults.slice(0, maxLinksToVisit).filter(r => r.url);
            console.log(`Found ${searchResults.length} results. Attempting to fetch content from top ${linksToFetch.length} links (maxLinksToVisit: ${maxLinksToVisit}).`);

            const pageFetchPromises = linksToFetch.map(async (result) => {
                if (!result.url) return { ...result, content: '[Invalid URL]', status: 'error' };
                if (effectiveSignal.aborted) return { ...result, content: `[Fetching aborted by user: ${result.url}]`, status: 'aborted' };

                console.log(`Fetching content from: ${result.url}`);
                const pageTimeoutController = new AbortController();
                const pageTimeoutId = setTimeout(() => {
                    console.warn(`[webSearch] Page scrape for ${result.url} timed out after 12s.`);
                    pageTimeoutController.abort();
                }, 12000);

                const signalForPageFetch = (typeof AbortSignal.any === 'function')
                    ? AbortSignal.any([effectiveSignal, pageTimeoutController.signal])
                    : effectiveSignal;

                let pageContent = `[Error fetching/processing: Unknown error for ${result.url}]`;
                let pageStatus: 'success' | 'error' | 'aborted' = 'error';
                try {
                    const pageResponse = await fetch(result.url, {
                        signal: signalForPageFetch,
                        method: 'GET',
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.9',
                        }
                    });
                    if (!pageResponse.ok) throw new Error(`Failed to fetch ${result.url} - Status: ${pageResponse.status}`);
                    const contentType = pageResponse.headers.get('content-type');
                    if (!contentType || !contentType.includes('text/html')) throw new Error(`Skipping non-HTML content (${contentType}) from ${result.url}`);
                    if (effectiveSignal.aborted) throw new Error("Web search operation aborted by user.");

                    const pageHtml = await pageResponse.text();
                    pageContent = extractMainContent(pageHtml);
                    pageStatus = 'success';
                    console.log(`[webSearch - ${webMode}] Successfully fetched and extracted content from: ${result.url} (Extracted Length: ${pageContent.length})`);
                } catch (error: any) {
                    if (error.name === 'AbortError') {
                        if (effectiveSignal.aborted) throw error;
                        pageContent = pageTimeoutController.signal.aborted ? `[Timeout fetching: ${result.url}]` : `[Fetching aborted: ${result.url}]`;
                        pageStatus = 'aborted';
                    } else {
                        pageContent = `[Error fetching/processing: ${error.message}]`;
                        pageStatus = 'error';                    
                    }
                } finally {
                    clearTimeout(pageTimeoutId);
                }
                return { ...result, content: pageContent, status: pageStatus };
            });

            const fetchedPagesResults = await Promise.allSettled(pageFetchPromises);
            if (effectiveSignal.aborted) throw new Error("Web search operation aborted.");

            let combinedResultsText = `Search results for "${query}" using ${webMode}:\n\n`;
            let pageIndex = 0; 
            searchResults.forEach((result, index) => {
                 combinedResultsText += `[Result ${index + 1}: ${result.title}]\n`;
                 combinedResultsText += `URL: ${result.url || '[No URL Found]'}\n`;
                 combinedResultsText += `Snippet: ${result.snippet || '[No Snippet]'}\n`;

                 if (index < linksToFetch.length) {
                     const correspondingFetch = fetchedPagesResults[pageIndex];
                     if (correspondingFetch?.status === 'fulfilled') {
                         const fetchedData = correspondingFetch.value;
                         if (fetchedData.url === result.url) {
                            const contentPreview = fetchedData.content.substring(0, charLimitPerPage); 
                            combinedResultsText += `Content:\n${contentPreview}${fetchedData.content.length > charLimitPerPage ? '...' : ''}\n\n`;
                         } else {
                             combinedResultsText += `Content: [Content fetch mismatch - data for ${fetchedData.url} found, expected ${result.url}]\n\n`;
                         }
                     } else if (correspondingFetch?.status === 'rejected') {
                         combinedResultsText += `Content: [Error fetching: ${correspondingFetch.reason}]\n\n`;
                     } else {
                         combinedResultsText += `Content: [Fetch status unknown]\n\n`;
                     }
                     pageIndex++;
                 } else {
                     combinedResultsText += `Content: [Not fetched due to link limit]\n\n`;
                 }
            });
            console.log("Web search finished. Returning combined results.");
            return combinedResultsText.trim();

        } else if (webMode === 'Wikipedia') {
            const WIKIPEDIA_API_URL = 'https://search.genie.stanford.edu/wikipedia_20250320';
            const requestBody: {
                query: string[];
                num_blocks: number;
                rerank?: boolean;
                num_blocks_to_rerank?: number;
            } = {
                query: [query],
                num_blocks: config.wikiNumBlocks ?? 3,
            };

            if (config.wikiRerank) { 
                requestBody.rerank = true;
                requestBody.num_blocks_to_rerank = config.wikiNumBlocksToRerank ?? Math.max(requestBody.num_blocks, 10);
            }

            console.log(`Performing Wikipedia search for: "${query}" with params:`, requestBody);
            const wikiTimeoutController = new AbortController();
            const wikiApiTimeoutId = setTimeout(() => {
                 console.warn(`[webSearch - Wikipedia] API call timed out after 15s.`);
                 wikiTimeoutController.abort();
            }, 15000);
            const signalForWikiFetch = (typeof AbortSignal.any === 'function')
                ? AbortSignal.any([effectiveSignal, wikiTimeoutController.signal])
                : effectiveSignal;

            try {
                const response = await fetch(WIKIPEDIA_API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody),
                    signal: signalForWikiFetch,
                });
                if (effectiveSignal.aborted) throw new Error("Wikipedia search operation aborted.");

                if (!response.ok) {
                    const errorBody = await response.text();
                    throw new Error(`Wikipedia API request failed with status ${response.status}: ${errorBody}`);
                }

                const apiResponse: WikiQueryResult[] = await response.json();
                console.log(`[webSearch - Wikipedia] Raw API Response (first result block if exists):`, apiResponse && apiResponse.length > 0 ? JSON.stringify(apiResponse[0]?.results?.slice(0,1)) : "Empty or unexpected response");
                let combinedResultsText = `Wikipedia search results for "${query}":\n\n`;

                if (apiResponse && apiResponse.length > 0 && apiResponse[0].results) {
                    if (apiResponse[0].results.length === 0) {
                        return `No Wikipedia results found for "${query}".`;
                    }
                    apiResponse[0].results.forEach((block, index) => {
                      console.log(`[webSearch - Wikipedia] Processing result block ${index + 1}:`, {title: block.document_title, section: block.section_title, summary_length: block.summary?.length, content_length: block.content?.length});
                        combinedResultsText += `[Wiki Result ${index + 1}: ${block.document_title}${block.section_title ? ` - ${block.section_title}` : ''}]\n`;
                        
                        if (block.summary && block.summary.length > 0) {
                            combinedResultsText += 'Summary:\n' + block.summary.map(s => `  - ${s}`).join('\n') + '\n';
                        } else {
                            const contentPreview = block.content.substring(0, 700);
                            combinedResultsText += `Content: ${contentPreview}${block.content.length > 700 ? '...' : ''}\n`;
                        }
                        
                        combinedResultsText += `URL: ${block.url || 'N/A'}\n`;
                        combinedResultsText += `Language: ${block.language}, Type: ${block.block_type}, Score: ${block.probability_score?.toFixed(3)}\n`;
                        if (block.last_edit_date) {
                            try {
                                combinedResultsText += `Last Edited: ${new Date(block.last_edit_date).toLocaleDateString()}\n`;
                            } catch (e) { /* ignore date parsing error */ }
                        }
                        combinedResultsText += '\n';
                    });
                } else {
                    return `No Wikipedia results found or unexpected API response for "${query}".`;
                }
                return combinedResultsText.trim();
            } catch (error: any) {
                if (error.name === 'AbortError' && effectiveSignal.aborted) {
                    throw error;
                }
                console.error('Wikipedia search failed:', error);
                return `Error performing Wikipedia search: ${error.message}`;
            } finally {
                clearTimeout(wikiApiTimeoutId);
            }

        } else if (webMode === 'GoogleCustomSearch') {
            if (!config.googleApiKey || !config.googleCx) {
                return 'Error: Google API Key or CX ID is not configured.';
            }
            const apiKey = config.googleApiKey;
            const cx = config.googleCx;
            const customSearchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=${maxLinksToVisit > 10 ? 10 : maxLinksToVisit}`;
            const gcsApiTimeoutController = new AbortController();
            const gcsApiTimeoutId = setTimeout(() => {
                console.warn(`[webSearch - GoogleCustomSearch] API call timed out after 15s.`);
                gcsApiTimeoutController.abort();
            }, 15000);
            const signalForGcsApiFetch = (typeof AbortSignal.any === 'function')
                ? AbortSignal.any([effectiveSignal, gcsApiTimeoutController.signal])
                : effectiveSignal;

            console.log(`Performing Google Custom Search API call for: "${query}"`);
            let apiResponse: GoogleCustomSearchResponse;
            try {
                const response = await fetch(customSearchUrl, {
                    signal: signalForGcsApiFetch,
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                    }
                });

                if (!response.ok) {
                    if (effectiveSignal.aborted) throw new Error("Google Custom Search API call aborted.");
                    const errorBody = await response.json().catch(() => response.text());
                    console.error(`Google Custom Search API request failed with status ${response.status}:`, errorBody);
                    const errorMessage = errorBody?.error?.message || `API request failed with status ${response.status}`;
                    throw new Error(errorMessage);
                }
                apiResponse = await response.json();

                if (effectiveSignal.aborted) throw new Error("Google Custom Search API call aborted after response.");
                if (apiResponse.error) {
                     console.error('Google Custom Search API returned an error:', apiResponse.error);
                     throw new Error(`API Error: ${apiResponse.error.message}`);
                }
                console.log(`[webSearch - GoogleCustomSearch] API Response (first item if exists):`, apiResponse?.items?.[0] ? JSON.stringify(apiResponse.items[0]) : "No items or unexpected response");

            } catch (error: any) {
                if (error.name === 'AbortError' && effectiveSignal.aborted) {
                    throw error;
                }
                console.error('Google Custom Search API call failed:', error);
                return `Error during Google Custom Search API call: ${error.message}`;
            } finally {
                clearTimeout(gcsApiTimeoutId);
            }

            if (!apiResponse.items || apiResponse.items.length === 0) {
                return `No Google Custom Search results found for "${query}". (Total results from API: ${apiResponse.searchInformation?.totalResults || '0'})`;
            }

            interface SearchResult {
                title: string;
                snippet: string;
                url: string | null;
            }
            const searchResults: SearchResult[] = apiResponse.items.map(item => ({
                title: item.htmlTitle || item.title,
                snippet: item.htmlSnippet || item.snippet,
                url: item.link
            })).filter(item => item.url);

            console.log(`[webSearch - GoogleCustomSearch] Mapped ${searchResults.length} API results to scraper format. Attempting to fetch content from top ${Math.min(searchResults.length, maxLinksToVisit)} links.`);

            const linksToFetch = searchResults.slice(0, maxLinksToVisit).filter(r => r.url);

            const pageFetchPromises = linksToFetch.map(async (result) => {
                if (!result.url) return { ...result, content: '[Invalid URL]', status: 'error' };
                if (effectiveSignal.aborted) return { ...result, scrapedContent: `[Scraping aborted by user: ${result.url}]`, status: 'aborted' };

                console.log(`[GoogleCustomSearch - Scraper] Fetching content from: ${result.url}`);
                const gcsPageTimeoutController = new AbortController();
                const gcsPageTimeoutId = setTimeout(() => {
                    console.warn(`[GoogleCustomSearch - Scraper] Page scrape for ${result.url} timed out after 12s.`);
                    gcsPageTimeoutController.abort();
                }, 12000);

                const signalForGcsPageFetch = (typeof AbortSignal.any === 'function')
                    ? AbortSignal.any([effectiveSignal, gcsPageTimeoutController.signal])
                    : effectiveSignal;
                
                let scrapedPageContent = `[Error fetching/processing page: Unknown error for ${result.url}]`;
                let pageStatus: 'success' | 'error' | 'aborted' = 'error';
                try {
                    const pageResponse = await fetch(result.url, {
                        signal: signalForGcsPageFetch,
                        method: 'GET',
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.9',
                        }
                    });
                    if (!pageResponse.ok) throw new Error(`Failed to fetch ${result.url} - Status: ${pageResponse.status}`);
                    const contentType = pageResponse.headers.get('content-type');
                    if (!contentType || !contentType.includes('text/html')) throw new Error(`Skipping non-HTML content (${contentType}) from ${result.url}`);
                    if (effectiveSignal.aborted) throw new Error("Google Custom Search page scraping aborted by user.");
                    const pageHtml = await pageResponse.text();
                    scrapedPageContent = extractMainContent(pageHtml);
                    pageStatus = 'success';
                    console.log(`[GoogleCustomSearch - Scraper] Successfully fetched and extracted content from: ${result.url} (Extracted Length: ${scrapedPageContent.length})`);
                } catch (error: any) {
                    if (error.name === 'AbortError') {
                        if (effectiveSignal.aborted) throw error;
                        scrapedPageContent = gcsPageTimeoutController.signal.aborted ? `[Timeout scraping: ${result.url}]` : `[Scraping aborted: ${result.url}]`;
                        pageStatus = 'aborted';
                    } else {
                        scrapedPageContent = `[Error fetching/processing page: ${error.message}]`;
                        pageStatus = 'error';
                    }
                } finally {
                    clearTimeout(gcsPageTimeoutId);
                }
                return { ...result, scrapedContent: scrapedPageContent, status: pageStatus };
            });

            const fetchedPagesResults = await Promise.allSettled(pageFetchPromises);
            if (effectiveSignal.aborted) throw new Error("Web search operation aborted.");

            let combinedResultsText = `Google Custom Search results for "${query}" (with scraped content):\n\n`;
            let pageIndex = 0;
            searchResults.slice(0, maxLinksToVisit).forEach((result, index) => {
                 combinedResultsText += `[Result ${index + 1}: ${result.title}]\n`;
                 combinedResultsText += `URL: ${result.url || '[No URL Found]'}\n`;
                 combinedResultsText += `API Snippet: ${result.snippet || '[No API Snippet]'}\n`;

                 const correspondingFetch = fetchedPagesResults[pageIndex];
                 if (correspondingFetch?.status === 'fulfilled') {
                     const fetchedData = correspondingFetch.value as (typeof searchResults[0] & { scrapedContent: string });
                     if (fetchedData.url === result.url) { 
                        const contentPreview = fetchedData.scrapedContent.substring(0, charLimitPerPage);
                        combinedResultsText += `Scraped Content:\n${contentPreview}${fetchedData.scrapedContent.length > charLimitPerPage ? '...' : ''}\n\n`;
                     } else {
                        combinedResultsText += `Scraped Content: [Content fetch mismatch - data for ${fetchedData.url} found, expected ${result.url}]\n\n`;
                     }
                 } else if (correspondingFetch?.status === 'rejected') {
                     combinedResultsText += `Scraped Content: [Error fetching page: ${correspondingFetch.reason}]\n\n`;
                 } else {
                     combinedResultsText += `Scraped Content: [Not fetched or status unknown]\n\n`;
                 }
                 pageIndex++;
            });
            console.log("Google Custom Search with scraping finished. Returning combined results.");
            return combinedResultsText.trim();

        } else {
            return `Unsupported web search mode: ${webMode}`;
        }
    } catch (error: any) {
        if (error.name === 'AbortError' && effectiveSignal.aborted) {
            console.log('[webSearch] Operation aborted by signal.');
            throw error;
        }
        console.error('Web search overall failed:', error);
        return `Error performing web search: ${error.message}`;
    }
};


export async function fetchDataAsStream(
      url: string,
      data: Record<string, unknown>,
      onMessage: (message: string, done?: boolean, error?: boolean) => void,
      headers: Record<string, string> = {},
      host: string,
      abortSignal?: AbortSignal
    ) {
      let streamFinished = false;

      const finishStream = (message: unknown, isError: boolean = false) => {
        if (!streamFinished) {
          streamFinished = true;
          let finalMessage: string;
          if (typeof message === 'string') {
            finalMessage = message;
          } else if (message && typeof message === 'object' && 'message' in message && typeof (message as any).message === 'string') {
            finalMessage = (message as any).message;
          } else {
            finalMessage = String(message);
          }
          onMessage(finalMessage, true, isError);
        }
      };

      const checkAborted = () => {
        if (abortSignal?.aborted) throw new Error("Streaming operation aborted by user.");
      };

      const cleanUrl = (url: string) => {
        if (url.endsWith('/')) {
          return url.slice(0, -1);
        }
        return url;
      }

      if (url.startsWith('chrome://')) {
        console.log("fetchDataAsStream: Skipping chrome:// URL:", url);
        return;
      }

      if (url.includes('localhost')) {
        await urlRewriteRuntime(cleanUrl(url));
      }

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify(data),
          signal: abortSignal
        });

        if (!response.ok) {
          let errorBody = `Network response was not ok (${response.status})`;
          try {
             const text = await response.text();
             errorBody += `: ${text || response.statusText}`;
          } catch (_) {
             errorBody += `: ${response.statusText}`;
          }
          throw new Error(errorBody);
        }

        let str = '';

        if (host === "ollama") {
            if (!response.body) throw new Error('Response body is null for Ollama');
            const reader = response.body.getReader();
            let done, value;
            while (true) {
              checkAborted();
              ({ value, done } = await reader.read());
              if (done) break;
              const chunk = new TextDecoder().decode(value);
              const jsonObjects = chunk.split('\n').filter(line => line.trim() !== '');

              for (const jsonObjStr of jsonObjects) {
                 if (jsonObjStr.trim() === '[DONE]') {
                    if (abortSignal?.aborted) reader.cancel();
                    finishStream(str);
                    return;
                 }
                 try {
                    const parsed = JSON.parse(jsonObjStr);
                    if (parsed.message?.content) {
                      str += parsed.message.content;
                      if (!streamFinished) onMessage(str);
                    }
                    if (parsed.done === true && !streamFinished) {
                       if (abortSignal?.aborted) reader.cancel();
                       finishStream(str);
                       return;
                    }
                 } catch (error) {
                    console.debug('Skipping invalid JSON chunk:', jsonObjStr);
                 }
              }
            }
            if (abortSignal?.aborted) reader.cancel();
            finishStream(str);

          } else if (["lmStudio", "groq", "gemini", "openai", "openrouter", "custom"].includes(host)) {
            const stream = events(response);
            for await (const event of stream) {
              checkAborted();
              if (streamFinished) continue;
              if (!event.data) continue;

              if (event.data.trim() === '[DONE]') {
                finishStream(str);
                break;
              }

              try {
                const received = JSON.parse(event.data);
                let apiError = null;
                if (host === 'groq' && received?.x_groq?.error) apiError = received.x_groq.error;
                else if (host === 'gemini' && received?.error) apiError = received.error.message || JSON.stringify(received.error);
                else if (received?.error) apiError = received.error.message || JSON.stringify(received.error);

                if (apiError) {
                   throw new Error(`API Error: ${apiError}`);
                }

                str += received?.choices?.[0]?.delta?.content || '';
                if (!streamFinished) onMessage(str);

              } catch (error) {
                if (error instanceof Error && error.message.startsWith('API Error:')) {
                   finishStream(error.message, true);
                } else {
                   console.debug('Skipping invalid SSE chunk or parse error:', event.data, error);
                }
              }
            }
            finishStream(str);

          } else {
             throw new Error(`Unsupported host specified: ${host}`);
          }

      } catch (error) {
        if (abortSignal?.aborted) {
          console.log(`[fetchDataAsStream] Operation aborted via signal as expected. Details:`, error);
          finishStream("", false);
        } else if (error instanceof Error && error.name === 'AbortError') {
          console.log(`[fetchDataAsStream] AbortError (name check) caught. Operation was cancelled. Details:`, error);
          finishStream("", false);
        } else {
          console.error('Error in fetchDataAsStream (unexpected):', error);
          finishStream(error instanceof Error ? error.message : String(error), true);
        }
      }
    }

/**
 * Scrape the main content from a given URL using the same headers as SERP scraping.
 */
export async function scrapeUrlContent(url: string, abortSignal?: AbortSignal): Promise<string> {
  const controller = new AbortController();
  const signal = abortSignal || controller.signal;
  const timeoutId = !abortSignal ? setTimeout(() => controller.abort(), 12000) : null;
  try {
    const response = await fetch(url, {
      signal: signal,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    if (timeoutId) clearTimeout(timeoutId);
    if (signal.aborted) throw new Error("Scraping aborted by user.");
    if (!response.ok) throw new Error(`Failed to fetch ${url} - Status: ${response.status}`);
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('text/html')) throw new Error(`Skipping non-HTML content (${contentType}) from ${url}`);
    const html = await response.text();
    return extractMainContent(html);
  } catch (error: any) {
    if (timeoutId) clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
        return `[Scraping URL aborted: ${url}]`;
    }
    return `[Error scraping URL: ${url} - ${error.message}]`;
  }
}