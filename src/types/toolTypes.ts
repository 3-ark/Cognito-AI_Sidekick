export interface SaveNoteArgs {
  content: string;
  title?: string;
  tags?: string[] | string;
}

export interface UpdateMemoryArgs {
  summary: string;
}

export type BrowsePageArgs = {
  url: string;
};

export interface FetcherArgs {
  url: string;
}

export interface WebSearchArgs {
  query: string;
  engine?: 'Google' | 'DuckDuckGo' | 'Brave' | 'Wikipedia' | 'GoogleCustomSearch';
}

export interface OpenTabArgs {
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
  properties?: { [key: string]: ToolParameterProperty };
  required?: string[];
  description: string;
  enum?: string[];
  items?: ToolParameterProperty; // <-- changed from { type: string; } to ToolParameterProperty
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
