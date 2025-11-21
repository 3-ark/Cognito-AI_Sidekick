import {
  buildSystemPrompt,
  handlePageContent,
  handleUrlScraping,
  handleWebSearch,
} from '../useSendMessageHelpers';
import { vi, Mock } from 'vitest';
import * as network from 'src/sidePanel/network';
import * as scrapers from 'src/sidePanel/utils/scrapers';
import * as pdf from 'src/utils/pdf';
import storage from 'src/background/storageUtil';
import { Config } from 'src/types/config';

vi.mock('src/sidePanel/network');
vi.mock('src/sidePanel/utils/scrapers');
vi.mock('src/utils/pdf');
vi.mock('src/background/storageUtil');

const mockConfig = {
  chatMode: 'page',
  contextLimit: 10,
  personas: {
    default: 'You are a helpful assistant.',
  },
  persona: 'default',
} as unknown as Config;

describe('useSendMessageHelpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handlePageContent', () => {
    it('should read from storage for normal pages', async () => {
      (storage.getItem as Mock).mockResolvedValue('page content');
      // @ts-ignore
      chrome.tabs.query.mockResolvedValue([{ url: 'https://example.com' }]);
      const content = await handlePageContent(mockConfig, vi.fn(), vi.fn(), 1);
      expect(content).toBe('page content');
      expect(storage.getItem).toHaveBeenCalledWith('pagestring');
    });

    it('should extract text for PDF URLs', async () => {
      (pdf.extractTextFromPdf as Mock).mockResolvedValue('pdf content');
      // @ts-ignore
      chrome.tabs.query.mockResolvedValue([{ url: 'https://example.com/test.pdf' }]);
      const content = await handlePageContent(mockConfig, vi.fn(), vi.fn(), 1);
      expect(content).toBe('pdf content');
      expect(pdf.extractTextFromPdf).toHaveBeenCalledWith('https://example.com/test.pdf');
    });
  });

  describe('handleUrlScraping', () => {
    it('should scrape content from URLs in the message', async () => {
      (scrapers.scrapeUrlContent as Mock).mockResolvedValue('scraped content');
      const message = 'check this out: https://example.com';
      const content = await handleUrlScraping(message, new AbortController().signal, vi.fn());
      expect(content).toContain('Content from [https://example.com]:\nscraped content');
      expect(scrapers.scrapeUrlContent).toHaveBeenCalledWith(
        'https://example.com',
        expect.any(AbortSignal),
      );
    });

    it('should return empty string if no URLs are present', async () => {
      const message = 'hello there';
      const content = await handleUrlScraping(message, new AbortController().signal, vi.fn());
      expect(content).toBe('');
      expect(scrapers.scrapeUrlContent).not.toHaveBeenCalled();
    });
  });

  describe('buildSystemPrompt', () => {
    it('should build a prompt with all available context', () => {
      const config = {
        ...mockConfig,
        chatMode: 'page',
        useNote: true,
        noteContent: 'my note',
        userName: 'Jules',
        userProfile: 'is a software engineer',
      } as unknown as Config;
      const prompt = buildSystemPrompt(
        config,
        'page content',
        'web content',
        'scraped content',
        'retrieved context',
        'session context',
      );

      expect(prompt).toContain('You are a helpful assistant.');
      expect(prompt).toContain('Use the following page content for context: page content');
      expect(prompt).not.toContain('Refer to this web search summary');
      expect(prompt).toContain("Refer to this note for context: my note");
      expect(prompt).toContain('You are interacting with a user named "Jules".');
      expect(prompt).toContain('Their provided profile information is: "is a software engineer".');
      expect(prompt).toContain('Use the following scraped content from URLs in the user\'s message:\nscraped content');
      expect(prompt).toContain('retrieved context');
      expect(prompt).toContain('cite the source');
      expect(prompt).toContain('session context');
    });

    it('should build a prompt for web search', () => {
        const config = {
          ...mockConfig,
          chatMode: 'web',
        } as unknown as Config;
        const prompt = buildSystemPrompt(config, '', 'web content', '', undefined, '');
        expect(prompt).toContain('Refer to this web search summary: web content');
        expect(prompt).not.toContain('page content for context');
    });
  });

  describe('handleWebSearch', () => {
    const mockModel = { host: 'openai' };
    const mockTurnsContext: any[] = [];
    const mockController = new AbortController();
    const mockSetChatStatus = vi.fn();
    const mockUpdateAssistantTurn = vi.fn();
    const mockSetTurns = vi.fn();
    const callId = 1;

    it('should optimize query and perform web search', async () => {
      (network.processQueryWithAI as Mock).mockResolvedValue('optimized query');
      (network.webSearch as Mock).mockResolvedValue('search results');

      const { queryForProcessing, searchRes } = await handleWebSearch(
        'original query',
        mockConfig as any,
        mockModel as any,
        mockTurnsContext,
        mockController,
        mockSetChatStatus,
        mockUpdateAssistantTurn,
        mockSetTurns,
        callId,
      );

      expect(network.processQueryWithAI).toHaveBeenCalled();
      expect(network.webSearch).toHaveBeenCalledWith('optimized query', mockConfig, mockController.signal);
      expect(queryForProcessing).toBe('optimized query');
      expect(searchRes).toBe('search results');
      expect(mockSetTurns).toHaveBeenCalled();
    });

    it('should fall back to original query if optimization fails', async () => {
      (network.processQueryWithAI as Mock).mockRejectedValue(new Error('Optimization failed'));
      (network.webSearch as Mock).mockResolvedValue('search results');

      const { queryForProcessing, searchRes } = await handleWebSearch(
        'original query',
        mockConfig as any,
        mockModel as any,
        mockTurnsContext,
        mockController,
        mockSetChatStatus,
        mockUpdateAssistantTurn,
        mockSetTurns,
        callId,
      );

      expect(queryForProcessing).toBe('original query');
      expect(network.webSearch).toHaveBeenCalledWith('original query', mockConfig, mockController.signal);
      expect(searchRes).toBe('search results');
      expect(mockSetTurns).toHaveBeenCalled();
    });

    it('should throw and update turn on web search failure', async () => {
      (network.processQueryWithAI as Mock).mockResolvedValue('optimized query');
      const searchError = new Error('Search failed');
      (network.webSearch as Mock).mockRejectedValue(searchError);

      await expect(
        handleWebSearch(
          'original query',
          mockConfig as any,
          mockModel as any,
          mockTurnsContext,
          mockController,
          mockSetChatStatus,
          mockUpdateAssistantTurn,
          mockSetTurns,
          callId,
        ),
      ).rejects.toThrow(searchError);

      expect(mockUpdateAssistantTurn).toHaveBeenCalledWith(
        callId,
        'Web Search Failed: Search failed',
        true,
        true,
      );
    });
  });
});
