/**
 * @file Provides utility functions for splitting note and chat message content into manageable chunks.
 * This version uses a structure-aware approach to preserve tables, lists, and code blocks.
 */

// --- Type Definitions (for a self-contained snippet) ---

export interface NoteInputForChunking {
  id: string;
  content: string;
  title?: string;
  url?: string;
  tags?: string[];
}

export interface NoteChunk {
  id: string;
  parentId: string;
  content: string;
  charCount: number;
  headingPath?: string[];
  originalUrl?: string;
  originalTags?: string[];
  parentTitle?: string;
}

export interface ChatMessageInputForChunking {
  id: string;
  title?: string;
  turns: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
}

export interface ChatChunk {
  id: string;
  parentId: string;
  turnIndex: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  charCount: number;
  parentTitle?: string;
}


// --- Constants ---

/** Maximum characters allowed in a single chunk. Text blocks larger than this will be split. */
const MAX_CHUNK_CHARS = 2000;
/** Minimum character length for any chunk. Chunks smaller than this will be merged or discarded. */
const MIN_CHUNK_CHARS = 150;


// --- Main Chunking Functions ---

/**
 * Splits note content into manageable, semantically coherent chunks.
 *
 * This function employs a structure-aware, multi-stage strategy:
 * 1.  **Extraction:** It first identifies and extracts "atomic" structures that should not be split,
 *     such as Markdown tables, multi-line lists, and fenced code blocks. These are replaced with unique placeholders.
 * 2.  **Structure Chunking:** Each extracted atomic structure becomes its own complete chunk. This preserves
 *     their integrity (e.g., tables are not shredded).
 * 3.  **Hierarchical Text Chunking:** The remaining text is then processed. It's first split by Markdown
 *     headings (H1-H6) to maintain the document's outline. Within each section, paragraphs are intelligently
 *     grouped together to form contextually rich chunks.
 *
 * @param noteInput - The note data to be chunked.
 * @returns An array of `NoteChunk` objects.
 */
