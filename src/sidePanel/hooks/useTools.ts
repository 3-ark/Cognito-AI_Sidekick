import { useCallback } from 'react';
import { useConfig } from '../ConfigContext';
import { toolDefinitions } from './toolDefinitions';
import {
  executeSaveNote,
  executeUpdateMemory,
  executeFetcher,
  executeWebSearch,
  SaveNoteArgs,
  UpdateMemoryArgs,
  FetcherArgs,
  WebSearchArgs,
  WikipediaSearchArgs,
  executePromptOptimizer,
  PromptOptimizerArgs,
  executeRetriever,
  RetrieverArgs,
  executePlanner,
  PlannerArgs,
  executeExecutor,
  ExecutorArgs,
  executeSmartDispatcher,
  executeWikipediaSearch,
} from './toolExecutors';

import { v4 as uuidv4 } from 'uuid'; 

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

export const extractAndParseJsonArguments = (argsString: string): any => {
  const strategies = [
    (s: string) => {
      const match = s.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
      if (match && match[1]) { try { return JSON.parse(match[1].trim()); } catch (e) { return null; } }
      return null;
    },
    (s: string) => {
      const match = s.match(/```json\n([\s\S]*?)\n```/);
      if (match && match[1]) { try { return JSON.parse(match[1]); } catch (e) { return null; } }
      return null;
    },
    (s: string) => {
      try { return JSON.parse(s); } catch (e) { return null; }
    },
    (s: string) => {
      const firstBrace = s.indexOf('{');
      const lastBrace = s.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const potentialJson = s.substring(firstBrace, lastBrace + 1);
        try { return JSON.parse(potentialJson); } catch (e) { return null; }
      }
      return null;
    }
  ];

  for (const strategy of strategies) {
    const parsedJson = strategy(argsString);
    if (parsedJson) {
      if (parsedJson.tool_arguments !== undefined) return parsedJson.tool_arguments;
      if (parsedJson.arguments !== undefined) return parsedJson.arguments;
      return parsedJson;
    }
  }
  throw new Error('Failed to parse arguments string as JSON after multiple attempts.');
};

// **FIX:** Define the internal executor's signature to strictly require `id: string`
// and return `toolCallId: string`, as indicated by the error message.
type InternalToolExecutor = (toolCall: {
  name: string;
  arguments: string;
  id: string;
}) => Promise<{ toolCallId: string; name: string; result: string }>; // Now mandatory string


export const useTools = () => {
  const { config, updateConfig } = useConfig();

  // This function handles the actual execution and is passed recursively.
  // Its type is now strictly `InternalToolExecutor`.
  const internalExecuteTool = useCallback<InternalToolExecutor>(
    async (toolCall) => {
      // Destructure with guaranteed string for toolCallId
      const { name: toolName, arguments: rawArguments, id: toolCallId } = toolCall;

      try {
        const args = extractAndParseJsonArguments(rawArguments);
        let result: string;

        switch (toolName) {
          case 'save_note':
            result = (await executeSaveNote(args as SaveNoteArgs)).message;
            break;
          case 'update_memory':
            result = executeUpdateMemory(args as UpdateMemoryArgs, config.noteContent, updateConfig).message;
            break;
          case 'fetcher':
            result = await executeFetcher(args as FetcherArgs);
            break;
          case 'wikipedia_search':
            result = await executeWikipediaSearch(args as WikipediaSearchArgs, config);
            break;
          case 'web_search':
            result = await executeWebSearch(args as WebSearchArgs, config);
            break;
          case 'prompt_optimizer':
            result = await executePromptOptimizer(args as PromptOptimizerArgs, config);
            break;
          case 'retriever':
            result = await executeRetriever(args as RetrieverArgs, config);
            break;
          case 'planner':
            result = await executePlanner(args as PlannerArgs, config);
            break;
          case 'executor':
            result = await executeExecutor(args as ExecutorArgs, internalExecuteTool);
            break;
          case 'smart_dispatcher':
            result = await executeSmartDispatcher({ task: args.task || '' }, config, internalExecuteTool);
            break;
          default:
            console.error(`Error: Unknown tool '${toolName}'`);
            throw new Error(`Unknown tool: ${toolName}`);
        }
        // Return the guaranteed string toolCallId
        return { toolCallId, name: toolName, result };
      } catch (error: any) {
        console.error(`Error executing tool ${toolName}:`, error);
        if (toolName === 'fetcher' && typeof error === 'string' && error.startsWith('[Error scraping URL:')) {
            // Ensure toolCallId is a string even in error case
            return { toolCallId, name: toolName, result: error };
        }
        // Ensure toolCallId is a string even in error case
        return {
          toolCallId,
          name: toolName,
          result: `Error parsing arguments or executing tool ${toolName}: ${error.message || 'Unknown error'}`,
        };
      }
    },
    [config, updateConfig]
  );

  // This is the public-facing function returned by the hook.
  // It acts as an adapter, ensuring the internal executor always receives a string ID.
  const executeToolCall = useCallback(
    async (llmToolCall: LLMToolCall | { name: string; arguments: string; id?: string }) => {
      const toolName = 'function' in llmToolCall ? llmToolCall.function.name : llmToolCall.name;
      const rawArguments = 'function' in llmToolCall ? llmToolCall.function.arguments : llmToolCall.arguments;
      
      // **FIX:** Ensure `toolCallId` is always a `string` before passing to `internalExecuteTool`.
      // If `llmToolCall.id` is undefined (e.g., for a direct UI call), generate a UUID.
      const toolCallId = 'function' in llmToolCall ? llmToolCall.id : (llmToolCall.id || uuidv4());

      return internalExecuteTool({ name: toolName, arguments: rawArguments, id: toolCallId });
    },
    [internalExecuteTool]
  );

  return { toolDefinitions, executeToolCall };
};