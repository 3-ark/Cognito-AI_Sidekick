/**
 * @file Provides utility functions for splitting note and chat message content into manageable chunks.
 * This version incorporates a more robust, multi-stage chunking architecture.
 */

import { getStoredAppSettings } from './storageUtil';
import { lexicalProcessText as cleanMarkdownForSemantics, generateContextualSummary } from './textProcessing';
import { Config, RagConfig } from '../types/config';
import {
  NoteInputForChunking,
  NoteChunk,
  ChatMessageInputForChunking,
  ChunkingResult,
} from '../types/chunkTypes';

function splitTextWithOverlap(
    text: string,
    parentId: string,
    ragConfig: RagConfig,
    chunkTypePrefix: 'textsubchunk' | 'jsonsubchunk' = 'textsubchunk',
    chunkIndexOffset: number = 0,
): Array<{ content: string, id: string, charCount: number }> {
  const chunks: Array<{ content: string, id: string, charCount: number }> = [];
   if (!text || text.trim().length === 0) return chunks;

  const minChunkChars = ragConfig.minChunkChars ?? 150;
  const overlap = ragConfig.overlapChars ?? 50;
  const maxLength = ragConfig.maxChunkChars ?? 2000;

  if (text.length <= maxLength && text.length >= minChunkChars) {
    chunks.push({ content: text, id: `${chunkTypePrefix}_${parentId}_${chunkIndexOffset}`, charCount: text.length });
    return chunks;
  }

  let startIndex = 0;
  let internalChunkIndex = 0;
  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + maxLength, text.length);
    let chunkContent = text.substring(startIndex, endIndex);

    if (chunkContent.length < minChunkChars && chunks.length > 0) {
      const lastChunk = chunks[chunks.length - 1];
      if (lastChunk.content.length + chunkContent.length <= maxLength + overlap) {
        chunks[chunks.length - 1].content += chunkContent;
        chunks[chunks.length - 1].charCount = chunks[chunks.length - 1].content.length;
        startIndex = endIndex;
        continue;
      }
    }
    
    if (chunkContent.length >= minChunkChars || (chunks.length === 0 && chunkContent.length > 0)) {
         chunks.push({
            content: chunkContent,
            id: `${chunkTypePrefix}_${parentId}_${chunkIndexOffset + internalChunkIndex}`,
            charCount: chunkContent.length
        });
        internalChunkIndex++;
    }

    if (endIndex === text.length) break;
    startIndex += (maxLength - overlap);
    if (startIndex >= text.length) break;
  }
  return chunks.filter(c => c.content.length > 0);
}


// --- Main Chunking Functions ---

/**
 * Splits note content into manageable, semantically coherent chunks using a robust
 * multi-stage process that includes a final cleanup pass to eliminate orphan chunks.
 */
