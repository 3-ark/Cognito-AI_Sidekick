import { useCallback } from 'react';
import { useConfig } from '../ConfigContext';
import { toast } from 'react-hot-toast';
import { saveNoteInSystem } from 'src/background/noteStorage';
import { scrapeUrlContent } from '../utils/scrapers';

interface SaveNoteArgs {
  content: string;
  title?: string;
  tags?: string[] | string;
}

interface UpdateMemoryArgs {
  summary: string;
}

interface FetcherArgs {
  url: string;
}

export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  tool_call_id: string;
  role: 'tool';
  name: string;
  content: string;
}

interface ToolParameterProperty {
  type: string;
  description: string;
  enum?: string[];
  items?: { type: string; };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      structure?: string;
      properties: {
        [key: string]: ToolParameterProperty;
      };
      required?: string[];
    };
  };
}

export const extractAndParseJsonArguments = (argsString: string): any => {
  try {
    return JSON.parse(argsString);
  } catch (e) {
  }

  const jsonFenceMatch = argsString.match(/```json\n([\s\S]*?)\n```/);
  if (jsonFenceMatch && jsonFenceMatch[1]) {
    try {
      return JSON.parse(jsonFenceMatch[1]);
    } catch (e) {
    }
  }

  const genericFenceMatch = argsString.match(/```\n([\s\S]*?)\n```/);
  if (genericFenceMatch && genericFenceMatch[1]) {
    try {
      return JSON.parse(genericFenceMatch[1]);
    } catch (e) {
    }
  }

  const firstBrace = argsString.indexOf('{');
  const lastBrace = argsString.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const potentialJson = argsString.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(potentialJson);
    } catch (e) {
      console.warn('Failed to parse extracted JSON-like string:', potentialJson, e);
    }
  }

  throw new Error('Failed to parse arguments string as JSON after multiple attempts.');
};

export const useTools = () => {
  const { config, updateConfig } = useConfig();

  const saveNote = useCallback(async (args: SaveNoteArgs): Promise<{ success: boolean; message: string }> => {
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

    try {
      const timestamp = new Date().toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const finalTitle = title?.trim() || `Note from AI - ${timestamp}`;
      await saveNoteInSystem({ title: finalTitle, content: content, tags: parsedTags });
      const msg = 'Note saved to system successfully!';
      toast.success(msg);
      return { success: true, message: msg };
    } catch (error) {
      console.error('Error saving note from LLM:', error);
      const msg = 'Failed to save note to system.';
      toast.error(msg);
      return { success: false, message: msg };
    }
  }, []);

  const updateMemory = useCallback((args: UpdateMemoryArgs): { success: boolean; message: string } => {
    const { summary } = args;

    if (!summary || summary.trim() === '') {
      const msg = 'Memory summary cannot be empty.';
      toast.error(msg);
      return { success: false, message: msg };
    }

    try {
      const today = new Date().toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
      const memoryEntry = `${summary.trim()} (on ${today})`;

      const currentNote = config.noteContent || '';
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
  }, [config.noteContent, updateConfig]);

  const toolDefinitions: ToolDefinition[] = [
    {
      type: 'function',
      function: {
        name: 'saveNote',
        description: 'Saves a new note to the user\'s persistent note system. Use this when the user wants to record information, decisions, or create a new structured note.',
        parameters: {
          type: 'object',
          structure: 'markdown',
          properties: {
            content: {
              type: 'string',
              description: 'The main content of the note. This is mandatory.',
            },
            title: {
              type: 'string',
              description: 'An optional title for the note. If not provided, a default title will be generated.',
            },
            tags: {
              type: 'array',
              description: 'An optional list of tags (strings) to categorize the note.',
              items: {
                type: 'string'
              }
            },
          },
          required: ['content'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'fetcher',
        description: 'Fetches the main textual content of a given URL. Use this to get the content of a webpage.',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL of the webpage to fetch and extract content from.',
            },
          },
          required: ['url'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'updateMemory',
        description: 'Appends a short summary or key piece of information to a special "memory" note in the popover. Use this to remember user preferences, facts about the user, or important context from the conversation for future reference within the current session or for the user to see in their popover note.',
        parameters: {
          type: 'object',
          properties: {
            summary: {
              type: 'string',
              description: 'The concise summary or piece of information to add to the memory. For example, "User is 30yo, he is building an extension".',
            },
          },
          required: ['summary'],
        },
      },
    },
  ];

  const executeToolCall = async (
    llmToolCall: LLMToolCall | { name: string; arguments: string; id?: string }
  ): Promise<{ toolCallId?: string; name: string; result: string }> => {
    let toolName: string;
    let rawArguments: string;
    let toolCallId: string | undefined;

    if ('function' in llmToolCall) {
        toolName = llmToolCall.function.name;
        rawArguments = llmToolCall.function.arguments;
        toolCallId = (llmToolCall as any).id;
    } else {
        toolName = llmToolCall.name;
        rawArguments = llmToolCall.arguments;
        toolCallId = (llmToolCall as any).id;
    }

    try {
      const args = extractAndParseJsonArguments(rawArguments);
      if (toolName === 'saveNote') {
        const { success, message } = await saveNote(args as SaveNoteArgs);
        return { toolCallId, name: toolName, result: message };
      } else if (toolName === 'updateMemory') {
        const { success, message } = updateMemory(args as UpdateMemoryArgs);
        return { toolCallId, name: toolName, result: message };
      } else if (toolName === 'fetcher') {
        const result = await scrapeUrlContent((args as FetcherArgs).url);
        return { toolCallId, name: toolName, result };
      } else {
        return { toolCallId, name: toolName, result: `Error: Unknown tool '${toolName}'` };
      }
    } catch (error: any) {
      console.error(`Error executing tool ${toolName}:`, error);
      if (toolName === 'fetcher' && typeof error === 'string' && error.startsWith('[Error scraping URL:')) {
        return { toolCallId, name: toolName, result: error };
      }
      return { toolCallId, name: toolName, result: `Error parsing arguments or executing tool ${toolName}: ${error.message}` };
    }
  };

  return { saveNote, updateMemory, toolDefinitions, executeToolCall };
};
