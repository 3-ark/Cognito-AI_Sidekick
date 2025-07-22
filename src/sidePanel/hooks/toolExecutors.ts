import { toast } from 'react-hot-toast';
import { webSearch } from '../network';
import { scrapeUrlContent } from '../utils/scrapers';
import { Config } from '../../types/config'; // Corrected path for Config
import ChannelNames from '../../types/ChannelNames';
import { searchSimilar } from '../../background/semanticSearchUtils';

// Define UpdateConfig locally as its definition is simple and tied to how useConfig provides it
export type UpdateConfig = (newConfig: Partial<Config>) => void;

export interface SaveNoteArgs {
  content: string;
  title?: string;
  tags?: string[] | string;
  // id and url are optional for new notes created by LLM
  id?: string;
  url?: string;
}

export interface UpdateMemoryArgs {
  summary: string;
}

export interface FetcherArgs {
  url: string;
}

export interface WebSearchArgs {
  query: string;
  engine?: 'Google' | 'DuckDuckGo' | 'Brave' | 'Wikipedia';
}

export interface RetrieverArgs {
  query: string;
}

import { generateEmbeddings } from '../../background/embeddingUtils';
import { findSimilarChunks } from '../../background/semanticSearchUtils';
import { prompt } from '../../background/prompt';

export interface PromptOptimizerArgs {
  prompt: string;
}

export interface PlannerArgs {
  task: string;
}

export const executePromptOptimizer = async (
  args: PromptOptimizerArgs,
  config: Config
): Promise<string> => {
  const { prompt: userPrompt } = args;
  if (!userPrompt || userPrompt.trim() === '') {
    return 'Error: Prompt cannot be empty for prompt_optimizer.';
  }

  try {
    const optimizedPrompt = await prompt(
      `Optimize the following prompt for a large language model. The optimized prompt should be clear, concise, and effective.

Original prompt: "${userPrompt}"

Optimized prompt:`
    );
    return optimizedPrompt;
  } catch (error: any) {
    console.error(`Error executing prompt_optimizer for prompt "${userPrompt}":`, error);
    return `Error optimizing prompt: ${error.message || 'Unknown error'}`;
  }
};

export interface ExecutorArgs {
  plan: string;
}

export const executePlanner = async (
  args: PlannerArgs,
  config: Config
): Promise<string> => {
  const { task } = args;
  if (!task || task.trim() === '') {
    return 'Error: Task cannot be empty for planner.';
  }

  try {
    const plan = await prompt(
      `Create a step-by-step plan to accomplish the following task: "${task}". The plan should be a numbered list of actions.`
    );
    return plan;
  } catch (error: any) {
    console.error(`Error executing planner for task "${task}":`, error);
    return `Error creating plan: ${error.message || 'Unknown error'}`;
  }
};

export const executeExecutor = async (
  args: ExecutorArgs,
  executeToolCall: (toolCall: {
    id: string;
    name: string;
    arguments: string;
  }) => Promise<{
    toolCallId: string;
    name: string;
    result: string;
  }>
): Promise<string> => {
  const { plan } = args;
  if (!plan || plan.trim() === '') {
    return 'Error: Plan cannot be empty for executor.';
  }

  try {
    const steps = plan.split('\n').filter((step) => step.trim() !== '');
    let result = '';
    for (const step of steps) {
      const toolCallMatch = step.match(/(\w+)\((.*)\)/);
      if (toolCallMatch) {
        const toolName = toolCallMatch[1];
        const toolArgs = toolCallMatch[2];
        const toolCallId = `executor_${toolName}_${Date.now()}`;
        const executionResult = await executeToolCall({
          id: toolCallId,
          name: toolName,
          arguments: toolArgs,
        });
        result += `${executionResult.name}: ${executionResult.result}\n`;
      }
    }
    return result;
  } catch (error: any) {
    console.error(`Error executing executor for plan "${plan}":`, error);
    return `Error executing plan: ${error.message || 'Unknown error'}`;
  }
};

export const executeRetriever = async (
  args: RetrieverArgs,
  config: Config
): Promise<string> => {
  const { query } = args;
  if (!query || query.trim() === '') {
    return 'Error: Query cannot be empty for retriever.';
  }

  try {
    const queryEmbedding = await generateEmbeddings([query]);
    const searchResults = await findSimilarChunks(
      queryEmbedding[0],
      config.rag.numResults,
      config.rag.semanticThreshold
    );
    return JSON.stringify(searchResults);
  } catch (error: any) {
    console.error(`Error executing retriever for query "${query}":`, error);
    return `Error performing retrieval: ${error.message || 'Unknown error'}`;
  }
};

