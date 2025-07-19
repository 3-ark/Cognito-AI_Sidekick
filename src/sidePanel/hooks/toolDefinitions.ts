interface ToolParameterProperty {
  type: string;
  description: string;
  enum?: string[];
  items?: { type: string };
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
      name: 'note.save',
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
      name: 'memory.update',
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
            enum: ['Google', 'DuckDuckGo', 'Brave', 'Wikipedia'],
          },
        },
        required: ['query'],
      },
    },
  },
];
