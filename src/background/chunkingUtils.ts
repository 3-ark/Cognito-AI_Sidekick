/**
 * @file Provides utility functions for splitting note and chat message content into manageable chunks.
 */

import {
  NoteInputForChunking,
  NoteChunk,
  ChatMessageInputForChunking,
  ChatChunk,
} from '../types/chunkTypes';

// --- Constants ---
/** Maximum characters allowed in a paragraph before attempting to sub-split it. */
const MAX_PARAGRAPH_CHARS = 1500;
/** Target character length for sub-chunks created from overly long paragraphs/sentences. */
const TARGET_SUB_CHUNK_CHARS = 500;
/** Minimum character length for any chunk. Chunks smaller than this may be merged or discarded. */
const MIN_CHUNK_CHARS = 50;
/** Number of characters to overlap between consecutive sub-chunks to maintain context. */
const OVERLAP_CHARS = 50;

// --- Helper Functions ---

/**
 * Splits a long text by sentences.
 * A simple heuristic is used: looks for sentence-ending punctuation (.!?)
 * followed by whitespace and an uppercase letter, or a newline.
 * @param text The text to split.
 * @returns An array of sentences.
 */
function splitTextBySentences(text: string): string[] {
  if (!text) return [];
  // Regex to split by common sentence terminators followed by whitespace and an uppercase letter,
  // or by a newline character.
  // It also handles cases where there might be multiple spaces or no space after the terminator.
  const sentenceEndRegex = /(?<=[.!?])(?:\s+(?=[A-Z])|\s*\n+)/g;
  let sentences = text.split(sentenceEndRegex).map(s => s.trim()).filter(s => s.length > 0);

  // Further refine: if a "sentence" doesn't end with punctuation, it might be a fragment.
  // Try to merge it with the next one if the next one starts with a lowercase letter (unless it's a list item).
  // This is a basic heuristic.
  const refinedSentences: string[] = [];
  let i = 0;
  while (i < sentences.length) {
    let currentSentence = sentences[i];
    if (i + 1 < sentences.length &&
        !/[.!?]$/.test(currentSentence) && // Current doesn't end with punctuation
        /^[a-z]/.test(sentences[i+1]) && // Next starts with lowercase
        !/^\s*[-*+]/.test(sentences[i+1]) // Next is not a list item
    ) {
      currentSentence += ' ' + sentences[i+1];
      i++; // Skip next sentence as it's merged
    }
    refinedSentences.push(currentSentence);
    i++;
  }
  return refinedSentences.filter(s => s.length > 0);
}


/**
 * Splits a single piece of text into fixed-length segments with overlap.
 * @param text The text to split.
 * @param maxLength The maximum length of each segment.
 * @param overlap The number of characters to overlap between segments.
 * @returns An array of text segments.
 */
function splitTextWithOverlap(text: string, maxLength: number, overlap: number): string[] {
  const chunks: string[] = [];
  if (text.length <= maxLength) {
    if (text.length >= MIN_CHUNK_CHARS) {
      chunks.push(text);
    }
    return chunks;
  }

  let startIndex = 0;
  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + maxLength, text.length);
    let chunk = text.substring(startIndex, endIndex);

    if (chunk.length < MIN_CHUNK_CHARS && chunks.length > 0) {
      // If the remaining chunk is too small, try to append it to the previous one
      // if it doesn't make the previous one too large.
      const lastChunk = chunks[chunks.length - 1];
      if (lastChunk.length + chunk.length <= maxLength + overlap) { // Allow some flexibility
        chunks[chunks.length - 1] += chunk;
        startIndex = endIndex; // Move past this small chunk
        continue;
      }
    }
    
    if (chunk.length >= MIN_CHUNK_CHARS) {
         chunks.push(chunk);
    } else if (chunks.length === 0 && chunk.length > 0) {
        // If it's the only chunk and it's too small but not empty, keep it.
        chunks.push(chunk);
    }


    if (endIndex === text.length) {
      break; // Reached the end of the text
    }
    startIndex += (maxLength - overlap);
    if (startIndex >= text.length) break; // Ensure we don't go into an infinite loop if overlap is too large
  }
  return chunks.filter(c => c.length > 0);
}

