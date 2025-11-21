import { toast } from 'react-hot-toast';

import type { Config } from 'src/types/config';
import ChannelNames from '../../types/ChannelNames';
import type {
 FetcherArgs, OpenTabArgs, SaveNoteArgs, UpdateMemoryArgs, WebSearchArgs,
} from '../../types/toolTypes';
import { webSearch } from '../network';
import { scrapeUrlContent } from '../utils/scrapers';
import { executeExecutor, executePlanner, executePromptOptimizer } from './subToolExecutors';

export { executeExecutor, executePlanner, executePromptOptimizer };

export const extractAndParseJsonArguments = (argsString: string): any => {
  try {
    return JSON.parse(argsString);
  } catch (e) {
    console.warn('Attempt 1: Failed to parse argsString directly. It may not be a valid JSON string.', e);
  }

  const jsonFenceMatch = argsString.match(/```json\n([\s\S]*?)\n```/);

  if (jsonFenceMatch && jsonFenceMatch[1]) {
    try {
      return JSON.parse(jsonFenceMatch[1]);
    } catch (e) {
      console.warn('Attempt 2: Failed to parse content within json code fence.', e);
    }
  }

  const genericFenceMatch = argsString.match(/```\n([\s\S]*?)\n```/);

  if (genericFenceMatch && genericFenceMatch[1]) {
    try {
      return JSON.parse(genericFenceMatch[1]);
    } catch (e) {
      console.warn('Attempt 3: Failed to parse content within generic code fence.', e);
    }
  }

  const firstBrace = argsString.indexOf('{');
  const lastBrace = argsString.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    let potentialJson = argsString.substring(firstBrace, lastBrace + 1);

    try {
      return JSON.parse(potentialJson);
    } catch (e) {
      console.warn('Initial JSON parse failed, attempting to fix:', e);

      potentialJson = potentialJson
        .replace(/([{,])\s*([^"{}\s:,]+)\s*:/g, '$1 "$2":')
        .replace(/'/g, '"');

      try {
        return JSON.parse(potentialJson);
      } catch (e) {
        console.error('Failed to parse even after fixing potential issues:', potentialJson, e);
        throw new Error(`Failed to parse extracted JSON-like string: "${potentialJson}". This could be due to syntax errors like missing quotes, invalid characters, or incorrect formatting. Check the LLM's output to ensure it's valid JSON.`);
      }
    }
  }

  throw new Error('Failed to parse arguments string as JSON after multiple attempts.');
};

export const executeSaveNote = async (args: SaveNoteArgs): Promise<{ success: boolean; message: string; note?: any }> => {
  const { content, title } = args;
  const llmTagsInput = args.tags;

  if (!content || content.trim() === '') {
    const msg = 'Note content cannot be empty for saving to system.';

    toast.error(msg);

    return { success: false, message: msg };
  }

  let parsedTags: string[] = [];

  if (typeof llmTagsInput === 'string') {
    parsedTags = llmTagsInput.split(',').map((tag: string) => tag.trim()).filter(tag => tag.length > 0);
  } else if (Array.isArray(llmTagsInput)) {
    parsedTags = llmTagsInput.map((tag: string) => String(tag).trim()).filter(tag => tag.length > 0);
  }

  const timestamp = new Date().toLocaleString([], {
 year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', 
});
  const finalTitle = title?.trim() || `Note from AI - ${timestamp}`;
  
  const noteToSave = {
    title: finalTitle,
    content: content,
    tags: parsedTags,

    // id, createdAt, lastUpdatedAt will be handled by the background script or saveNoteInSystem
  };

  return new Promise(resolve => {
    chrome.runtime.sendMessage(
      {
        type: ChannelNames.SAVE_NOTE_REQUEST,
        payload: noteToSave,
      },
      response => {
        if (chrome.runtime.lastError) {
          console.error('Error sending SAVE_NOTE_REQUEST:', chrome.runtime.lastError.message);
          const msg = 'Failed to save note: Communication error.';

          toast.error(msg);
          resolve({ success: false, message: msg });

          return;
        }

        if (response && response.success) {
          const msg = 'Note saved to system successfully!';

          toast.success(msg);
          resolve({
 success: true, message: msg, note: response.note, 
});
        } else {
          console.error('Failed to save note, background error:', response?.error);
          const msg = `Failed to save note: ${response?.error || 'Unknown error'}`;

          toast.error(msg);
          resolve({ success: false, message: msg });
        }
      },
    );
  });
};

export const executeBrowsePage = (args: { url: string }): Promise<string> => {
  const { url } = args;
  if (!url) {
    return Promise.resolve('Error: URL is required to browse a page.');
  }

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: 'BROWSE_PAGE',
        payload: { url },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending BROWSE_PAGE message:', chrome.runtime.lastError.message);
          resolve(`Error: Failed to browse page. Communication error: ${chrome.runtime.lastError.message}`);
          return;
        }
        if (response.success) {
          resolve(response.content);
        } else {
          resolve(`Error: ${response.error}`);
        }
      }
    );
  });
};

export const executeUpdateMemory = (
  args: UpdateMemoryArgs,
  currentNoteContent: string | undefined,
  updateConfig: (newConfig: Partial<Config>) => void,
): { success: boolean; message: string } => {
  const { summary } = args;

  if (!summary || summary.trim() === '') {
    const msg = 'Memory summary cannot be empty.';

    toast.error(msg);

    return { success: false, message: msg };
  }

  try {
    const today = new Date().toLocaleDateString([], {
 year: 'numeric', month: 'short', day: 'numeric', 
});
    const memoryEntry = `${summary.trim()} (on ${today})`;

    const currentNote = currentNoteContent || '';
    const separator = currentNote && memoryEntry ? '\n\n' : '';
    const newNoteContent = currentNote + separator + memoryEntry;

    updateConfig({ noteContent: newNoteContent });
    const msg = 'Memory updated in popover note.';

    toast.success(msg);

    return { success: true, message: msg };
  } catch (error) {
    console.error('Error updating memory in popover note:', error);
    const msg = 'Failed to update memory.';

    toast.error(msg);

    return { success: false, message: msg };
  }
};

export const executeFetch = async (args: FetcherArgs): Promise<string> => {
  return scrapeUrlContent(args.url);
};

export const executeWebSearch = async (args: WebSearchArgs, config: Config): Promise<string> => {
  const configCopy = { ...config };

  if (args.engine) {
    configCopy.webMode = args.engine;
  }

  return webSearch(args.query, configCopy);
};

export const executeOpenTab = (args: OpenTabArgs): Promise<{ success: boolean; message: string }> => {
  const { url } = args;

  if (!url || !url.trim()) {
    const msg = 'URL is required to open a tab.';
    toast.error(msg);
    return Promise.resolve({ success: false, message: msg });
  }

  return new Promise(resolve => {
    chrome.runtime.sendMessage(
      {
        type: ChannelNames.OPEN_TAB,
        payload: { url },
      },
      response => {
        if (chrome.runtime.lastError) {
          console.error('Error sending OPEN_TAB message:', chrome.runtime.lastError.message);
          const msg = 'Failed to open tab: Communication error.';
          toast.error(msg);
          resolve({ success: false, message: msg });
          return;
        }

        if (response && response.success) {
          const msg = `Tab opened with URL: ${url}`;
          toast.success(msg);
          resolve({ success: true, message: msg });
        } else {
          console.error('Failed to open tab, background error:', response?.error);
          const msg = `Failed to open tab: ${response?.error || 'Unknown error'}`;
          toast.error(msg);
          resolve({ success: false, message: msg });
        }
      },
    );
  });
};