export function chunkNoteContent(noteInput: NoteInputForChunking): NoteChunk[] {
  const { id: parentId, content, title: parentTitle, url: originalUrl, tags: originalTags } = noteInput;
  const chunks: NoteChunk[] = [];
  let chunkIndex = 0;

  // 1. PRE-PROCESSING: Clean up input content
  let processedContent = (content || '').replace(/<!--[\s\S]*?-->/g, '').trim(); // Remove HTML comments

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
    return chunks;
  }

  // 2. EXTRACTION: Define and extract atomic structures
  const specialStructures = [
    { name: 'CODE_BLOCK', regex: /```[\s\S]*?```/g },
    // Regex for a full markdown table. It looks for at least one line with pipes and a header separator line.
    { name: 'TABLE', regex: /((?:\|.*\|[ \t]*\r?\n)+(?:\|\s*:?-+:?\s*\|[ \t\r\n]*)+)/g },
    // Regex for a multi-line list (bulleted or numbered)
    { name: 'LIST', regex: /((?:(?:^|\n)\s*(?:[*\-+]|\d+\.)\s.*)+)/g },
  ];

  const extractedContent: { [key: string]: string } = {};
  let placeholderIndex = 0;

  for (const structure of specialStructures) {
    processedContent = processedContent.replace(structure.regex, (match) => {
      const key = `__PLACEHOLDER_${structure.name}_${placeholderIndex++}__`;
      extractedContent[key] = match.trim();
      // Add newlines to ensure separation from surrounding text
      return `\n\n${key}\n\n`;
    });
  }

  // 3. HIERARCHICAL SPLITTING BY HEADINGS
  const headingRegex = /^(#{1,6})\s+(.+?)\s*$/gm;
  const sections: Array<{ text: string; headingPath: string[] }> = [];
  let lastIndex = 0;
  
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
    // Content before the first heading
    if (headingMatches[0].startIndex > 0) {
      sections.push({
        text: processedContent.substring(0, headingMatches[0].startIndex).trim(),
        headingPath: [],
      });
    }
    // Process content between headings
    for (let i = 0; i < headingMatches.length; i++) {
      const currentMatch = headingMatches[i];
      const nextMatch = headingMatches[i+1];
      
      let sectionContentStart = processedContent.indexOf('\n', currentMatch.startIndex);
      if (sectionContentStart === -1) sectionContentStart = currentMatch.startIndex + currentMatch.text.length + currentMatch.level + 1;
      else sectionContentStart += 1;

      const sectionEndIndex = nextMatch ? nextMatch.startIndex : processedContent.length;
      const sectionText = processedContent.substring(sectionContentStart, sectionEndIndex).trim();
      
      // Update heading path based on level
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

  // 4. CHUNKING WITHIN SECTIONS
  for (const section of sections) {
    // Split section text by our placeholders, keeping the placeholders as delimiters
    const segments = section.text.split(/(__PLACEHOLDER_\w+_\d+__)/g).filter(s => s.trim());

    for (const segment of segments) {
      if (segment.startsWith('__PLACEHOLDER_')) {
        // This is an atomic structure (table, list, etc.)
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
        // This is regular text, apply paragraph grouping
        const paragraphs = segment.split(/\n\s*\n+/).map(p => p.trim()).filter(p => p);
        let paragraphBuffer = "";

        for (const para of paragraphs) {
          if (paragraphBuffer && (paragraphBuffer.length + para.length + 2) > MAX_CHUNK_CHARS) {
            // Buffer is full, push it as a chunk
            chunks.push({
              id: `notechunk_${parentId}_${chunkIndex++}`,
              parentId,
              content: paragraphBuffer,
              charCount: paragraphBuffer.length,
              headingPath: section.headingPath.length > 0 ? [...section.headingPath] : undefined,
              parentTitle, originalUrl, originalTags,
            });
            paragraphBuffer = para; // Start new buffer
          } else {
            // Add to buffer
            paragraphBuffer += (paragraphBuffer ? "\n\n" : "") + para;
          }
        }
        // Push any remaining content in the buffer
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
  // 5. POST-PROCESSING: Clean up and merge small, dangling chunks
  const finalChunks: NoteChunk[] = [];
  let i = 0;
  while (i < chunks.length) {
    const currentChunk = chunks[i];

    // Check if the current chunk is too small AND there is a next chunk to merge with
    if (
      currentChunk.charCount < MIN_CHUNK_CHARS &&
      (i + 1) < chunks.length
    ) {
      const nextChunk = chunks[i + 1];

      // Condition for merging:
      // 1. The combined content doesn't exceed the max chunk size.
      // 2. They belong to the same heading path, ensuring they are from the same logical section.
      const currentHeading = JSON.stringify(currentChunk.headingPath || []);
      const nextHeading = JSON.stringify(nextChunk.headingPath || []);

      if (
        (currentChunk.content.length + nextChunk.content.length + 2) <= MAX_CHUNK_CHARS &&
        currentHeading === nextHeading
      ) {
        // Prepend the small chunk's content to the next chunk
        nextChunk.content = currentChunk.content + "\n\n" + nextChunk.content;
        nextChunk.charCount = nextChunk.content.length;
        
        // We effectively skip the current small chunk, as its content is now in the next one.
        // The next chunk will be processed/pushed in the next iteration.
        i++;
        continue;
      }
    }

    // If the chunk is not small or cannot be merged, add it to our final list
    finalChunks.push(currentChunk);
    i++;
  }

  return finalChunks;

}

/**
 * Performs light cleaning on text intended for embedding.
 * @param text The text to clean.
 * @returns The cleaned text.
 */
export function preprocessForEmbeddings(text: string): string {
  let cleanedText = text;
  // Remove Markdown image links and simple tags, but keep the alt text
  cleanedText = cleanedText.replace(/!\[(.*?)\]\(.*?\)/g, '$1');
  // Remove other markdown syntax
  cleanedText = cleanedText.replace(/([_*~`#()>.-])/g, '');
  // Remove extra whitespace
  cleanedText = cleanedText.replace(/\s+/g, ' ').trim();
  return cleanedText;
}

/**
 * Splits chat message turns into individual chunks.
 * Each turn's content becomes a separate chunk.
 *
 * @param chatInput - The chat message data to be chunked.
 * @returns An array of `ChatChunk` objects.
 */
export function chunkChatMessageTurns(chatInput: ChatMessageInputForChunking): ChatChunk[] {
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
        timestamp: turn.timestamp,
        charCount: content.length,
        parentTitle,
      });
    }
  });

  return chunks;
}