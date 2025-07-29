import { toast } from 'react-hot-toast';
import { webSearch } from '../network';
import { scrapeUrlContent } from '../utils/scrapers';
import { Config } from '../../types/config';
import ChannelNames from '../../types/ChannelNames';
import { prompt } from '../../background/prompt';

// Define UpdateConfig locally as its definition is simple and tied to how useConfig provides it
export type UpdateConfig = (newConfig: Partial<Config>) => void;

export interface SaveNoteArgs {
  content: string;
  title?: string;
  tags?: string[] | string;
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
  queries: {
    query: string;
    engine?: 'Google' | 'DuckDuckGo' | 'Brave' | 'GoogleCustomSearch';
  }[];
}

export interface WikipediaSearchArgs {
  query: string;
}

export interface RetrieverArgs {
  query: string;
}

export interface PromptOptimizerArgs {
  prompt: string;
}

export interface PlannerArgs {
  task: string;
  feedback?: string; // Optional feedback for plan improvement
}

export interface SmartDispatcherArgs {
  task: string;
}

export interface ExecutorArgs {
  plan: string;
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

export const executePlanner = async (
  args: PlannerArgs,
  config: Config
): Promise<string> => {
  const { task, feedback } = args;

  const toolSchemas = `
    - "web_search": Searches the web.
      - "tool_arguments": { "queries": [{ "query": "your search query" }] }
    - "wikipedia_search": Searches Wikipedia.
      - "tool_arguments": { "query": "your search query" }
    - "save_note": Saves content to a note.
      - "tool_arguments": { "title": "Note Title", "content": "Note content, can use $context.step_N_result", "tags": ["tag1", "tag2"] }
    - "fetcher": Fetches the raw content of a single URL.
      - "tool_arguments": { "url": "http://example.com" }
    - "retriever": Searches your personal saved notes.
      - "tool_arguments": { "query": "your search query" }
    // Add other tools like prompt_optimizer and update_memory if you want the planner to use them.
  `;

  const feedbackInstruction = feedback 
    ? `\n**IMPORTANT FEEDBACK ON PREVIOUS FAILED PLAN:** ${feedback}\nYou MUST correct the plan based on this feedback.`
    : '';

  const systemPrompt = `You are a meticulous AI planning agent. Your task is to create a step-by-step plan in JSON format to accomplish a user's request.

  **RULES:**
  1.  You MUST ONLY use tools with the exact schemas provided below. Do not invent arguments.
  2.  The output MUST be a single, clean JSON object, without any markdown formatting like \`\`\`json.
  3.  Use placeholders like "$context.step_1_result" to pass the output from one step as an argument to a subsequent step.

  **AVAILABLE TOOLS AND THEIR SCHEMAS:**
  ${toolSchemas}

  **EXAMPLE PLAN:**
  User Task: "Research the pros and cons of GraphQL vs REST and save it in a note."
  Your Output:
  {
    "steps": [
      {
        "tool_name": "wikipedia_search",
        "tool_arguments": {
          "query": "GraphQL" ,
        }
      },
      {
        "tool_name": "wikipedia_search",
        "tool_arguments": {
          "query": "REST APIs" 
        }
      },
      {
        "tool_name": "web_search",
        "tool_arguments": {
          "queries": [
            { "query": "pros and cons of GraphQL" },
            { "query": "pros and cons of REST APIs" }
          ]
        }
      },
      {
        "tool_name": "save_note",
        "tool_arguments": {
          "title": "GraphQL vs REST Comparison",
          "content": "Here is a comparison of GraphQL and REST: $context.step_1_result, $context.step_2_result and $context.step_3_result",
          "tags": ["GraphQL", "API", "REST"]
        }
      }
    ]
  }

  Now, create a plan for the following user task.
  ${feedbackInstruction}`;

  try {
    const rawPlan = await prompt(systemPrompt + `User Task: "${task}"`);
    
    // JSON Parsing
    try {
      // Clean potential markdown fences before parsing
      const cleanJson = rawPlan.replace(/```json\n?|```/g, '').trim();
      const parsedPlan = JSON.parse(cleanJson);
      // Return a non-prettified string for transport efficiency
      return JSON.stringify(parsedPlan); 
    } catch (parseError: any) {
      console.error(`Error: Planner returned invalid JSON for task "${task}". Raw output:`, rawPlan);
      throw new Error(`Planner outputted malformed JSON. Original error: ${parseError.message}`);
    }

  } catch (error: any) {
    console.error(`Error executing planner for task "${task}":`, error);
    return `Error creating plan: ${error.message || 'Unknown error'}`;
  }
};

// Helper function to recursively replace placeholders in an object/array
const replacePlaceholders = (argObject: any, context: Record<string, any>): any => {
  if (typeof argObject === 'string') {
    const match = argObject.match(/^\$context\.(step_\d+_result)$/);
    if (match && Object.prototype.hasOwnProperty.call(context, match[1])) {
      // If the entire string is a placeholder, replace it with the result
      // This handles cases where the result might be an object/array itself
      return context[match[1]];
    } else {
      // Otherwise, do a simple string replacement for partial placeholders
      return argObject.replace(/\$context\.step_\d+_result/g, (placeholder) => {
        const contextKey = placeholder.substring(9); // remove "$context."
        
        // --- START OF FIX ---
        // Check for the key's EXISTENCE, not its truthiness.
        if (Object.prototype.hasOwnProperty.call(context, contextKey)) {
          // If the key exists (even if its value is "" or null), use its value.
          return context[contextKey];
        }
        // Only if the key is truly missing, leave the placeholder.
        return placeholder;
        // --- END OF FIX ---
      });
    }
  }

  if (Array.isArray(argObject)) {
    return argObject.map(item => replacePlaceholders(item, context));
  }

  if (argObject && typeof argObject === 'object') {
    const newObj: Record<string, any> = {};
    for (const key in argObject) {
      if (Object.prototype.hasOwnProperty.call(argObject, key)) {
        newObj[key] = replacePlaceholders(argObject[key], context);
      }
    }
    return newObj;
  }

  return argObject;
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
    const planObject = JSON.parse(plan);
    if (!Array.isArray(planObject.steps)) {
      return 'Error: Invalid plan format. The plan must have a "steps" array.';
    }

    const context: Record<string, any> = {};
    let finalResult = '';

    for (let i = 0; i < planObject.steps.length; i++) {
      const step = planObject.steps[i];
      const { tool_name, tool_arguments } = step;

      if (!tool_name || !tool_arguments) {
        finalResult += `Skipping invalid step: ${JSON.stringify(step)}\n`;
        continue;
      }

      // --- START OF FIX ---
      // Replace placeholders by operating on the JS object, not the JSON string.
      const processedArgsObject = replacePlaceholders(tool_arguments, context);
      const processedArgsString = JSON.stringify(processedArgsObject);
      // --- END OF FIX ---

      const toolCallId = `executor_${tool_name}_${Date.now()}`;
      const executionResult = await executeToolCall({
        id: toolCallId,
        name: tool_name,
        arguments: processedArgsString, // Pass the correctly formatted JSON string
      });

      const contextKey = `step_${i + 1}_result`;
      // Store the raw result. The helper function will handle injection.
      const resultToStore = typeof executionResult.result === 'string' 
        ? executionResult.result
        : JSON.stringify(executionResult.result, null, 2); // Pretty-print objects/arrays
      context[contextKey] = resultToStore;
      finalResult += `${executionResult.name} result for step ${i + 1} stored.\n`;
    }
    // Return the result of the final step, or a summary
    const lastStepKey = `step_${planObject.steps.length}_result`;
    return `Execution finished. Final result:\n${context[lastStepKey] || 'No final result was produced.'}`;
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
    return await new Promise<string>((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'GET_HYBRID_SEARCH_RESULTS',
          payload: { query, config }
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.success && response.results) {
            resolve(JSON.stringify(response.results));
          } else {
            reject(new Error(response?.error || 'Unknown error from background retriever'));
          }
        }
      );
    });
  } catch (error: any) {
    console.error(`Error executing retriever for query "${query}":`, error);
    return `Error performing retrieval: ${error.message || 'Unknown error'}`;
  }
};

