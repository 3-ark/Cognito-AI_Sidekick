import { HydratedChunkSearchResultItem } from '../background/searchUtils';

export interface RetrieverResult {
  query: string;
  results: HydratedChunkSearchResultItem[];
  formattedResults: string;
}

export interface Conversation {
  id: string; // e.g., 'conv_123'
  title: string;
  createdAt: number;
  lastUpdatedAt: number;
  model?: string;
  chatMode?: string;
  noteContentUsed?: string;
  useNoteActive?: boolean;
  webMode?: string;
  url?: string;
}

export interface MessageTurn {
  id: string; // Unique ID for the message, e.g., 'msg_abc'
  conversationId: string; // Foreign key to the Conversation
  parentMessageId?: string; // For threading, pointing to the previous message in the branch
  role: 'user' | 'assistant' | 'tool';
  status: 'complete' | 'streaming' | 'error' | 'cancelled' | 'awaiting_tool_results';
  content: string;
  webDisplayContent?: string;
  tool_call_id?: string;
  timestamp: number;
  name?: string;
  tool_calls?: {
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }[];

  // for search
  bm25Content?: string;

  // for generation info
  promptTokens?: number;
  completionTokens?: number;
  tokensPerSecond?: number;

  lastUpdatedAt?: number;

  // for RAG
  retrieverResults?: RetrieverResult;
}

export interface ApiMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }[];
}
