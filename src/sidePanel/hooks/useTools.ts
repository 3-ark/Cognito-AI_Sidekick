import { useCallback } from 'react';
import { useConfig } from '../ConfigContext';
import { toolDefinitions, ToolDefinition } from './toolDefinitions';
import {
  executeSaveNote,
  executeUpdateMemory,
  executeFetcher,
  executeWebSearch,
  SaveNoteArgs,
  UpdateMemoryArgs,
  FetcherArgs,
  WebSearchArgs,
  executePromptOptimizer,
  PromptOptimizerArgs,
  executeRetriever,
  RetrieverArgs,
  executePlanner,
  PlannerArgs,
  executeExecutor,
  ExecutorArgs,
  executeSmartDispatcher,
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

// Helper function to parse arguments
export const extractAndParseJsonArguments = (argsString: string): any => {
  const strategies = [
    // Strategy 1: Look for JSON within <tool_call> ... </tool_call> tags first.
    // This is the most reliable signal for a tool call from many models.
    (s: string) => {
      const match = s.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
      if (match && match[1]) {
        try {
          // We found the official tool call, parse the JSON inside it.
          return JSON.parse(match[1].trim());
        } catch (e) {
          return null;
        }
      }
      return null;
    },
    // Strategy 2: Look for JSON within ```json ... ``` fences.
    (s: string) => {
      const match = s.match(/```json\n([\s\S]*?)\n```/);
      if (match && match[1]) {
        try {
          return JSON.parse(match[1]);
        } catch (e) {
          return null;
        }
      }
      return null;
    },
    // Strategy 3: Try to parse the entire string as JSON.
    // This works for clean outputs that are just a single JSON object.
    (s: string) => {
      try {
        return JSON.parse(s);
      } catch (e) {
        return null;
      }
    },
    // Strategy 4: Find the first and last brace and try to parse the content.
    // This is a robust fallback for malformed outputs that still contain a JSON object.
    (s: string) => {
      const firstBrace = s.indexOf('{');
      const lastBrace = s.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        const potentialJson = s.substring(firstBrace, lastBrace + 1);
        try {
          return JSON.parse(potentialJson);
        } catch (e) {
          // If this fails, it might be because it captured both JSON objects.
          // We can ignore this error and let other strategies work.
          return null;
        }
      }
      return null;
    }
  ];

  for (const strategy of strategies) {
    const parsedJson = strategy(argsString);
    if (parsedJson) {
      // **CRITICAL FIX**: After parsing, check if the arguments are nested.
      // This handles both {"tool_arguments": {...}} and {"arguments": {...}} formats.
      if (parsedJson.tool_arguments !== undefined) {
        return parsedJson.tool_arguments;
      }
      if (parsedJson.arguments !== undefined) {
        return parsedJson.arguments;
      }
      // If no wrapper key is found, assume the parsed object itself is the arguments.
      return parsedJson;
    }
  }

  throw new Error('Failed to parse arguments string as JSON after multiple attempts.');
};

export const useTools = () => {
  const { config, updateConfig } = useConfig();

  const executeToolCall = useCallback(
    async (
      llmToolCall: LLMToolCall | { name: string; arguments: string; id?: string }
    ): Promise<{ toolCallId?: string; name: string; result: string; toolName: string }> => {
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

        if (toolName === 'save_note') {
          const { message } = await executeSaveNote(args as SaveNoteArgs);
          return { toolCallId, name: toolName, result: message, toolName };
        } else if (toolName === 'update_memory') {
          const { message } = executeUpdateMemory(
            args as UpdateMemoryArgs,
            config.noteContent,
            updateConfig
          );
          return { toolCallId, name: toolName, result: message, toolName };
        } else if (toolName === 'fetcher') {
          const result = await executeFetcher(args as FetcherArgs);
          return { toolCallId, name: toolName, result, toolName };
        } else if (toolName === 'web_search') {
          const result = await executeWebSearch(args as WebSearchArgs, config);
          return { toolCallId, name: toolName, result, toolName };
        } else if (toolName === 'prompt_optimizer') {
          const result = await executePromptOptimizer(args as PromptOptimizerArgs, config);
          return { toolCallId, name: toolName, result, toolName };
        } else if (toolName === 'retriever') {
          const result = await executeRetriever(args as RetrieverArgs, config);
          return { toolCallId, name: toolName, result, toolName };
        } else if (toolName === 'planner') {
          const result = await executePlanner(args as PlannerArgs, config);
          return { toolCallId, name: toolName, result, toolName };
        } else if (toolName === 'executor') {
          const result = await executeExecutor(args as ExecutorArgs,
            executeToolCall as (toolCall: { id: string; name: string; arguments: string }) => Promise<{
              toolCallId: string; name: string; result: string;
            }>
          );
          return { toolCallId, name: toolName, result, toolName };
        } else if (toolName === 'smart_dispatcher') {
          const task = args.task || '';
          const result = await executeSmartDispatcher({ task }, config, executeToolCall as any);
          return { toolCallId, name: toolName, result, toolName };
        } else {
          console.error(`Error: Unknown tool '${toolName}'`);
          return { toolCallId, name: toolName, result: `Error: Unknown tool '${toolName}'`, toolName };
        }
      } catch (error: any) {
        console.error(`Error executing tool ${toolName}:`, error);
        if (toolName === 'fetcher' && typeof error === 'string' && error.startsWith('[Error scraping URL:')) {
            return { toolCallId, name: toolName, result: error, toolName };
        }
        return {
          toolCallId,
          name: toolName,
          result: `Error parsing arguments or executing tool ${toolName}: ${error.message || 'Unknown error'}`,
          toolName,
        };
      }
    },
    [config, updateConfig]
  );

  return { toolDefinitions, executeToolCall };
};