export const executeWebSearch = async (
  args: WebSearchArgs,
  config: Config
): Promise<string> => {
  const { queries } = args;

  if (!Array.isArray(queries) || queries.length === 0 || !queries.every(q => q.query && q.query.trim() !== '')) {
    return 'Error: "queries" must be a non-empty array of objects, each with a non-empty "query" string.';
  }

  const fallbackEngines: ('Google' | 'DuckDuckGo' | 'Brave')[] = ['Google', 'DuckDuckGo', 'Brave'];

  const searchPromises = queries.map(async ({ query, engine }) => {
    // This inner logic is mostly correct, but we will let it throw on failure.
    const enginesToTry: (string | undefined)[] = [engine];
    if (!engine) {
      if (config.googleApiKey && config.googleCx) {
        enginesToTry.push('GoogleCustomSearch');
      }
    }
    enginesToTry.push(...fallbackEngines);
    const uniqueEngines = [...new Set(enginesToTry.filter(Boolean))];

    for (const currentEngine of uniqueEngines) {
      for (let i = 0; i < 2; i++) { // Retry loop
        try {
          const searchConfig: Config = { ...config, webMode: currentEngine };
          const result = await webSearch(query, searchConfig);
          // On success, return the result string
          return `Results for "${query}" (using ${currentEngine}):\n${result}`;
        } catch (error: any) {
          console.warn(`Web search with ${currentEngine} for query "${query}" failed. Attempt ${i + 1} of 2. Error: ${error.message}`);
        }
      }
    }

    // If the entire loop completes without returning, it means all engines failed.
    // Instead of returning a string, we throw an error to make the promise reject.
    throw new Error(`All search engines failed for the query: "${query}"`);
  });

  // --- START OF FIX ---
  // Use Promise.allSettled to run all searches and collect all results,
  // whether they succeeded or failed.
  const settledResults = await Promise.allSettled(searchPromises);

  // Now, map over the settled results to create a clean, final output string.
  const finalResults = settledResults.map((result, index) => {
    const query = queries[index].query;
    if (result.status === 'fulfilled') {
      // If the promise was fulfilled, the value is the success message.
      return result.value;
    } else {
      // If the promise was rejected, the reason is the error.
      // We format it into a user-friendly error message.
      console.error(`Error executing web_search for query "${query}":`, result.reason);
      return `Error performing web search for "${query}": ${result.reason.message || 'Unknown error'}`;
    }
  });

  return finalResults.join('\n\n---\n\n');
  // --- END OF FIX ---
};

