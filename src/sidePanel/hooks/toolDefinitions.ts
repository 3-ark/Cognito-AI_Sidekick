import type { ToolDefinition } from '../../types/toolTypes';

export const toolDefinitions: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'note.save', // Renamed from saveNote
      description: 'Saves a new note to the user\'s persistent note system. Use this when the user wants to record information, decisions, or create a new structured note.',
      parameters: {
        type: 'object',
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
              type: 'string',
              description: 'A single tag for the note.',
            },
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
      name: 'browse_page',
      description: 'Opens a URL in a new, temporary tab, extracts the full text content using the same method as "page mode", and returns the text. This is useful for accessing content on pages that block standard fetching tools, or for reading pages exactly as the user sees them.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL of the webpage to browse.',
          },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'memory.update', // Renamed from updateMemory
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
    {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Performs a web search using a specified search engine to find up-to-date information, news, or specific documents on the web.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'The search query to be executed. This should be a concise and targeted string similar to what a user would type into a search engine.',
          },
          engine: {
            type: 'string',
            description:
              'The search engine to use. Defaults to Google if not specified. Wikipedia is ideal for factual lookups, while other engines are good for general searches.',
            enum: ['Google', 'DuckDuckGo', 'Brave', 'Wikipedia', 'GoogleCustomSearch'],
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prompt_optimizer',
      description: 'Optimizes a user\'s prompt to be clearer and more effective for the LLM. Use this when a prompt is ambiguous or could be improved for better results.',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'The user prompt to be optimized.',
          },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'planner',
      description: 'Analyzes the user\'s task and available tools to create a step-by-step plan of tool calls to achieve the mission.',
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: 'The user\'s task to be planned.',
          },
        },
        required: ['task'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'executor',
      description: 'Executes a plan from the planner after user confirmation. The executor follows the plan strictly.',
      parameters: {
        type: 'object',
        properties: {
          plan: {
            type: 'array',
            description: 'The plan of tool calls to be executed.',
            items: {
              type: 'object',
              description: 'A single step in the plan, representing a tool call.',
              properties: {
                tool_name: {
                  type: 'string',
                  description: 'The name of the tool to be called.',
                },
                arguments: {
                  type: 'object',
                  description: 'The arguments for the tool call.',
                },
              },
              required: ['tool_name', 'arguments'],
            },
          },
        },
        required: ['plan'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_tab',
      description: 'Opens a new browser tab with the specified URL.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to open in the new tab.',
          },
        },
        required: ['url'],
      },
    },
  },
];
