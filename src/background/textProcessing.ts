/**
 * @file Provides text processing functions for preparing text for different RAG pipelines.
 */

import { stem } from 'porter2';
import TinySegmenter from 'tiny-segmenter';

import { getCompletion } from './generationUtils';
import { ENGLISH_STOP_WORDS } from './stopWords';
import { ApiMessage } from '../types/chatTypes';

// Instantiate the segmenter once to be reused.
const segmenter = new TinySegmenter();

/**
 * Performs an "aggressive" processing of text, suitable for lexical search algorithms like BM25.
 * This pipeline includes:
 * 1. Lowercasing the text.
 * 2. Tokenizing by splitting on non-alphanumeric characters.
 * 3. Removing common English stop words.
 * 4. Applying Porter2 stemming to the remaining tokens.
 *
 * @param text The raw input string to process.
 * @returns An array of processed (stemmed, stop words removed) tokens.
 */
export function aggressiveProcessText(text: string): string[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  // 1. Lowercase the text for consistent processing
  const lowercasedText = text.toLowerCase();

  // 2. Perform language-specific tokenization based on script detection.
  let tokens: string[];

  // Count characters from major scripts to determine the dominant one.
  const cjkChars = (lowercasedText.match(/[\u3040-\u30FF\u4E00-\u9FAF\u3400-\u4DBF]/g) || []).length;
  const koreanChars = (lowercasedText.match(/[\uAC00-\uD7A3]/g) || []).length;

  // A simple heuristic for latin-based chars, assuming they are the most common.
  // This is not perfect, but better than the previous implementation.
  const latinChars = (lowercasedText.match(/[a-z0-9\u0400-\u04FF]/g) || []).length;

  // Simple majority rule for script detection.
  // This is a much more robust approach than the previous one, which could be
  // triggered by a single character.
  if (cjkChars > koreanChars && cjkChars > latinChars) {
    // Japanese/Chinese tokenization
    tokens = segmenter.segment(lowercasedText);
  } else if (koreanChars > cjkChars && koreanChars > latinChars) {
    // Korean tokenization
    // This is a simplistic approach. A proper Korean tokenizer would be better,
    // but for now, we will just split by character and remove whitespace.
    tokens = lowercasedText.replace(/\s/g, '').split('');
  } else {
    // Default to Latin/Cyrillic if it's the majority or in case of a tie.
    // This is the most common case for users of this extension.
    tokens = lowercasedText.split(/[^a-z0-9\u0400-\u04FF]+/).filter(Boolean);
  }

  const processedTokens: string[] = [];

  for (const token of tokens) {
    if (!token || token.length === 0) {
      continue;
    }

    // 3. Remove stop words (currently only English)
    if (ENGLISH_STOP_WORDS.has(token)) {
      continue;
    }

    // 4. Apply Porter2 stemming only to Latin-based tokens
    // This avoids trying to stem characters from other languages.
    if (/^[a-z0-9]+$/.test(token)) {
      try {
        const stemmedToken = stem(token);

        processedTokens.push(stemmedToken);
      } catch (e) {
        console.warn(`Stemmer failed for token: "${token}"`, e);
        processedTokens.push(token);
      }
    } else {
      // For non-Latin tokens (like Japanese, Korean, Cyrillic), push them as is.
      processedTokens.push(token);
    }
  }

  return processedTokens;
}

/**
 * Cleans a string by removing common Markdown and HTML syntax.
 * This is intended for preparing text for semantic processing (embeddings, LLM context)
 * where the semantic meaning should be preserved without formatting artifacts.
 *
 * @param text The input string, potentially containing Markdown or HTML.
 * @returns A cleaned, plain text string.
 */
