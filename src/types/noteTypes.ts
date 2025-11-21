export interface Note {
  id: string;
  title:string;
  description?: string;
  content: string;
  createdAt: number;
  lastUpdatedAt: number;
  contentLastUpdatedAt?: number;
  tags?: string[];
  url?: string;
  bm25Content?: string;
  pinned?: boolean;

  // Future enhancements: isArchived?: boolean;
}

export const NOTE_STORAGE_PREFIX = 'note_';

export type NoteWithEmbedding = Note & { embedding?: number[] };
