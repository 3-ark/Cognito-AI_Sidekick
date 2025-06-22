// src/sidePanel/hooks/toolExecutors.ts

import { toast } from 'react-hot-toast';
import { saveNoteInSystem } from 'src/background/noteStorage';
import { scrapeUrlContent } from '../utils/scrapers';
import { Config } from '../../types/config'; // Corrected path for Config
import { saveNoteInSystem } from 'src/background/noteStorage';
import { toast } from 'react-hot-toast';

// Define UpdateConfig locally as its definition is simple and tied to how useConfig provides it
export type UpdateConfig = (newConfig: Partial<Config>) => void;

export interface SaveNoteArgs {
  content: string;
  title?: string;
  tags?: string[] | string;
}

export interface UpdateMemoryArgs {
  summary: string;
}

export interface FetcherArgs {
  url: string;
}

export const executeSaveNote = async (
  args: SaveNoteArgs
): Promise<{ success: boolean; message: string }> => {
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
      .map((tag: string) => String(tag).trim())
      .filter((tag) => tag.length > 0);
  }

  try {
    const timestamp = new Date().toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const finalTitle = title?.trim() || `Note from AI - ${timestamp}`;
    await saveNoteInSystem({
      title: finalTitle,
      content: content,
      tags: parsedTags,
    });
    const msg = 'Note saved to system successfully!';
    toast.success(msg);
    return { success: true, message: msg };
  } catch (error) {
    console.error('Error saving note from LLM:', error);
    const msg = 'Failed to save note to system.';
    toast.error(msg);
    return { success: false, message: msg };
  }
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