export function cleanMarkdownForSemantics(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let cleanedText = text;

  // Remove HTML tags
  cleanedText = cleanedText.replace(/<[^>]*>/g, ' ');

  // Remove Markdown images, keeping the alt text
  // This must be done before link removal to avoid leftover '!'
  cleanedText = cleanedText.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');

  // Remove Markdown links, keeping the link text
  cleanedText = cleanedText.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove Markdown headings, keeping the text
  cleanedText = cleanedText.replace(/^#{1,6}\s+/gm, '');

  // Remove bold, italics, and strikethrough
  cleanedText = cleanedText.replace(/(\*\*|__|\*|_|~~)(.*?)\1/g, '$2');

  // Remove code blocks (```...```)
  cleanedText = cleanedText.replace(/```[\s\S]*?```/g, '');

  // Remove inline code backticks
  cleanedText = cleanedText.replace(/`([^`]+)`/g, '$1');

  // Remove blockquotes
  cleanedText = cleanedText.replace(/^\s*>\s?/gm, '');

  // Remove horizontal rules
  cleanedText = cleanedText.replace(/^\s*[-*_]{3,}\s*$/gm, '');
  
  // Remove HTML entities
  cleanedText = cleanedText.replace(/&[a-zA-Z#0-9]+;/g, ' ');

  // Replace multiple newlines and spaces with a single space
  cleanedText = cleanedText.replace(/\s\s+/g, ' ').trim();

  return cleanedText;
}

/**
 * Generates a contextual summary for a chunk of text based on the full document content.
 * This function communicates with a large language model to create a concise summary
 * that helps to situate the chunk within the broader context of the document.
 *
 * @param fullDocumentText The entire text of the document.
 * @param chunkContent The specific chunk of text that needs a contextual summary.
 * @returns A promise that resolves to the generated contextual summary.
 */
export async function generateContextualSummary(
  fullDocumentText: string,
  chunkContent: string,
  contextLength: number,
): Promise<string> {
  // Rough approximation: 1 token ~ 4 characters. This is a common heuristic.
  const CHARS_PER_TOKEN = 4;

  // Leave a buffer for the model's response and any overhead.
  const RESPONSE_BUFFER_TOKENS = 512;
  const maxTokensForPrompt = contextLength - RESPONSE_BUFFER_TOKENS;
  const maxCharsForPrompt = maxTokensForPrompt * CHARS_PER_TOKEN;

  const promptTemplate = `
    <document>
    __DOCUMENT_PLACEHOLDER__
    </document>
    Here is the chunk we want to situate within the whole document
    <chunk>
    ${chunkContent}
    </chunk>
    Please give a short succinct context to situate this chunk within the overall document for the purposes of improving search retrieval of the chunk. Answer only with the succinct context and nothing else.
  `;

  // Calculate the character budget for the document context placeholder.
  const templateChars = promptTemplate.replace('__DOCUMENT_PLACEHOLDER__', '').length;
  const maxCharsForDocument = maxCharsForPrompt - templateChars;

  let documentForPrompt = fullDocumentText;

  // Truncate the document text if it exceeds the available space.
  if (fullDocumentText.length > maxCharsForDocument) {
    console.warn(`[generateContextualSummary] Document text is too long (${fullDocumentText.length} chars) for the context window (${contextLength} tokens). Truncating.`);
    const chunkStartIndex = fullDocumentText.indexOf(chunkContent);

    if (chunkStartIndex === -1) {
      // Fallback if chunk is not found: just truncate the document from the beginning.
      documentForPrompt = fullDocumentText.substring(0, maxCharsForDocument) + '...';
    } else {
      // To avoid duplicating the chunk content, we construct the context from the
      // text *before* and *after* the chunk.
      const textBeforeChunk = fullDocumentText.substring(0, chunkStartIndex);
      const textAfterChunk = fullDocumentText.substring(chunkStartIndex + chunkContent.length);

      const availableChars = maxCharsForDocument;
      const charsFromBefore = Math.floor(availableChars / 2);
      const charsFromAfter = availableChars - charsFromBefore;

      let contextBefore = textBeforeChunk.slice(-charsFromBefore);
      let contextAfter = textAfterChunk.substring(0, charsFromAfter);

      if (contextBefore.length < textBeforeChunk.length) {
        contextBefore = '...' + contextBefore;
      }
      if (contextAfter.length < textAfterChunk.length) {
        contextAfter = contextAfter + '...';
      }

      // The document placeholder is filled with the context surrounding the original chunk location.
      documentForPrompt = `${contextBefore}\n\n[...chunk content omitted...]\n\n${contextAfter}`;
    }
  }

  const finalPrompt = promptTemplate.replace('__DOCUMENT_PLACEHOLDER__', documentForPrompt);

  const messages: ApiMessage[] = [
    {
      role: 'user',
      content: finalPrompt,
    },
  ];

  const summary = await getCompletion(messages);
  return summary.trim();
}