export async function chunkNoteContent(noteInput: NoteInputForChunking, ragConfig: RagConfig): Promise<ChunkingResult> {
    const { id: parentId, content, title: parentTitle, url: originalUrl, tags: originalTags, description, lastUpdatedAt: parentLastUpdatedAt } = noteInput;
    const intermediateChunks: Omit<NoteChunk, 'id'>[] = [];

    // --- Stage 1: Prepare Metadata Header ---
    const createMetadataHeader = () => {
        const metadataHeader = [];
        if (parentTitle) metadataHeader.push(`Title: ${parentTitle}`);
        if (description) metadataHeader.push(`Description: ${description}`);
        return metadataHeader.length > 0 ? `${metadataHeader.join('\n')}\n---\n\n` : '';
    };
    const tagsHeader = originalTags && originalTags.length > 0 ? `Tags: ${originalTags.join(', ')}\n\n` : '';
    const metadataHeader = createMetadataHeader();

    const minChunkChars = ragConfig.minChunkChars ?? 150;
    const maxChunkChars = ragConfig.maxChunkChars ?? 2000;

    let processedContent = (content || '').replace(/<!--[\s\S]*?-->/g, '').trim();
    // Create a semantically clean version of the full text for the LLM summary context.
    // The `processedContent` variable retains the original markdown for structure-aware chunking.
    const fullDocumentTextForSummary = cleanMarkdownForSemantics(processedContent).join(' ');

    // --- Stage 2: Trivial Case Handling ---
    if (processedContent.length < minChunkChars) {
        if (processedContent.length > 0) {
            const finalContent = metadataHeader + processedContent;
            const chunks: NoteChunk[] = [{
                id: `notechunk_${parentId}_0`,
                parentId,
                content: finalContent,
                charCount: finalContent.length,
                parentTitle, originalUrl, originalTags, parentDescription: description,
                originalType: 'note',
                parentLastUpdatedAt,
            }];
            return { chunks, summariesGenerated: 0 };
        }
        return { chunks: [], summariesGenerated: 0 };
    }

    // --- Stage 3: Structure-Aware Splitting ---
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
    const headingMatches: Array<{ level: number, text: string, startIndex: number }> = [];
    let match;
    while ((match = headingRegex.exec(processedContent)) !== null) {
        headingMatches.push({ level: match[1].length, text: match[2].trim(), startIndex: match.index });
    }

    if (headingMatches.length === 0) {
        sections.push({ text: processedContent, headingPath: [] });
    } else {
        let currentHeadingPath: string[] = [];
        if (headingMatches[0].startIndex > 0) {
            sections.push({ text: processedContent.substring(0, headingMatches[0].startIndex).trim(), headingPath: [] });
        }
        for (let i = 0; i < headingMatches.length; i++) {
            const currentMatch = headingMatches[i];
            const nextMatch = headingMatches[i + 1];
            let sectionContentStart = processedContent.indexOf('\n', currentMatch.startIndex);
            if (sectionContentStart === -1) sectionContentStart = currentMatch.startIndex + currentMatch.text.length + currentMatch.level + 1;
            else sectionContentStart += 1;
            const sectionEndIndex = nextMatch ? nextMatch.startIndex : processedContent.length;
            const sectionText = processedContent.substring(sectionContentStart, sectionEndIndex).trim();
            currentHeadingPath = currentHeadingPath.slice(0, currentMatch.level - 1);
            currentHeadingPath.push(currentMatch.text);
            if (sectionText.length > 0) {
                sections.push({ text: sectionText, headingPath: [...currentHeadingPath] });
            }
        }
    }

    // --- Stage 4: Process Sections into Intermediate Chunks ---
    for (const section of sections) {
        const segments = section.text.split(/(__PLACEHOLDER_\w+_\d+__)/g).filter(s => s.trim());
        for (const segment of segments) {
            if (segment.startsWith('__PLACEHOLDER_')) {
                const content = extractedContent[segment];
                if (content) {
                    intermediateChunks.push({ parentId, content, charCount: content.length, headingPath: section.headingPath.length > 0 ? [...section.headingPath] : undefined, parentTitle, originalUrl, originalTags, parentDescription: description, originalType: 'note', parentLastUpdatedAt });
                }
            } else {
                const paragraphs = segment.split(/\n\s*\n+/).map(p => p.trim()).filter(p => p);
                let paragraphBuffer = "";
                for (const para of paragraphs) {
                    if (paragraphBuffer && (paragraphBuffer.length + para.length + 2) > maxChunkChars) {
                        intermediateChunks.push({ parentId, content: paragraphBuffer, charCount: paragraphBuffer.length, headingPath: section.headingPath.length > 0 ? [...section.headingPath] : undefined, parentTitle, originalUrl, originalTags, parentDescription: description, originalType: 'note', parentLastUpdatedAt });
                        paragraphBuffer = para;
                    } else {
                        paragraphBuffer += (paragraphBuffer ? "\n\n" : "") + para;
                    }
                }
                if (paragraphBuffer.length > 0) {
                    intermediateChunks.push({ parentId, content: paragraphBuffer, charCount: paragraphBuffer.length, headingPath: section.headingPath.length > 0 ? [...section.headingPath] : undefined, parentTitle, originalUrl, originalTags, parentDescription: description, originalType: 'note', parentLastUpdatedAt });
                }
            }
        }
    }

    // --- Stage 5A: Main Semantic Merge Pass ---
    if (intermediateChunks.length === 0) return { chunks: [], summariesGenerated: 0 };
    let combinedChunks: Omit<NoteChunk, 'id'>[] = [];
    if (intermediateChunks.length > 0) {
        let accumulator = { ...intermediateChunks[0] };
        for (let i = 1; i < intermediateChunks.length; i++) {
            const currentChunk = intermediateChunks[i];
            const accHeading = JSON.stringify(accumulator.headingPath || []);
            const currentHeading = JSON.stringify(currentChunk.headingPath || []);
            const endsWithColon = accumulator.content.trim().endsWith(':');
            const isTooSmall = accumulator.charCount < minChunkChars;
            const canBeMerged = (accumulator.content.length + currentChunk.content.length + 2) <= maxChunkChars;
            const isSameSection = accHeading === currentHeading;

            if ((endsWithColon || isTooSmall) && canBeMerged && isSameSection) {
                accumulator.content += "\n\n" + currentChunk.content;
                accumulator.charCount = accumulator.content.length;
            } else {
                combinedChunks.push(accumulator);
                accumulator = { ...currentChunk };
            }
        }
        combinedChunks.push(accumulator);
    }

    // --- Stage 5B: Improved, Two-Pass Cleanup for Orphans ---
    // This pass respects semantic boundaries (heading paths) during merges.

    // First pass: Try to merge small chunks FORWARD into the next chunk.
    const forwardMergedChunks: Omit<NoteChunk, 'id'>[] = [];
    if (combinedChunks.length > 0) {
        let i = 0;
        while (i < combinedChunks.length) {
            const currentChunk = combinedChunks[i];
            const nextChunk = (i + 1) < combinedChunks.length ? combinedChunks[i + 1] : null;

            if (currentChunk.charCount < minChunkChars && nextChunk) {
                const canMerge = (currentChunk.content.length + nextChunk.content.length + 2) <= maxChunkChars;
                const isSameSection = JSON.stringify(currentChunk.headingPath || []) === JSON.stringify(nextChunk.headingPath || []);

                if (canMerge && isSameSection) {
                    // Prepend the small chunk's content to the next one and discard the small one.
                    nextChunk.content = currentChunk.content + "\n\n" + nextChunk.content;
                    nextChunk.charCount = nextChunk.content.length;
                    i++; // Skip the current small chunk, as it's now merged into the next.
                    continue;
                }
            }
            forwardMergedChunks.push(currentChunk);
            i++;
        }
    }

    // Second pass: Try to merge any remaining small chunks BACKWARD into the previous one.
    const finalCombinedChunks: Omit<NoteChunk, 'id'>[] = [];
    for (const chunk of forwardMergedChunks) {
        const lastFinalChunk = finalCombinedChunks.length > 0 ? finalCombinedChunks[finalCombinedChunks.length - 1] : null;

        if (chunk.charCount < minChunkChars && lastFinalChunk) {
            const canMerge = (lastFinalChunk.content.length + chunk.content.length + 2) <= maxChunkChars;
            const isSameSection = JSON.stringify(lastFinalChunk.headingPath || []) === JSON.stringify(chunk.headingPath || []);

            if (canMerge && isSameSection) {
                // Append the small chunk's content to the previous one.
                lastFinalChunk.content += "\n\n" + chunk.content;
                lastFinalChunk.charCount = lastFinalChunk.content.length;
                continue; // Skip adding the orphan as a new chunk
            }
        }
        finalCombinedChunks.push(chunk);
    }


    // --- Stage 6: Finalize Chunks - Add IDs, Prepend Metadata, and Generate Summaries ---
    const appSettings = await getStoredAppSettings();
    const selectedModel = appSettings?.models?.find(m => m.id === appSettings.selectedModel);
    const contextLength = selectedModel?.context_length ?? 16384; // Default to 16k context if not found

    let summariesGenerated = 0;
    const processedChunks = await Promise.all(finalCombinedChunks
        .map(async (chunk, index) => {
            // Prepend tags to each chunk's content before cleaning.
            const contentWithTags = tagsHeader + chunk.content;
            const chunkContent = cleanMarkdownForSemantics(contentWithTags).join(' ');
            let chunkSummary: string | undefined;

            if (ragConfig.useContextualSummaries) {
                const summary = await generateContextualSummary(fullDocumentTextForSummary, chunkContent, contextLength);
                if (summary) {
                    chunkSummary = summary;
                    summariesGenerated++;
                }
            }

            // The final content for embedding includes metadata and the chunk's content (with tags).
            const finalContent = metadataHeader + chunkContent;
            return {
                ...chunk,
                id: `notechunk_${parentId}_${index}`,
                content: finalContent,
                summary: chunkSummary,
                charCount: finalContent.length,
            };
        }));

    const finalChunks = processedChunks.filter(c => c.charCount >= minChunkChars || (processedChunks.length === 1 && c.charCount > 0));

    return { chunks: finalChunks, summariesGenerated };
}