// --- Main Chunking Functions ---

/**
 * Splits note content into manageable chunks.
 *
 * Prioritizes splitting by Markdown headings (H1-H6). Within sections defined by
 * headings (or the whole content if no headings), it splits by paragraphs.
 * Long paragraphs are further split by sentences, and very long sentences are
 * split into fixed-length segments with overlap.
 *
 * @param noteInput - The note data to be chunked.
 * @returns An array of `NoteChunk` objects.
 */
export function chunkNoteContent(noteInput: NoteInputForChunking): NoteChunk[] {
  const { id: parentId, content, title: parentTitle, url: originalUrl, tags: originalTags } = noteInput;
  const chunks: NoteChunk[] = [];
  let chunkIndex = 0;

  if (!content || content.trim().length < MIN_CHUNK_CHARS) {
    if (content && content.trim().length > 0) { // Keep if there's some content, even if small
       chunks.push({
        id: `notechunk_${parentId}_${chunkIndex++}`,
        parentId,
        content: content.trim(),
        charCount: content.trim().length,
        headingPath: [],
        originalUrl,
        originalTags,
        parentTitle,
      });
    }
    return chunks;
  }

  // Regex to find Markdown headings (H1-H6)
  // It captures the heading level (number of #), the heading text, and the content after it until the next heading or end of string.
  const headingRegex = /^(#{1,6})\s+(.+?)\s*$/gm;
  let lastIndex = 0;
  let match;
  const sections: Array<{ text: string; headingPath: string[] }> = [];
  let currentHeadingPath: string[] = [];

  // First, split by H1, then H2, etc., to build a path. This is complex.
  // Simpler approach: split by any heading, content before first heading is top level.
  
  let contentRemainder = content;
  const headingMatches: Array<{level: number, text: string, startIndex: number}> = [];
  while((match = headingRegex.exec(content)) !== null) {
    headingMatches.push({
        level: match[1].length,
        text: match[2].trim(),
        startIndex: match.index
    });
  }

  if (headingMatches.length === 0) {
    // No headings, treat the whole content as one section
    sections.push({ text: content, headingPath: [] });
  } else {
    // Content before the first heading
    if (headingMatches[0].startIndex > 0) {
      sections.push({
        text: content.substring(0, headingMatches[0].startIndex).trim(),
        headingPath: [],
      });
    }

    // Process content between headings
    for (let i = 0; i < headingMatches.length; i++) {
      const currentMatch = headingMatches[i];
      const nextMatch = headingMatches[i+1];
      
      const sectionStartIndex = currentMatch.startIndex + content.substring(currentMatch.startIndex).indexOf(currentMatch.text) + currentMatch.text.length;
      // Find the start of content for this heading, skipping the heading line itself
      let sectionContentStart = content.indexOf('\n', currentMatch.startIndex);
      if (sectionContentStart === -1) sectionContentStart = currentMatch.startIndex + currentMatch.text.length + currentMatch.level +1; // Approx
      else sectionContentStart +=1;


      const sectionEndIndex = nextMatch ? nextMatch.startIndex : content.length;
      const sectionText = content.substring(sectionContentStart, sectionEndIndex).trim();
      
      // Update currentHeadingPath based on level
      // This is a simplified way to manage heading hierarchy. A proper stack-based approach would be more robust for deep nesting.
      currentHeadingPath = currentHeadingPath.slice(0, currentMatch.level -1);
      currentHeadingPath.push(currentMatch.text);

      if (sectionText.length > 0) {
        sections.push({
          text: sectionText,
          headingPath: [...currentHeadingPath], // Copy path
        });
      }
    }
  }


  // Process each section (either whole content or content under a heading)
  for (const section of sections) {
    const paragraphs = section.text.split(/\n\s*\n+/).map(p => p.trim()).filter(p => p.length > 0);

    for (const paragraph of paragraphs) {
      if (paragraph.length < MIN_CHUNK_CHARS && chunks.length > 0) {
         // If paragraph is too small, try to merge with the previous chunk from THIS section
         const lastChunk = chunks[chunks.length -1];
         // Ensure it's from the same heading path and doesn't become too large
         if (JSON.stringify(lastChunk.headingPath) === JSON.stringify(section.headingPath) && 
             (lastChunk.content.length + paragraph.length + 1) <= MAX_PARAGRAPH_CHARS) {
            lastChunk.content += "\n" + paragraph;
            lastChunk.charCount = lastChunk.content.length;
            continue;
         }
      }


      if (paragraph.length <= MAX_PARAGRAPH_CHARS) {
        if (paragraph.length >= MIN_CHUNK_CHARS) {
          chunks.push({
            id: `notechunk_${parentId}_${chunkIndex++}`,
            parentId,
            content: paragraph,
            charCount: paragraph.length,
            headingPath: section.headingPath.length > 0 ? [...section.headingPath] : undefined,
            originalUrl,
            originalTags,
            parentTitle,
          });
        } else if (paragraph.length > 0 && chunks.length === 0 && sections.length === 1 && paragraphs.length === 1) {
            // If it's the only piece of content and very small, keep it
             chunks.push({
                id: `notechunk_${parentId}_${chunkIndex++}`,
                parentId,
                content: paragraph,
                charCount: paragraph.length,
                headingPath: section.headingPath.length > 0 ? [...section.headingPath] : undefined,
                originalUrl,
                originalTags,
                parentTitle,
            });
        }
      } else {
        // Paragraph is too long, split by sentences
        const sentences = splitTextBySentences(paragraph);
        let sentenceBuffer = "";

        for (const sentence of sentences) {
          if (sentence.length <= TARGET_SUB_CHUNK_CHARS) {
            if ((sentenceBuffer + sentence).length <= TARGET_SUB_CHUNK_CHARS || sentenceBuffer.length < MIN_CHUNK_CHARS ) {
                 sentenceBuffer += (sentenceBuffer ? " " : "") + sentence;
            } else {
                if (sentenceBuffer.length >= MIN_CHUNK_CHARS) {
                    chunks.push({
                        id: `notechunk_${parentId}_${chunkIndex++}`,
                        parentId,
                        content: sentenceBuffer,
                        charCount: sentenceBuffer.length,
                        headingPath: section.headingPath.length > 0 ? [...section.headingPath] : undefined,
                        originalUrl,
                        originalTags,
                        parentTitle,
                    });
                }
                sentenceBuffer = sentence; // Start new buffer with current sentence
            }
          } else {
            // Sentence is still too long, flush buffer first
            if (sentenceBuffer.length >= MIN_CHUNK_CHARS) {
                 chunks.push({
                    id: `notechunk_${parentId}_${chunkIndex++}`,
                    parentId,
                    content: sentenceBuffer,
                    charCount: sentenceBuffer.length,
                    headingPath: section.headingPath.length > 0 ? [...section.headingPath] : undefined,
                    originalUrl,
                    originalTags,
                    parentTitle,
                });
            }
            sentenceBuffer = ""; // Reset buffer

            // Split this very long sentence with overlap
            const subChunks = splitTextWithOverlap(sentence, TARGET_SUB_CHUNK_CHARS, OVERLAP_CHARS);
            for (const subChunk of subChunks) {
              if (subChunk.length >= MIN_CHUNK_CHARS) {
                chunks.push({
                  id: `notechunk_${parentId}_${chunkIndex++}`,
                  parentId,
                  content: subChunk,
                  charCount: subChunk.length,
                  headingPath: section.headingPath.length > 0 ? [...section.headingPath] : undefined,
                  originalUrl,
                  originalTags,
                  parentTitle,
                });
              }
            }
          }
        }
        // Add any remaining content in sentenceBuffer
        if (sentenceBuffer.length >= MIN_CHUNK_CHARS) {
          chunks.push({
            id: `notechunk_${parentId}_${chunkIndex++}`,
            parentId,
            content: sentenceBuffer,
            charCount: sentenceBuffer.length,
            headingPath: section.headingPath.length > 0 ? [...section.headingPath] : undefined,
            originalUrl,
            originalTags,
            parentTitle,
          });
        }
      }
    }
  }
  
  // Final pass to handle very small trailing chunks.
  // If the last chunk is too small, try to merge it with the second to last.
  // If it cannot be merged (e.g., makes the second to last too large, or there's only one chunk),
  // and it's still too small, it should be removed, unless it's the *only* chunk resulting
  // from the entire processing of a small original input (which is handled by initial checks).
  if (chunks.length > 0) {
    const lastChunkIndex = chunks.length - 1;
    if (chunks[lastChunkIndex].content.length < MIN_CHUNK_CHARS) {
      if (chunks.length > 1) { // If there's more than one chunk, try to merge
        const secondLastChunkIndex = lastChunkIndex - 1;
        // Check if merging is feasible (doesn't exceed max paragraph size for the combined content)
        // and ensure they are from the same logical section if possible (implicit here, as it's just sequential chunks)
        if ((chunks[secondLastChunkIndex].content.length + chunks[lastChunkIndex].content.length + 1) <= MAX_PARAGRAPH_CHARS) {
          chunks[secondLastChunkIndex].content += "\n" + chunks[lastChunkIndex].content;
          chunks[secondLastChunkIndex].charCount = chunks[secondLastChunkIndex].content.length;
          chunks.pop(); // Remove the merged small last chunk
        } else {
          // Cannot merge, so discard the small last chunk as it doesn't meet MIN_CHUNK_CHARS
          chunks.pop();
        }
      } else {
        // Only one chunk remains, and it's smaller than MIN_CHUNK_CHARS.
        // This case should ideally be covered by the initial check:
        // `if (!content || content.trim().length < MIN_CHUNK_CHARS)`
        // which keeps a single small chunk if it's the *entire* original content.
        // If processing somehow resulted in a single chunk that's too small (e.g. after filtering all else),
        // it should be discarded to adhere to MIN_CHUNK_CHARS for derived chunks.
        // However, the initial check `if (content && content.trim().length > 0)` inside the very first `if`
        // block of `chunkNoteContent` already ensures that if the *entire input* is small but non-empty,
        // it's preserved. So, if we end up here with one tiny chunk, it's likely a remnant that should go.
        chunks.pop();
      }
    }
  }


  return chunks;
}

/**
 * Performs light cleaning on text intended for embedding.
 * Currently, this function is a placeholder for any future light cleaning steps.
 * The primary goal is to preserve as much semantic content as possible,
 * so we avoid aggressive cleaning like stop word removal or stemming.
 * @param text The text to clean.
 * @returns The cleaned text.
 */
export function preprocessForEmbeddings(text: string): string {
  let nlpUtils: any;
  nlpUtils = require('wink-nlp-utils');

  let cleanedText = nlpUtils.string.removeHTMLTags(text);
  // Remove Markdown syntax
  // cleanedText = cleanedText.replace(/([_*~`#\[\]()>.-])/g, '');
  // Trim whitespace
  cleanedText = nlpUtils.string.removeExtraSpaces(cleanedText);

  return cleanedText;
}

/**
 * Splits chat message turns into individual chunks.
 *
 * Each turn's content (if not empty and meets `MIN_CHUNK_CHARS`) becomes a
 * separate chunk. Individual chat turns are not sub-split further by this function.
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
