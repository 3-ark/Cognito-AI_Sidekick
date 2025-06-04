import { useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { useConfig } from '../ConfigContext';

/**
 * Custom hook for appending text to the note content.
 */
export const useAddToNote = () => {
  const { config, updateConfig } = useConfig();

  /**
   * Appends the given text to the existing note content.
   * If the note is empty, the new text becomes the note content.
   * A double newline is added as a separator if there's existing content and new text to add.
   * @param textToAdd The text to append to the note.
   */
  const appendToNote = useCallback((textToAdd: string) => {
    if (!textToAdd || textToAdd.trim() === '') {
      toast.error("No text selected to add to note.");
      return;
    }

    const currentNote = config.noteContent || '';
    const separator = currentNote && textToAdd.trim() ? '\n\n' : '';
    const newNoteContent = currentNote + separator + textToAdd.trim();

    updateConfig({
      noteContent: newNoteContent,
    });

    toast.success('Selected text appended to note.');
  }, [config.noteContent, updateConfig]);

  return { appendToNote };
};