import { NoteWithEmbedding, Note } from '../../types/noteTypes';

// Helper to escape double quotes for YAML strings
export const escapeDoubleQuotes = (str: string): string => str.replace(/"/g, '\\"');

/**
 * Generates the Markdown content string for a single note for Obsidian export.
 * Can be used for other Markdown generation purposes if the format is suitable.
 */
export const generateObsidianMDContent = (note: Note | NoteWithEmbedding): string => {
  let mdContent = '---\n';
  
  // Ensure title is quoted
  mdContent += `title: "${escapeDoubleQuotes(note.title)}"\n`;
  
  const dateTimestamp = note.lastUpdatedAt || note.createdAt;
  if (dateTimestamp) {
    const formattedDate = new Date(dateTimestamp).toISOString().split('T')[0];
    mdContent += `date: ${formattedDate}\n`;
  }

  // Ensure 'source' field is used for note.url and it's quoted
  if (note.url && note.url.trim() !== '') {
    mdContent += `source: "${escapeDoubleQuotes(note.url.trim())}"\n`;
  }

  if (note.tags && note.tags.length > 0) {
    mdContent += 'tags:\n';
    note.tags.forEach(tag => {
      const trimmedTag = typeof tag === 'string' ? tag.trim() : ''; // Ensure tag is a string before trimming
      if (!trimmedTag) return;

      // Quote tags if they contain special characters like ':', YAML control characters, 
      // or if they could be misinterpreted as other YAML types (numbers, booleans),
      // or if the original tag had leading/trailing whitespace that was trimmed.
      if (trimmedTag.includes(':') ||
          trimmedTag.includes('"') ||
          trimmedTag.includes("'") ||
          trimmedTag.includes('[') ||
          trimmedTag.includes(']') ||
          trimmedTag.includes('{') ||
          trimmedTag.includes('}') ||
          trimmedTag.includes(',') || 
          ['true', 'false', 'null', 'yes', 'no', 'on', 'off'].includes(trimmedTag.toLowerCase()) ||
          /^\d+(\.\d+)?$/.test(trimmedTag) || 
          trimmedTag.startsWith('- ') || 
          (typeof tag === 'string' && trimmedTag !== tag) // Original tag had leading/trailing whitespace
         ) {
        mdContent += `  - "${escapeDoubleQuotes(trimmedTag)}"\n`;
      } else {
        mdContent += `  - ${trimmedTag}\n`;
      }
    });
  }
  mdContent += '---\n\n';
  mdContent += note.content;
  return mdContent;
};
