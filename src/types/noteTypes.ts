export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  lastUpdatedAt: number;
  // Future enhancements: tags?: string[]; isArchived?: boolean;
}

export const NOTE_STORAGE_PREFIX = 'cognito_note_';
