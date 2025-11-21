import { useCallback,useState } from 'react';
import { useConfig } from '../ConfigContext';

import type { HydratedChunkSearchResultItem } from '../../background/searchUtils'; // Updated type
import ChannelNames from '../../types/ChannelNames';

export interface RetrieverResult {
  query: string;
  results: HydratedChunkSearchResultItem[]; // Updated to use HydratedChunkSearchResultItem
  formattedResults: string;
}

// Updated to format chunk-based results for an LLM
const formatRetrievedChunkResultsForLLM = (query: string, results: HydratedChunkSearchResultItem[]): string => {
  if (!results || results.length === 0) {
    return ""; // No results, so no context to add
  }

  // This formatting is similar to the one in searchUtils.ts, adapting for consistency.
  let promptOutput = `The user performed a search for "${query}" and the following top ${results.length} relevant text segments were found. Use these to answer the user's question:\n\n`;

  results.forEach((result, index) => {
    const title = result.parentTitle || result.parentId || 'Untitled Document';

    // Clarify it's a segment
    promptOutput += `[${index + 1}] ### [Segment from: ${title} (Part ${index + 1})] (Original ID: ${result.parentId}, Chunk ID: ${result.id}, Score: ${result.score.toFixed(2)})\n`;
    promptOutput += `Original Document Type: ${result.originalType}\n`;

    if (result.metadata) {
      if (result.metadata.sectionTitle) {
        promptOutput += `Section: ${result.metadata.sectionTitle}\n`;
      } else if (result.headingPath && result.headingPath.length > 0) {
        // If sectionTitle is not directly available, use headingPath for markdown notes
        promptOutput += `Section Path: ${result.headingPath.join(' > ')}\n`;
      }
 
      if (result.metadata.turnIndices) {
        promptOutput += `Turns: ${result.metadata.turnIndices[0]}-${result.metadata.turnIndices[1]}\n`;
      }

      if (result.metadata.jsonPath) {
        promptOutput += `JSON Path: ${result.metadata.jsonPath}\n`;
      }
    }

    // We might want to truncate content if it's too long for the prompt, though LLMs handle larger contexts now.
    // For now, include full chunk content.
    promptOutput += `Content of segment:\n${result.content}\n\n`;
  });

  return promptOutput.trim();
};

export const useRetriever = () => {
  const { config } = useConfig();
  const [retrieverResults, setRetrieverResults] = useState<RetrieverResult | null>(null);
  const [isRetrieving, setIsRetrieving] = useState<boolean>(false);

  const clearRetrieverResults = useCallback(() => {
    setRetrieverResults(null);
  }, []);

  const retrieve = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setRetrieverResults(null);

      return;
    }

    setIsRetrieving(true);
    setRetrieverResults(null); // Clear previous results immediately

    try {
      console.log(`[useRetriever] Sending chunk search request to background for: "${searchQuery}"`);

      // Expecting HydratedChunkSearchResultItem[] in response.results
      const response = await new Promise<{ success: boolean, results?: HydratedChunkSearchResultItem[], error?: string }>((resolve, reject) => {
        const finalTopK = config.ragConfig?.final_top_k ?? 10;
        chrome.runtime.sendMessage(
          {
            type: ChannelNames.SEARCH_NOTES_REQUEST,
            payload: { query: searchQuery, topK: finalTopK },
          },
          res => { // Renamed to avoid conflict with outer response
            if (chrome.runtime.lastError) {
              return reject(new Error(chrome.runtime.lastError.message));
            }

            if (!res) {
                return reject(new Error("No response from background script for chunk search."));
            }

            resolve(res);
          },
        );
      });

      console.log(`[useRetriever] Received chunk search response from background:`, response);

      if (response.success && response.results && response.results.length > 0) {
        const hydratedChunkResults: HydratedChunkSearchResultItem[] = response.results;

        console.log(`[useRetriever] Hydrated chunk results count: ${hydratedChunkResults.length}`);
        
        const formattedContext = formatRetrievedChunkResultsForLLM(searchQuery, hydratedChunkResults);

        setRetrieverResults({
          query: searchQuery,
          results: hydratedChunkResults, // Store the chunk results
          formattedResults: formattedContext,
        });
      } else if (!response.success && response.error) {
        console.error('[useRetriever] Chunk search failed in background:', response.error);
        setRetrieverResults({
          query: searchQuery,
          results: [],
          formattedResults: `Error performing search for "${searchQuery}": ${response.error}`,
        });
      } else if (response.success && (!response.results || response.results.length === 0)) {
        setRetrieverResults({
          query: searchQuery,
          results: [],
          formattedResults: `No relevant segments found for your search: "${searchQuery}".`, // Updated message
        });
      } else {
        console.error('[useRetriever] Unexpected response structure from background chunk search:', response);
        setRetrieverResults({
          query: searchQuery,
          results: [],
          formattedResults: `Error performing search for "${searchQuery}": Unexpected response.`,
        });
      }
    } catch (error: any) {
      console.error('[useRetriever] Error during sendMessage or processing chunk search response:', error);
      setRetrieverResults({
        query: searchQuery,
        results: [],
        formattedResults: `Error performing search for "${searchQuery}": ${error.message}`,
      });
    } finally {
      setIsRetrieving(false);
    }
  }, [config]);

  return {
    retrieverResults,
    isRetrieving,
    retrieve,
    clearRetrieverResults,
  };
};
