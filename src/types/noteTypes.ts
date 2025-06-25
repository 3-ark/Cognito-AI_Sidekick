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

export interface SaveNoteResult {
  success: boolean;
  note: Note; // Return the saved note for UI updates
  warning?: string; // For non-critical issues (e.g., indexing failed)
  error?: string; // For critical save failures
}

export interface DeleteNoteResult {
  success: boolean;
  warning?: string; // For non-critical issues (e.g., index update failed)
  error?: string; // For critical delete failures
}
