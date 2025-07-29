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
  args: PlannerArgs, // Now uses the new interface
  config: Config
): Promise<string> => {
  const { task, feedback } = args;

  // --- THE FIX ---
  // Define the exact list of tools the planner is allowed to use.
  const availableTools = [
    'web_search',
    'retriever',
    'save_note',
    'wikipedia_search',
    'fetcher',
    'prompt_optimizer',
    'update_memory',
    // DO NOT include smart_dispatcher, planner, or executor here to avoid loops.
  ];
  // Construct the prompt dynamically based on whether there's feedback
  const feedbackInstruction = feedback 
    ? `\n**IMPORTANT FEEDBACK:** ${feedback}\nYou MUST correct the plan based on this feedback.`
    : '';

  const systemPrompt = `You are a meticulous AI planning agent. Your task is to create a step-by-step plan in JSON format to accomplish a user's request.

  **RULES:**
  1.  You MUST ONLY use tools from the following list: ${JSON.stringify(availableTools)}.
  2.  Do not invent any tool names. If a step cannot be accomplished with the available tools, you must state that in the plan or omit the step.
  3.  The output MUST be a single, clean JSON object, without any markdown formatting like \`\`\`json.
  4.  Use placeholders like "$context.step_1_result" to pass the output from one step as an argument to a subsequent step.

  **EXAMPLE GOOD PLAN:**
  User Task: "Research the pros and cons of GraphQL vs REST and save it in a note."
  Your Output:
  {
    "steps": [
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
          "title": "GraphQL Explanation",
          "content": "GraphQL is a query language for APIs. Key findings: $context.step_1_result"
          "tags": ["GraphQL", "API"]
        }
      }
    ]
  }

  Now, create a plan for the following user task.
  ${feedbackInstruction}`; // <-- Inject feedback here

  try {
    const plan = await prompt(systemPrompt + `User Task: "${task}"`);
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

      // Replace placeholders
      let processedArgs = JSON.stringify(tool_arguments);
      const placeholders = processedArgs.match(/\$context\.step_\d+_result/g);
      if (placeholders) {
        for (const placeholder of placeholders) {
          const contextKey = placeholder.substring(9); // remove "$context."
          if (context[contextKey]) {
            processedArgs = processedArgs.replace(placeholder, context[contextKey]);
          }
        }
      }

      const toolCallId = `executor_${tool_name}_${Date.now()}`;
      const executionResult = await executeToolCall({
        id: toolCallId,
        name: tool_name,
        arguments: processedArgs,
      });

      const contextKey = `step_${i + 1}_result`;
      context[contextKey] = executionResult.result;
      finalResult += `${executionResult.name}: ${executionResult.result}\n`;
    }
    return finalResult;
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

  try {
    const searchPromises = queries.map(async ({ query, engine }) => {
      let lastError: any = null;
      const enginesToTry: (typeof fallbackEngines[number] | 'GoogleCustomSearch')[] = [];

      if (engine) {
        enginesToTry.push(engine);
      }

      // Add fallback engines
      if (!engine) {
          if (config.googleApiKey && config.googleCx) {
              enginesToTry.push('GoogleCustomSearch');
          }
          enginesToTry.push(...fallbackEngines);
      } else {
        enginesToTry.push(...fallbackEngines);
      }


      for (const currentEngine of enginesToTry) {
        try {
          const searchConfig: Config = { ...config, webMode: currentEngine };
          const result = await webSearch(query, searchConfig);
          return `Results for "${query}" (using ${currentEngine}):\n${result}`;
        } catch (error: any) {
          lastError = error;
          console.warn(`Web search with ${currentEngine} for query "${query}" failed. Trying next engine. Error: ${error.message}`);
        }
      }

      // If all engines failed for this query
      const queryStrings = queries.map(q => q.query).join(', ');
      console.error(
        `Error executing web_search for queries "${queryStrings}" after trying all engines:`,
        lastError
      );
      return `Error performing web search for "${query}": ${lastError.message || 'Unknown error'}`;
    });
    
    const results = await Promise.all(searchPromises);
    
    return results.join('\n\n---\n\n');
  } catch (error: any) {
    const queryStrings = queries.map(q => q.query).join(', ');
    console.error(
      `Error executing web_search for queries "${queryStrings}":`,
      error
    );
    return `Error performing web search: ${error.message || 'Unknown error'}`;
  }
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
  const availableTools = ['web_search', 'retriever', 'save_note', 'fetcher', 'prompt_optimizer', 'update_memory'];

  let lastError = '';
  let planObject: any = null;

  for (let attempt = 0; attempt < MAX_REPAIR_ATTEMPTS; attempt++) {
    console.log(`[SmartDispatcher] Planning attempt ${attempt + 1}...`);

    // 1. Generate a plan (with feedback from the previous failed attempt if any)
    const rawPlan = await executePlanner({ task, feedback: lastError }, config);

    if (rawPlan.startsWith('Error:')) {
      return `Error during planning phase: ${rawPlan}`;
    }

    // 2. Clean the plan (remove markdown)
    let cleanPlanJson = rawPlan.trim();
    const match = cleanPlanJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match && match[1]) {
      cleanPlanJson = match[1];
    }

    // 3. Try to parse and validate the plan
    try {
      planObject = JSON.parse(cleanPlanJson);
      
      const invalidSteps = planObject.steps.filter(
        (step: any) => !availableTools.includes(step.tool_name)
      );

      if (invalidSteps.length === 0) {
        // SUCCESS! The plan is valid.
        console.log('[SmartDispatcher] Successfully generated a valid plan:', JSON.stringify(planObject, null, 2));
        // Exit the loop and proceed to execution
        break; 
      } else {
        // The plan is valid JSON but uses the wrong tools.
        const invalidToolNames = invalidSteps.map((step: any) => step.tool_name).join(', ');
        lastError = `The plan was invalid because it used non-existent tools: [${invalidToolNames}]. You MUST ONLY use tools from this list: ${JSON.stringify(availableTools)}.`;
        planObject = null; // Invalidate the plan so we don't execute it.
      }
    } catch (e: any) {
      // The plan is not even valid JSON.
      lastError = `The plan was invalid because it was not correctly formatted JSON. The error was: ${e.message}. Please provide a single, clean JSON object.`;
      planObject = null; // Invalidate the plan.
    }
  }

  // 4. After the loop, check if we have a valid plan or not
  if (!planObject) {
    console.error('[SmartDispatcher] Failed to generate a valid plan after all attempts.');
    return `Error: Failed to create a valid plan. Last known error: ${lastError}`;
  }

  // 5. If we have a valid plan, execute it.
  console.log('[SmartDispatcher] Proceeding to execution...');
  return await executeExecutor({ plan: JSON.stringify(planObject) }, executeToolCall);
};
