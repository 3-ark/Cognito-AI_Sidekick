import { vi, describe, it, expect, beforeEach, Mock } from 'vitest';
import { handleBuildAllEmbeddingsRequest } from '../handlers';
import * as embeddingManager from '../embeddingManager';
import ChannelNames from '../../types/ChannelNames';

vi.mock('../embeddingManager', () => ({
  buildAllEmbeddings: vi.fn(),
}));

describe('Background Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.chrome = {
      runtime: {
        sendMessage: vi.fn(),
      },
    } as any;
  });

  describe('handleBuildAllEmbeddingsRequest', () => {
    it('should send start/end messages and call rebuild functions', async () => {
      const mockSearchService = {
        indexAllFullRebuild: vi.fn().mockResolvedValue(undefined),
      };
      const getSearchService = vi.fn().mockResolvedValue(mockSearchService);
      const sendResponse = vi.fn();

      (embeddingManager.buildAllEmbeddings as Mock).mockResolvedValue(undefined);

      await handleBuildAllEmbeddingsRequest(getSearchService, sendResponse);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'EMBEDDING_START',
        data: { total: 0 },
      });
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'EMBEDDING_END' });
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: ChannelNames.BM25_REBUILD_START,
      });
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: ChannelNames.BM25_REBUILD_END,
      });
      expect(embeddingManager.buildAllEmbeddings).toHaveBeenCalled();
      expect(getSearchService).toHaveBeenCalled();
      expect(mockSearchService.indexAllFullRebuild).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('should send an error message on failure', async () => {
      const errorMessage = 'Rebuild failed';
      const getSearchService = vi.fn(); // This won't be called if embedding fails
      const sendResponse = vi.fn();

      (embeddingManager.buildAllEmbeddings as Mock).mockRejectedValue(new Error(errorMessage));

      await handleBuildAllEmbeddingsRequest(getSearchService, sendResponse);

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'EMBEDDING_ERROR',
        error: errorMessage,
      });
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: errorMessage,
      });
    });
  });
});
