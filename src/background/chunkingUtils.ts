/**
 * @file Provides utility functions for splitting note and chat message content into manageable chunks.
 * This version uses a structure-aware approach and prepares data for indexed retrieval.
 */
import {
  NoteInputForChunking,
  NoteChunk,
  NoteChunkingResult, // Import from central types
  ChatMessageInputForChunking,
  ChatChunk,
  ChatChunkingResult, // Import from central types
} from '../types/chunkTypes';


// --- Constants ---

const MAX_CHUNK_CHARS = 2000;
const MIN_CHUNK_CHARS = 150;


// --- Main Chunking Functions ---

/**
 * Splits note content into manageable, semantically coherent chunks.
 *
 * @param noteInput - The note data to be chunked.
 * @returns A `NoteChunkingResult` object containing the chunks and an array of their IDs for indexing.
 */
export function chunkNoteContent(noteInput: NoteInputForChunking): NoteChunkingResult {
  // ... (The entire function logic is correct from the previous step) ...
  // The only change is the final return statement.
  const { id: parentId, content, title: parentTitle, url: originalUrl, tags: originalTags } = noteInput;
  const chunks: NoteChunk[] = [];
  let chunkIndex = 0;

  let processedContent = (content || '').replace(/<!--[\s\S]*?-->/g, '').trim();

  if (processedContent.length < MIN_CHUNK_CHARS) {
    if (processedContent.length > 0) {
      chunks.push({
        id: `notechunk_${parentId}_${chunkIndex++}`,
        parentId,
        content: processedContent,
        charCount: processedContent.length,
        parentTitle, originalUrl, originalTags,
      });
    }
    return { chunks, chunkIds: chunks.map(c => c.id) };
  }

  const specialStructures = [
    { name: 'CODE_BLOCK', regex: /```[\s\S]*?```/g },
    { name: 'TABLE', regex: /((?:\|.*\|[ \t]*\r?\n)+(?:\|\s*:?-+:?\s*\|[ \t\r\n]*)+)/g },
    { name: 'LIST', regex: /((?:(?:^|\n)\s*(?:[*\-+]|\d+\.)\s.*)+)/g },
  ];

  const extractedContent: { [key: string]: string } = {};
  let placeholderIndex = 0;

  for (const structure of specialStructures) {
    processedContent = processedContent.replace(structure.regex, (match) => {
      const key = `__PLACEHOLDER_${structure.name}_${placeholderIndex++}__`;
      extractedContent[key] = match.trim();
      return `\n\n${key}\n\n`;
    });
  }

  const headingRegex = /^(#{1,6})\s+(.+?)\s*$/gm;
  const sections: Array<{ text: string; headingPath: string[] }> = [];
  
  const headingMatches: Array<{level: number, text: string, startIndex: number}> = [];
  let match;
  while((match = headingRegex.exec(processedContent)) !== null) {
    headingMatches.push({
        level: match[1].length,
        text: match[2].trim(),
        startIndex: match.index
    });
  }

  if (headingMatches.length === 0) {
    sections.push({ text: processedContent, headingPath: [] });
  } else {
    let currentHeadingPath: string[] = [];
    if (headingMatches[0].startIndex > 0) {
      sections.push({
        text: processedContent.substring(0, headingMatches[0].startIndex).trim(),
        headingPath: [],
      });
    }
    for (let i = 0; i < headingMatches.length; i++) {
      const currentMatch = headingMatches[i];
      const nextMatch = headingMatches[i+1];
      
      let sectionContentStart = processedContent.indexOf('\n', currentMatch.startIndex);
      if (sectionContentStart === -1) sectionContentStart = currentMatch.startIndex + currentMatch.text.length + currentMatch.level + 1;
      else sectionContentStart += 1;

      const sectionEndIndex = nextMatch ? nextMatch.startIndex : processedContent.length;
      const sectionText = processedContent.substring(sectionContentStart, sectionEndIndex).trim();
      
      currentHeadingPath = currentHeadingPath.slice(0, currentMatch.level - 1);
      currentHeadingPath.push(currentMatch.text);

      if (sectionText.length > 0) {
        sections.push({
          text: sectionText,
          headingPath: [...currentHeadingPath],
        });
      }
    }
  }

  for (const section of sections) {
    const segments = section.text.split(/(__PLACEHOLDER_\w+_\d+__)/g).filter(s => s.trim());

    for (const segment of segments) {
      if (segment.startsWith('__PLACEHOLDER_')) {
        const content = extractedContent[segment];
        if (content && content.length >= MIN_CHUNK_CHARS) {
          chunks.push({
            id: `notechunk_${parentId}_${chunkIndex++}`,
            parentId,
            content,
            charCount: content.length,
            headingPath: section.headingPath.length > 0 ? [...section.headingPath] : undefined,
            parentTitle, originalUrl, originalTags,
          });
        }
      } else {
        const paragraphs = segment.split(/\n\s*\n+/).map(p => p.trim()).filter(p => p);
        let paragraphBuffer = "";

        for (const para of paragraphs) {
          if (paragraphBuffer && (paragraphBuffer.length + para.length + 2) > MAX_CHUNK_CHARS) {
            chunks.push({
              id: `notechunk_${parentId}_${chunkIndex++}`,
              parentId,
              content: paragraphBuffer,
              charCount: paragraphBuffer.length,
              headingPath: section.headingPath.length > 0 ? [...section.headingPath] : undefined,
              parentTitle, originalUrl, originalTags,
            });
            paragraphBuffer = para;
          } else {
            paragraphBuffer += (paragraphBuffer ? "\n\n" : "") + para;
          }
        }
        if (paragraphBuffer.length >= MIN_CHUNK_CHARS) {
          chunks.push({
            id: `notechunk_${parentId}_${chunkIndex++}`,
            parentId,
            content: paragraphBuffer,
            charCount: paragraphBuffer.length,
            headingPath: section.headingPath.length > 0 ? [...section.headingPath] : undefined,
            parentTitle, originalUrl, originalTags,
          });
        }
      }
    }
  }
  
  const finalChunks: NoteChunk[] = [];
  let i = 0;
  while (i < chunks.length) {
    const currentChunk = chunks[i];

    if (
      currentChunk.charCount < MIN_CHUNK_CHARS &&
      (i + 1) < chunks.length
    ) {
      const nextChunk = chunks[i + 1];
      const currentHeading = JSON.stringify(currentChunk.headingPath || []);
      const nextHeading = JSON.stringify(nextChunk.headingPath || []);

      if (
        (currentChunk.content.length + nextChunk.content.length + 2) <= MAX_CHUNK_CHARS &&
        currentHeading === nextHeading
      ) {
        nextChunk.content = currentChunk.content + "\n\n" + nextChunk.content;
        nextChunk.charCount = nextChunk.content.length;
        i++;
        continue;
      }
    }
    finalChunks.push(currentChunk);
    i++;
  }

  return {
    chunks: finalChunks,
    chunkIds: finalChunks.map(c => c.id)
  };
}

/**
 * Splits chat message turns into individual chunks.
 *
 * @param chatInput - The chat message data to be chunked.
 * @returns A `ChatChunkingResult` object containing the chunks and an array of their IDs for indexing.
 */
export function chunkChatMessageTurns(chatInput: ChatMessageInputForChunking): ChatChunkingResult {
  const { id: parentId, title: parentTitle, turns } = chatInput;
  const chunks: ChatChunk[] = [];

  turns.forEach((turn, index) => {
    const content = turn.content.trim();
    if (content && content.length >= MIN_CHUNK_CHARS) {
      chunks.push({
        id: `chatchunk_${parentId}_${index}_${turn.timestamp}_${turn.role}`,
        parentId,
        turnIndex: index,
        role: turn.role,
        content: content,
        timestamp: new Date(turn.timestamp).getTime(),
        charCount: content.length,
        parentTitle,
      });
    }
  });

  return {
    chunks,
    chunkIds: chunks.map(c => c.id)
  };
}

export function preprocessForEmbeddings(text: string): string {
  let cleanedText = text;
  cleanedText = cleanedText.replace(/!\[(.*?)\]\(.*?\)/g, '$1');
  cleanedText = cleanedText.replace(/([_*~`#()>.-])/g, '');
  cleanedText = cleanedText.replace(/\s+/g, ' ').trim();
  return cleanedText;
}