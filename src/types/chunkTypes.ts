/**
 * @file Defines the TypeScript types for note and chat message chunks.
 */

/**
 * Input type for chunking note content.
 */
export interface NoteInputForChunking {
  /** The unique identifier of the original note. */
  id: string;
  /** The main textual content of the note. */
  content: string;
  /** The title of the note, if available. */
  title?: string;
  /** The original URL associated with the note, if any. */
  url?: string;
  /** Tags associated with the note. */
  tags?: string[];
}

/**
 * Represents a chunk of a note's content.
 */
export interface NoteChunk {
  /**
   * The unique identifier for this chunk.
   * Format: `notechunk_<parentId>_<index>`
   */
  id: string;
  /** The ID of the original note from which this chunk was derived. */
  parentId: string;
  /** The text content of this specific chunk. */
  content: string;
  /** The number of characters in the chunk's content. */
  charCount: number;
  /**
   * An array of strings representing the hierarchy of Markdown headings
   * under which this chunk is located. Empty if not under any heading.
   * e.g., ["Main Topic", "Sub-section"]
   */
  headingPath?: string[];
  /** The original URL of the parent note, if available. */
  originalUrl?: string;
  /** The original tags of the parent note, if available. */
  originalTags?: string[];
  /** The title of the parent note, if available. */
  parentTitle?: string;
}

/**
 * Input type for chunking chat message turns.
 */
export interface ChatMessageInputForChunking {
  /** The unique identifier of the chat session. */
  id: string;
  /** The title of the chat session, if available. */
  title?: string;
  /** An array of turns in the chat conversation. */
  turns: Array<{
    /** The role of the speaker (e.g., "user", "assistant"). */
    role: string;
    /** The content of the chat turn. */
    content: string;
    /** The timestamp of when the turn was recorded. */
    timestamp: number;
  }>;
}

/**
 * Represents a chunk derived from a single chat message turn.
 */
export interface ChatChunk {
  /**
   * The unique identifier for this chat chunk.
   * Format: `chatchunk_<parentId>_<turnIndex>_<timestamp>_<role>`
   */
  id: string;
  /** The ID of the original chat session. */
  parentId: string;
  /** The index of the turn within the original chat session. */
  turnIndex: number;
  /** The role of the speaker for this turn (e.g., "user", "assistant"). */
  role: string;
  /** The textual content of the chat turn. */
  content: string;
  /** The timestamp of the original chat turn. */
  timestamp: number;
  /** The number of characters in the chunk's content. */
  charCount: number;
  /** The title of the parent chat session, if available. */
  parentTitle?: string;
}

/**
 * The result of chunking a note, containing both the chunks and a list of their IDs for indexing.
 */
export interface NoteChunkingResult {
  chunks: NoteChunk[];
  chunkIds: string[];
}

/**
 * The result of chunking a chat message, containing both the chunks and a list of their IDs for indexing.
 */
export interface ChatChunkingResult {
  chunks: ChatChunk[];
  chunkIds: string[];
}
