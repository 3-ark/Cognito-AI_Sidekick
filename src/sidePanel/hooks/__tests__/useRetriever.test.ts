import { act, renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { useRetriever } from '../useRetriever';
import ChannelNames from '../../../types/ChannelNames';
import { HydratedChunkSearchResultItem } from 'src/background/searchUtils';

const mockConfig = {
  ragConfig: {
    final_top_k: 5,
  },
};

vi.mock('../../ConfigContext', () => ({
  useConfig: () => ({
    config: mockConfig,
  }),
}));

const mockSearchResults: HydratedChunkSearchResultItem[] = [
  {
    id: 'chunk1',
    parentId: 'note1',
    originalType: 'note',
    score: 0.9,
    content: 'This is the content of chunk 1.',
    parentTitle: 'Note 1',
    metadata: {
      sectionTitle: 'Section A',
      headingPath: ['Section A'],
    },
  },
  {
    id: 'chunk2',
    parentId: 'note2',
    originalType: 'note',
    score: 0.85,
    content: 'This is the content of chunk 2.',
    parentTitle: 'Note 2',
    metadata: {
      sectionTitle: 'Section B',
      headingPath: ['Section B'],
    },
  },
];

describe('useRetriever', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure chrome.runtime.lastError is reset before each test
    if (global.chrome && global.chrome.runtime) {
      // @ts-ignore
      global.chrome.runtime.lastError = undefined;
    }
    vi.spyOn(chrome.runtime, 'sendMessage');
  });

  it('should initialize with default states', () => {
    const { result } = renderHook(() => useRetriever());

    expect(result.current.retrieverResults).toBeNull();
    expect(result.current.isRetrieving).toBe(false);
  });

  it('should not perform search for an empty query', async () => {
    const { result } = renderHook(() => useRetriever());

    await act(async () => {
      await result.current.retrieve('');
    });

    expect(result.current.retrieverResults).toBeNull();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('should set isRetrieving to true and clear previous results when starting a search', async () => {
    const { result } = renderHook(() => useRetriever());

    // @ts-ignore
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      callback({ success: true, results: [] });
    });

    act(() => {
      result.current.retrieve('test query');
    });

    expect(result.current.isRetrieving).toBe(true);
    expect(result.current.retrieverResults).toBeNull();
  });

  it('should handle successful search and format results', async () => {
    const { result } = renderHook(() => useRetriever());
    const query = 'test query';

    // @ts-ignore
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      if (message.type === ChannelNames.SEARCH_NOTES_REQUEST) {
        callback({ success: true, results: mockSearchResults });
      }
    });

    await act(async () => {
      await result.current.retrieve(query);
    });

    await waitFor(() => {
      expect(result.current.isRetrieving).toBe(false);
    });

    expect(result.current.retrieverResults).not.toBeNull();
    expect(result.current.retrieverResults?.query).toBe(query);
    expect(result.current.retrieverResults?.results).toEqual(mockSearchResults);
    expect(result.current.retrieverResults?.formattedResults).toContain('[1] ### [Segment from: Note 1 (Part 1)]');
    expect(result.current.retrieverResults?.formattedResults).toContain('Content of segment:\nThis is the content of chunk 1.');
    expect(result.current.retrieverResults?.formattedResults).toContain('[2] ### [Segment from: Note 2 (Part 2)]');
    expect(result.current.retrieverResults?.formattedResults).toContain('Content of segment:\nThis is the content of chunk 2.');
  });

  it('should handle search with no results', async () => {
    const { result } = renderHook(() => useRetriever());
    const query = 'no results query';

    // @ts-ignore
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      if (message.type === ChannelNames.SEARCH_NOTES_REQUEST) {
        callback({ success: true, results: [] });
      }
    });

    await act(async () => {
      await result.current.retrieve(query);
    });

    await waitFor(() => {
      expect(result.current.isRetrieving).toBe(false);
    });

    expect(result.current.retrieverResults?.query).toBe(query);
    expect(result.current.retrieverResults?.results).toEqual([]);
    expect(result.current.retrieverResults?.formattedResults).toContain('No relevant segments found');
  });

  it('should handle search failure from background script', async () => {
    const { result } = renderHook(() => useRetriever());
    const query = 'error query';
    const errorMessage = 'Something went wrong';

    // @ts-ignore
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      if (message.type === ChannelNames.SEARCH_NOTES_REQUEST) {
        callback({ success: false, error: errorMessage });
      }
    });

    await act(async () => {
      await result.current.retrieve(query);
    });

    await waitFor(() => {
      expect(result.current.isRetrieving).toBe(false);
    });

    expect(result.current.retrieverResults?.query).toBe(query);
    expect(result.current.retrieverResults?.results).toEqual([]);
    expect(result.current.retrieverResults?.formattedResults).toContain(`Error performing search for "${query}": ${errorMessage}`);
  });

  it('should handle chrome.runtime.lastError', async () => {
    const { result } = renderHook(() => useRetriever());
    const query = 'lastError query';
    const errorMessage = 'Runtime error';

    // @ts-ignore
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      // @ts-ignore
      chrome.runtime.lastError = { message: errorMessage };
      callback(undefined); // No response is sent when lastError is set
    });

    await act(async () => {
      await result.current.retrieve(query);
    });

    await waitFor(() => {
      expect(result.current.isRetrieving).toBe(false);
    });

    expect(result.current.retrieverResults?.query).toBe(query);
    expect(result.current.retrieverResults?.results).toEqual([]);
    expect(result.current.retrieverResults?.formattedResults).toContain(`Error performing search for "${query}": ${errorMessage}`);
  });

  it('should clear retriever results', async () => {
    const { result } = renderHook(() => useRetriever());
    const query = 'test query';

    // @ts-ignore
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      callback({ success: true, results: mockSearchResults });
    });

    await act(async () => {
      await result.current.retrieve(query);
    });

    await waitFor(() => {
      expect(result.current.retrieverResults).not.toBeNull();
    });

    act(() => {
      result.current.clearRetrieverResults();
    });

    expect(result.current.retrieverResults).toBeNull();
  });
});