export function chunkJsonContent(jsonInput: NoteInputForChunking, ragConfig: RagConfig): ChunkingResult {
  const { id: parentId, content, title: parentTitle, url: originalUrl, tags: originalTags, description, lastUpdatedAt: parentLastUpdatedAt } = jsonInput;
  const finalChunks: NoteChunk[] = [];
  const minChunkChars = ragConfig.minChunkChars ?? 150;
  const maxChunkChars = ragConfig.maxChunkChars ?? 2000;
  const targetSubChunkChars = ragConfig.maxChunkChars ? Math.floor(ragConfig.maxChunkChars / 4) : 500;

  let globalChunkIndex = 0; // Used to ensure unique IDs across recursive calls

  let parsedJson: any;
  try {
    parsedJson = JSON.parse(content);
  } catch (error) {
    console.warn(`[chunkJsonContent] Failed to parse JSON for note ${parentId}. Content will be treated as plain text by chunkNoteContent if this was called from chunkNote.`);
    // Fallback: create a single chunk with the original content if it's a parse error
    // Or let chunkNote handle it by calling chunkNoteContent
     const rawErrorContent = `Error parsing JSON. Original content: ${content.substring(0, targetSubChunkChars)}...`;
     const cleanErrorContent = cleanMarkdownForSemantics(rawErrorContent).join(' ');
     const chunks: NoteChunk[] = [{
        id: `jsonchunk_${parentId}_error_${globalChunkIndex++}`,
        parentId,
        content: cleanErrorContent,
        charCount: content.length,
 metadata: { jsonPath: "$", error: "JSON parsing failed" },
        originalUrl,
        originalTags,
        parentTitle,
        parentDescription: description,
        originalType: 'json',
        parentLastUpdatedAt,
     }];
     return { chunks, summariesGenerated: 0 };
  }

  function traverseAndChunk(data: any, currentPath: string) {
    if (Array.isArray(data)) {
      data.forEach((item, index) => {
        traverseAndChunk(item, `${currentPath}[${index}]`);
      });
    } else if (typeof data === 'object' && data !== null) {
      const objectString = JSON.stringify(data, null, 2);
      if (objectString.length >= minChunkChars && objectString.length <= maxChunkChars) {
        const cleanContent = cleanMarkdownForSemantics(objectString).join(' ');
        finalChunks.push({
          id: `jsonchunk_${parentId}_${globalChunkIndex++}`,
          parentId,
          content: cleanContent,
          charCount: cleanContent.length,
          metadata: { jsonPath: currentPath }, // Corrected type for jsonPath
          originalUrl,
          originalTags,
          parentTitle,
          parentDescription: description,
          originalType: 'json',
          parentLastUpdatedAt,
        });
      } else if (objectString.length > maxChunkChars) {
        // Object is too big, traverse its keys if it's not an overly complex/deep object
        // For simplicity, we'll chunk its string representation if it's too large,
        // or one could choose to iterate keys as Gemini suggested.
        // Iterating keys can lead to very granular chunks.
        // Chunking the stringified large object might be more practical for some RAG.
        console.warn(`[chunkJsonContent] Large JSON object at path ${currentPath} (length: ${objectString.length}) will be stringified and sub-chunked.`);
        const subChunks = splitTextWithOverlap(objectString, parentId, ragConfig, 'jsonsubchunk', globalChunkIndex);
        subChunks.forEach(subChunk => {
           const cleanContent = cleanMarkdownForSemantics(subChunk.content).join(' ');
           finalChunks.push({
            id: subChunk.id, // ID from splitTextWithOverlap
            parentId,
            content: cleanContent,
            charCount: cleanContent.length,
            metadata: { jsonPath: currentPath, section: "text segment of large JSON object" },
            originalUrl,
            originalTags,
            parentTitle,
            parentDescription: description,
            originalType: 'json',
            parentLastUpdatedAt,
          });
        });
        globalChunkIndex += subChunks.length;
      }
      // If objectString.length < minChunkChars, it's too small to be a standalone chunk. Ignored.
      // unless it's a leaf node handled by the 'else if (data !== null...' part.
    } else if (typeof data === 'string') {
      if (data.length >= minChunkChars && data.length <= targetSubChunkChars) { // Good size string
        const cleanContent = cleanMarkdownForSemantics(data).join(' ');
        finalChunks.push({
          id: `jsonchunk_${parentId}_${globalChunkIndex++}`,
          parentId,
          content: cleanContent,
          charCount: cleanContent.length,
          metadata: { jsonPath: currentPath },
          originalUrl,
          originalTags,
          parentTitle,
          parentDescription: description,
          originalType: 'json',
          parentLastUpdatedAt,
        });
      } else if (data.length > targetSubChunkChars) { // Long string
        const subChunks = splitTextWithOverlap(data, parentId, ragConfig, 'jsonsubchunk', globalChunkIndex);
        subChunks.forEach(subChunk => {
          const cleanContent = cleanMarkdownForSemantics(subChunk.content).join(' ');
          finalChunks.push({
            id: subChunk.id,
            parentId,
            content: cleanContent,
            charCount: cleanContent.length,
            metadata: { jsonPath: currentPath, section: "text segment" },
            originalUrl,
            originalTags,
            parentTitle,
            parentDescription: description,
            originalType: 'json',
            parentLastUpdatedAt,
          });
        });
        globalChunkIndex += subChunks.length;
      }
      // Strings smaller than minChunkChars are ignored unless part of a larger structure handled above.
    } else if (data !== null && typeof data !== 'undefined') { // Other primitives (number, boolean)
      const contentStr = data.toString();
      if (contentStr.length >= minChunkChars) {
         const cleanContent = cleanMarkdownForSemantics(contentStr).join(' ');
         finalChunks.push({
            id: `jsonchunk_${parentId}_${globalChunkIndex++}`,
            parentId,
            content: cleanContent,
            charCount: cleanContent.length,
            metadata: { jsonPath: currentPath },
            originalUrl,
            originalTags,
            parentTitle,
            parentDescription: description,
            originalType: 'json',
            parentLastUpdatedAt,
          });
      }
    }
  }

  traverseAndChunk(parsedJson, '$');
  const chunks = finalChunks.filter(c => c.charCount >= minChunkChars || finalChunks.length === 1 && c.charCount > 0);
  return { chunks, summariesGenerated: 0 }; // No summaries for JSON content
}


