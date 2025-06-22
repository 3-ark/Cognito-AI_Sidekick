// src/sidePanel/hooks/useTools.ts
import { useCallback } from 'react';
import { useConfig } from '../ConfigContext';
import { toolDefinitions, ToolDefinition } from './toolDefinitions';
import {
  executeSaveNote,
  executeUpdateMemory,
  executeFetcher,
  SaveNoteArgs,
  UpdateMemoryArgs,
  FetcherArgs,
} from './toolExecutors';

// Interface for LLM tool calls (remains here as it's part of the execution layer)
export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// Interface for tool results (remains here)
export interface ToolResult {
  tool_call_id: string;
  role: 'tool';
  name: string;
  content: string;
}

// Helper function to parse arguments (remains here)
export const extractAndParseJsonArguments = (argsString: string): any => {
  try {
    return JSON.parse(argsString);
  } catch (e) {
    // Ignore and try next method
  }

  const jsonFenceMatch = argsString.match(/```json\n([\s\S]*?)\n```/);
  if (jsonFenceMatch && jsonFenceMatch[1]) {
    try {
      return JSON.parse(jsonFenceMatch[1]);
    } catch (e) {
      // Ignore and try next method
    }
  }

  const genericFenceMatch = argsString.match(/```\n([\s\S]*?)\n```/);
  if (genericFenceMatch && genericFenceMatch[1]) {
    try {
      return JSON.parse(genericFenceMatch[1]);
    } catch (e) {
      // Ignore and try next method
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

  const executeToolCall = useCallback(
    async (
      llmToolCall: LLMToolCall | { name: string; arguments: string; id?: string }
    ): Promise<{ toolCallId?: string; name: string; result: string }> => {
      let toolName: string;
      let rawArguments: string;
      let toolCallId: string | undefined;

      if ('function' in llmToolCall) {
        toolName = llmToolCall.function.name;
        rawArguments = llmToolCall.function.arguments;
        toolCallId = (llmToolCall as any).id; // Cast to any if id is not always present or type correctly
      } else {
        // Handling for direct call format (e.g. from UI interaction or test)
        toolName = llmToolCall.name;
        rawArguments = llmToolCall.arguments;
        toolCallId = llmToolCall.id;
      }

      try {
        const args = extractAndParseJsonArguments(rawArguments);

        if (toolName === 'note.save') { // Updated name
          const { message } = await executeSaveNote(args as SaveNoteArgs);
          return { toolCallId, name: toolName, result: message };
        } else if (toolName === 'memory.update') { // Updated name
          const { message } = executeUpdateMemory(
            args as UpdateMemoryArgs,
            config.noteContent,
            updateConfig
          );
          return { toolCallId, name: toolName, result: message };
        } else if (toolName === 'fetcher') {
          const result = await executeFetcher(args as FetcherArgs);
          return { toolCallId, name: toolName, result };
        } else {
          console.error(`Error: Unknown tool '${toolName}'`);
          return { toolCallId, name: toolName, result: `Error: Unknown tool '${toolName}'` };
        }
      } catch (error: any) {
        console.error(`Error executing tool ${toolName}:`, error);
        // Specific error handling for fetcher can be kept if desired, or generalized
        if (toolName === 'fetcher' && typeof error === 'string' && error.startsWith('[Error scraping URL:')) {
            return { toolCallId, name: toolName, result: error };
        }
        return {
          toolCallId,
          name: toolName,
          result: `Error parsing arguments or executing tool ${toolName}: ${error.message || 'Unknown error'}`,
        };
      }
    },
    [config.noteContent, updateConfig] // Dependencies for useCallback
  );

  // Expose toolDefinitions directly from the imported module
  return { toolDefinitions, executeToolCall };
};
