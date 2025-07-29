interface ToolParameterProperty {
  type: string;
  description: string;
  enum?: string[];
  items?: { 
    type: string;
    properties?: { [key: string]: ToolParameterProperty };
    required?: string[];
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: {
        [key: string]: ToolParameterProperty;
      };
      required?: string[];
    };
  };
}

export const toolDefinitions: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'prompt_optimizer',
      description:
        'Optimizes a user-provided prompt to be clearer, more concise, and more effective for the LLM. Use this when a prompt is ambiguous, overly complex, or could be improved for better results. This should be used (when you do need it) in the first step in the smart_dispatcher or planner tool.',
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
      name: 'wikipedia_search',
      description:
        'Performs a semantic search over Wikipedia to find relevant articles and information. Use this for fact-checking, definitions, and general knowledge questions.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The query to search for on Wikipedia.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'retriever',
      description:
        'Performs a semantic search over the user’s notes and chat history to find relevant context. Use this to answer questions, recall information, or provide context for other tasks.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'The query to search for in the user’s notes and chat history.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'planner',
      description:
        'Analyzes a user’s task and the available tools to create a step-by-step plan of tool calls to achieve the mission. Use this for complex tasks that require multiple steps or tools.',
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: 'The user’s task to be planned.',
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
      description:
        'Executes the **JSON plan generated** by the planner after user confirmation. The executor follows the plan strictly and executes the tool calls in the specified order.',
      parameters: {
        type: 'object',
        properties: {
          plan: {
            type: 'string',
            description: 'The plan to be executed.',
          },
        },
        required: ['plan'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_note',
      description:
        "Saves a new note to the user's persistent note system. Use this when the user wants to record information, decisions, or create a new structured note.",
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The main content of the note. This is mandatory.',
          },
          title: {
            type: 'string',
            description:
              'An optional title for the note. If not provided, a default title will be generated.',
          },
          tags: {
            type: 'array',
            description:
              'An optional list of tags (strings) to categorize the note.',
            items: {
              type: 'string',
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
      description:
        'Fetches the main textual content of a given URL. Use this when the user provides a link and asks you to summarize it, answer questions about it, or extract specific information from it.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description:
              'The URL of the webpage to fetch and extract content from.',
          },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_memory',
      description:
        'Appends a short summary or key piece of information to a special "memory" note in the popover. Use this to remember user preferences, facts about the user, or important context from the conversation for future reference within the current session or for the user to see in their popover note.',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description:
              'The concise summary or piece of information to add to the memory. For example, "User is 30yo, he is building an extension".',
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
        'Performs a web search using a specified search engine to find up-to-date information, news, or specific documents on the web. Can accept multiple queries to run concurrently, each with a different search engine.',
      parameters: {
        type: 'object',
        properties: {
          queries: {
            type: 'array',
            description: 'A list of search query objects to be executed concurrently.',
            items: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'The search query to be executed.',
                },
                engine: {
                  type: 'string',
                  description: 'The search engine to use for this specific query. Defaults to Google.',
                  enum: ['Google', 'DuckDuckGo', 'Brave', 'GoogleCustomSearch'],
                },
              },
              required: ['query'],
            },
          },
        },
        required: ['queries'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'smart_dispatcher',
      description:
        'Handles complex, multi-step user requests that require a sequence of actions or multiple tool calls. Use this for tasks like researching several topics and then summarizing, or finding information and then saving it. For simple, single-action requests (e.g., a single web search), call the specific tool directly.',
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description:
              "The user's complete, original, natural language request that describes the entire multi-step task. For example: 'search for the pros and cons of GraphQL and REST, and then create a note summarizing the findings'.",
          },
        },
        required: ['task'],
      },
    },
  },
];
