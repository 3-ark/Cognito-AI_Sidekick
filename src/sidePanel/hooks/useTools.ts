import { useCallback } from 'react';

import type {
 FetcherArgs,LLMToolCall, OpenTabArgs, SaveNoteArgs, UpdateMemoryArgs,
} from '../../types/toolTypes';
import { useConfig } from '../ConfigContext';

import { toolDefinitions } from './toolDefinitions';
import {
  executeExecutor,
  executeFetch,
  executeBrowsePage,
  executeOpenTab,
  executePlanner,
  executePromptOptimizer,
  executeSaveNote,
  executeUpdateMemory,
  executeWebSearch,
  extractAndParseJsonArguments,
} from './toolExecutors';

export { toolDefinitions };

export const useTools = () => {
  const { config, updateConfig } = useConfig();

  const executeToolCall = useCallback(async (
    llmToolCall: LLMToolCall | { name: string; arguments: string; id?: string },
  ): Promise<{ toolCallId?: string; name: string; result: string }> => {
    let toolName: string;
    let rawArguments: string;
    let toolCallId: string | undefined;

    if ('function' in llmToolCall) {
      toolName = llmToolCall.function.name;
      rawArguments = llmToolCall.function.arguments;
      toolCallId = llmToolCall.id;
    } else {
      toolName = llmToolCall.name;
      rawArguments = llmToolCall.arguments;
      toolCallId = llmToolCall.id;
    }

    let args;
    try {
      args = extractAndParseJsonArguments(rawArguments);
    } catch (error: any) {
      console.error(`Error parsing arguments for tool ${toolName}:`, error);
      return {
        toolCallId,
        name: toolName,
        result: `Error: Could not parse arguments for tool ${toolName}. Please ensure the arguments are valid JSON. Error details: ${error.message}`,
      };
    }

    try {
      switch (toolName) {
        case 'note.save': {
          const { message } = await executeSaveNote(args as SaveNoteArgs);
          return { toolCallId, name: toolName, result: message };
        }
        case 'memory.update': {
          const { message } = executeUpdateMemory(args as UpdateMemoryArgs, config.noteContent, updateConfig);
          return { toolCallId, name: toolName, result: message };
        }
        case 'fetcher': {
          const result = await executeFetch(args as FetcherArgs);
          return { toolCallId, name: toolName, result };
        }
        case 'web_search': {
          const result = await executeWebSearch(args as any, config);
          return { toolCallId, name: toolName, result: result };
        }
        case 'prompt_optimizer': {
          const { message } = await executePromptOptimizer(args);
          return { toolCallId, name: toolName, result: message };
        }
        case 'planner': {
          const { message } = await executePlanner(args);
          return { toolCallId, name: toolName, result: message };
        }
        case 'executor': {
          const { message } = await executeExecutor(args);
          return { toolCallId, name: toolName, result: message };
        }
        case 'open_tab': {
          const { message } = await executeOpenTab(args as OpenTabArgs);
          return { toolCallId, name: toolName, result: message };
        }
        case 'browse_page': {
          const result = await executeBrowsePage(args as { url: string });
          return { toolCallId, name: toolName, result };
        }
        default:
          return { toolCallId, name: toolName, result: `Error: Unknown tool '${toolName}'` };
      }
    } catch (error: any) {
      console.error(`Error executing tool ${toolName}:`, error);
      if (toolName === 'fetcher' && typeof error === 'string' && error.startsWith('[Error scraping URL:')) {
        return { toolCallId, name: toolName, result: error };
      }
      return { toolCallId, name: toolName, result: `Error executing tool ${toolName}: ${error.message}` };
    }
  }, [config, updateConfig]);

  // The hook now only returns executeToolCall and toolDefinitions (via re-export)
  // Individual tool functions like saveNote, updateMemory are no longer returned directly from this hook
  return { executeToolCall, toolDefinitions };
};