export const executeWebSearch = async (
  args: WebSearchArgs,
  config: Config
): Promise<string> => {
  const { query, engine = 'Google' } = args;
  if (!query || query.trim() === '') {
    return 'Error: Query cannot be empty for web search.';
  }

  // Create a temporary config for this specific search operation
  const searchConfig: Config = {
    ...config,
    webMode: engine,
  };

  try {
    const searchResults = await webSearch(query, searchConfig);
    return searchResults;
  } catch (error: any) {
    console.error(
      `Error executing web_search for query "${query}" with engine ${engine}:`,
      error
    );
    return `Error performing web search: ${error.message || 'Unknown error'}`;
  }
};

export const executeSaveNote = async (
  args: SaveNoteArgs
): Promise<{ success: boolean; message: string; noteId?: string }> => {
  const { content, title } = args;
  const llmTagsInput = args.tags;

  if (!content || content.trim() === '') {
    const msg = 'Note content cannot be empty for saving to system.';
    toast.error(msg);
    return { success: false, message: msg };
  }

  let parsedTags: string[] = [];
  if (typeof llmTagsInput === 'string') {
    parsedTags = llmTagsInput
      .split(',')
      .map((tag: string) => tag.trim())
      .filter((tag) => tag.length > 0);
  } else if (Array.isArray(llmTagsInput)) {
    parsedTags = llmTagsInput
      .map((tag: any) => String(tag).trim()) // Ensure tag is string before trim
      .filter((tag) => tag.length > 0);
  }

  const timestamp = new Date().toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const finalTitle = title?.trim() || `Note from AI - ${timestamp}`;

  const noteToSave = {
    // id will be generated by saveNoteInSystem if not provided or if it's a new note.
    // For LLM creating a new note, id should typically be undefined.
    // If LLM intends to update an existing note, it *could* provide an id,
    // though current tool definition for save_note seems geared towards new notes.
    id: args.id, 
    title: finalTitle,
    content: content,
    tags: parsedTags,
    url: args.url, // Allow LLM to specify a URL if relevant
  };

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: ChannelNames.SAVE_NOTE_REQUEST,
        payload: noteToSave,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending SAVE_NOTE_REQUEST from toolExecutor:', chrome.runtime.lastError.message);
          const msg = 'Failed to save note: Communication error with background script.';
          toast.error(msg);
          resolve({ success: false, message: msg });
        } else if (response && response.success && response.note) {
          const msg = 'Note saved to system successfully by tool!';
          toast.success(msg);
          resolve({ success: true, message: msg, noteId: response.note.id });
        } else {
          const errorMsg = response?.error || 'Unknown error saving note via background script.';
          const warningMsg = response?.warning || null;
          console.error('Failed to save note via background script from tool:', errorMsg, warningMsg ? `Warning: ${warningMsg}` : '');
          const displayMsg = `Failed to save note: ${errorMsg}${warningMsg ? ` (${warningMsg})` : ''}`;
          toast.error(displayMsg);
          resolve({ success: false, message: displayMsg });
        }
      }
    );
  });
};

export const executeUpdateMemory = (
  args: UpdateMemoryArgs,
  currentNoteContent: string | undefined, // Passed from useTools
  updateConfig: UpdateConfig // Passed from useTools
): { success: boolean; message: string } => {
  const { summary } = args;

  if (!summary || summary.trim() === '') {
    const msg = 'Memory summary cannot be empty.';
    toast.error(msg);
    return { success: false, message: msg };
  }

  try {
    const today = new Date().toLocaleDateString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const memoryEntry = `${summary.trim()} (on ${today})`;

    const separator = currentNoteContent && memoryEntry ? '\n\n' : '';
    const newNoteContent = (currentNoteContent || '') + separator + memoryEntry;

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

export const executeFetcher = async (args: FetcherArgs): Promise<string> => {
  try {
    const content = await scrapeUrlContent(args.url);
    return content;
  } catch (error: any) {
    console.error(`Error executing fetcher for URL ${args.url}:`, error);
    // Rethrow or return a specific error message string
    if (typeof error === 'string' && error.startsWith('[Error scraping URL:')) {
        return error;
    }
    return `Error fetching content for ${args.url}: ${error.message || 'Unknown error'}`;
  }
};
