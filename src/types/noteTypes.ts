export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  lastUpdatedAt: number;
  tags?: string[];
  url?: string;
  // Future enhancements: isArchived?: boolean;
}

export const NOTE_STORAGE_PREFIX = 'cognito_note_';

export type NoteWithEmbedding = Note & { embedding?: number[] };
