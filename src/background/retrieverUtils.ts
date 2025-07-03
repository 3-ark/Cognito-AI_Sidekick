import {
  search,
  hydrateSearchResults,
  formatResultsForLLM,
  RawBM25SearchResult,
  HydratedSearchResultItem,
  engineInitializationPromise
} from './searchUtils';
import storage from './storageUtil';
import type { Config } from '../types/config';

/**
 * Retrieves and formats BM25 search results.
 * @param query The search query.
 * @param topK Optional number of top results to retrieve. If not provided, it will try to get from config or use a default.
 * @returns A string containing the formatted search results, or an error message.
 */
export async function getBM25SearchResults(query: string, topK?: number): Promise<string> {
  await engineInitializationPromise; // Ensure search engine is ready

  let k = topK;
  if (k === undefined) {
    try {
      const configStr: string | null = await storage.getItem('config');
      const config: Config | null = configStr ? JSON.parse(configStr) : null;
      k = config?.rag?.bm25?.topK ?? 5; // Default to 5 if not in config
    } catch (error) {
      console.warn('[retrieverUtils] Could not load topK from config, using default 5:', error);
      k = 5;
    }
  }

  if (!query || query.trim() === "") {
    console.warn('[retrieverUtils] getBM25SearchResults called with empty query.');
    return "No query provided for BM25 search.";
  }
  console.log(`[retrieverUtils] getBM25SearchResults: Processing query="${query}", topK=${k}`);

  try {
    const rawResults: RawBM25SearchResult[] = await search(query, k);
    console.log('[retrieverUtils] Raw BM25 results:', JSON.stringify(rawResults));

    if (!rawResults || rawResults.length === 0) {
      console.log('[retrieverUtils] No raw results from search util.');
      return "No BM25 search results found.";
    }

    const hydratedResults: HydratedSearchResultItem[] = await hydrateSearchResults(rawResults);
    console.log('[retrieverUtils] Hydrated BM25 results:', JSON.stringify(hydratedResults.map(r => ({id: r.id, title: r.title, score: r.score, type: r.type}))));


    if (!hydratedResults || hydratedResults.length === 0) {
      console.log('[retrieverUtils] Could not hydrate BM25 search results or hydration returned empty.');
      return "Could not hydrate BM25 search results.";
    }

    const formattedOutput = formatResultsForLLM(hydratedResults);
    console.log('[retrieverUtils] Formatted LLM output length:', formattedOutput.length);

    return formattedOutput;
  } catch (error: any) {
    console.error('[retrieverUtils] Error during BM25 search execution:', error);
    return `Error performing BM25 search: ${error.message || 'Unknown error'}`;
  }
}