/**
 * Helper to detect if a string is likely JSON.
 */
function isLikelyJson(text: string): boolean {
  const trimmed = text.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
}

export async function chunkNote(noteInput: NoteInputForChunking, ragConfig: RagConfig): Promise<ChunkingResult> {
  const { content } = noteInput;
  if (!content || content.trim() === '') return { chunks: [], summariesGenerated: 0 };
  if (isLikelyJson(content)) {
    console.log(`[chunkNote] Note ${noteInput.id} detected as JSON. Using JSON chunker.`);
    // chunkJsonContent now returns a ChunkingResult, but it will have 0 summaries.
    return chunkJsonContent(noteInput, ragConfig);
  } else {
    return await chunkNoteContent(noteInput, ragConfig);
  }
}

export function chunkChatMessage(messageInput: ChatMessageInputForChunking): NoteChunk[] {
    const { id: parentId, content, parentTitle, conversationId, lastUpdatedAt: parentLastUpdatedAt, messageLastUpdatedAt } = messageInput;
    const chunks: NoteChunk[] = [];

    const processedContent = (content || '').trim();

    if (processedContent.length === 0) {
        return [];
    }

    // Create a single chunk for the given content, regardless of length.
    // The grouping of conversational turns is now handled in embeddingManager.
    const cleanContent = cleanMarkdownForSemantics(processedContent).join(' ');
    if (cleanContent.length > 0) {
        chunks.push({
            id: `msgchunk_${parentId}_0`, // Always index 0 as it's one chunk per call
            parentId: parentId,
            content: cleanContent,
            charCount: cleanContent.length,
            parentTitle,
            originalType: 'chat',
            metadata: {
                conversationId: conversationId,
                messageLastUpdatedAt: messageLastUpdatedAt,
            },
            parentLastUpdatedAt,
        });
    }

    return chunks;
}
