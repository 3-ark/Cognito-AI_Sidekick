import { buildAllEmbeddings } from './embeddingManager';
import ChannelNames from '../types/ChannelNames';

type SearchService = {
  indexAllFullRebuild: () => Promise<void>;
};

type GetSearchService = () => Promise<SearchService>;

export const handleBuildAllEmbeddingsRequest = async (
  getSearchService: GetSearchService,
  sendResponse: (response: any) => void,
) => {
  try {
    console.log('[Background] Starting full data rebuild process...');
    chrome.runtime.sendMessage({ type: 'EMBEDDING_START', data: { total: 0 } });

    await buildAllEmbeddings();

    console.log('[Background] Embedding rebuild complete. Starting search index rebuild...');
    chrome.runtime.sendMessage({ type: 'EMBEDDING_END' });

    chrome.runtime.sendMessage({ type: ChannelNames.BM25_REBUILD_START });
    const searchService = await getSearchService();
    await searchService.indexAllFullRebuild();
    chrome.runtime.sendMessage({ type: ChannelNames.BM25_REBUILD_END });
    console.log('[Background] Search index rebuild complete.');

    sendResponse({ success: true });
  } catch (error: any) {
    console.error('[Background] Error during full data rebuild:', error);
    chrome.runtime.sendMessage({ type: 'EMBEDDING_ERROR', error: error.message });
    sendResponse({ success: false, error: error.message });
  }
};