export const executeWikipediaSearch = async (
  args: WikipediaSearchArgs,
  config: Config
): Promise<string> => {
  const { query } = args;

  if (!query || query.trim() === '') {
    return 'Error: "query" must be a non-empty string.';
  }

  try {
    const searchConfig: Config = { ...config, webMode: 'Wikipedia' };
    const result = await webSearch(query, searchConfig);
    return `Results for "${query}" (using Wikipedia):\n${result}`;
  } catch (error: any) {
    console.error(
      `Error executing wikipedia_search for query "${query}":`,
      error
    );
    return `Error performing Wikipedia search: ${error.message || 'Unknown error'}`;
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

export const executeSmartDispatcher = async (
  args: SmartDispatcherArgs,
  config: Config,
  executeToolCall: (toolCall: any) => Promise<any>
): Promise<string> => {
  const { task } = args;
  const MAX_REPAIR_ATTEMPTS = 2; // Try to generate a plan, then repair it once.
  const availableTools = ['web_search', 'wikipedia_search', 'retriever', 'save_note', 'fetcher', 'prompt_optimizer', 'update_memory'];

  let lastError = '';
  let planObject: any = null;

  for (let attempt = 0; attempt < MAX_REPAIR_ATTEMPTS; attempt++) {
    console.log(`[SmartDispatcher] Planning attempt ${attempt + 1}...`);

    // 1. Generate a plan (with feedback from the previous failed attempt if any)
    const rawPlan = await executePlanner({ task, feedback: lastError }, config);

    if (rawPlan.startsWith('Error:')) {
      return `Error during planning phase: ${rawPlan}`;
    }

    // 2. Dispatcher parses the string ONCE to get a JS object to work with.
    try {
      planObject = JSON.parse(rawPlan); // Using the string from the planner
      
      const invalidSteps = planObject.steps.filter(
        (step: any) => !availableTools.includes(step.tool_name)
      );

      if (invalidSteps.length === 0) {
        // SUCCESS! The plan is valid.
        console.log('[SmartDispatcher] Successfully generated a valid plan:', JSON.stringify(planObject, null, 2));
        // Exit the loop and proceed to execution
        break; 
      } else {
        lastError = `The plan used non-existent tools...`;
        planObject = null; // Invalidate the plan so we don't execute it.
      }
    } catch (e: any) {
      // This catch block is a fallback in case the planner's guarantee fails.
      lastError = `The plan was not correctly formatted JSON...`;
      planObject = null; // Invalidate the plan.
    }
  }

  // 3. After the loop, check if we have a valid plan or not
  if (!planObject) {
    console.error('[SmartDispatcher] Failed to generate a valid plan after all attempts.');
    return `Error: Failed to create a valid plan. Last known error: ${lastError}`;
  }

  // 4. If we have a valid plan, execute it.
  console.log('[SmartDispatcher] Proceeding to execution...');
  return await executeExecutor({ plan: JSON.stringify(planObject) }, executeToolCall);
};
