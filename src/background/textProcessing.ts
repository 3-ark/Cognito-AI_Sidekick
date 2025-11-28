/**
 * @file Provides text processing functions for preparing text for different RAG pipelines.
 */

import stopwords from 'stopwords-iso';
import * as winkLemmatizer from 'wink-lemmatizer';
import { ApiMessage } from '../types/chatTypes';
import { getCompletion } from './generationUtils';
// --- Language Detection & Stopwords ---

// Cache for stopword sets to avoid rebuilding them constantly
const stopwordCache: { [lang: string]: Set<string> } = {};

/**
 * Retrieves the stopword set for a given language code.
 * @param lang The ISO 639-1 language code (e.g., 'en', 'es', 'zh').
 */
function getStopwords(lang: string): Set<string> {
    if (stopwordCache[lang]) {
        return stopwordCache[lang];
    }
    const list = (stopwords as any)[lang] || [];
    const set = new Set<string>(list);
    stopwordCache[lang] = set;
    return set;
}

/**
 * Simple heuristic to detect language based on script and stopword density.
 * Defaults to 'en' if unsure.
 */
function detectLanguage(text: string): string {
    if (!text) return 'en';

    // 1. Check for CJK scripts
    const cjkCount = (text.match(/[\u3040-\u30FF\u4E00-\u9FAF\u3400-\u4DBF\uAC00-\uD7A3]/g) || []).length;
    if (cjkCount > text.length * 0.2) {
        // Simple disambiguation between Chinese, Japanese, Korean could go here.
        // For now, if it looks CJK, we might default to 'zh' or 'ja' or just return 'cjk' 
        // effectively to skip English stopwords.
        // Let's try to be slightly more specific.
        const kanaCount = (text.match(/[\u3040-\u30FF]/g) || []).length;
        const hangulCount = (text.match(/[\uAC00-\uD7A3]/g) || []).length;
        if (hangulCount > cjkCount * 0.5) return 'ko';
        if (kanaCount > 0) return 'ja';
        return 'zh';
    }

    // 2. Check for Latin-based languages using stopword density
    // We check a few common languages.
    const candidates = ['en', 'es', 'fr', 'de', 'it', 'pt'];
    let bestLang = 'en';
    let maxMatches = 0;

    const tokens = text.toLowerCase().match(/\b\p{L}+\b/gu) || [];
    if (tokens.length === 0) return 'en';

    // Optimization: check only the first 50 tokens to speed up
    const sampleTokens = tokens.slice(0, 50);

    for (const lang of candidates) {
        const set = getStopwords(lang);
        let matches = 0;
        for (const token of sampleTokens) {
            if (set.has(token)) matches++;
        }
        if (matches > maxMatches) {
            maxMatches = matches;
            bestLang = lang;
        }
    }

    return bestLang;
}

// --- Text Processing ---

/**
 * Performs an "aggressive" processing of text, suitable for lexical search algorithms like BM25.
 * This pipeline includes:
 * 1. Lowercasing the text.
 * 2. Tokenizing using Intl.Segmenter for robust multilingual support.
 * 3. Removing language-specific stop words.
 * 4. Applying stemming (currently English-only via wink-lemmatizer).
 *
 * @param text The raw input string to process.
 * @returns An array of processed (stemmed, stop words removed) tokens.
 */
export function lexicalProcessText(text: string): string[] {
    if (!text || typeof text !== 'string') {
        return [];
    }

    // 1. Detect language
    const lang = detectLanguage(text);
    const stopWords = getStopwords(lang);

    // 2. Lowercase
    const lowercasedText = text.toLowerCase();

    // 3. Tokenize using Intl.Segmenter
    // 'granularity: word' is what we want for BM25
    const segmenter = new Intl.Segmenter(lang, { granularity: 'word' });
    const segments = segmenter.segment(lowercasedText);

    const processedTokens: string[] = [];

    for (const segment of segments) {
        // segment.isWordLike is true for words, false for punctuation/spaces
        if (!segment.isWordLike) continue;

        const token = segment.segment;
        // HARD FILTER punctuation
        if (!/[\p{L}\p{N}]/u.test(token)) continue;
        // 4. Remove Stopwords (Context-Aware)
        if (stopWords.has(token)) {
            continue;
        }

        // 5. Stemming / Lemmatization
        // Currently only applying to English to avoid heavy dependencies for other languages.
        if (lang === 'en' && /^[a-z]+$/.test(token)) {
            try {
                let lemmatizedToken = winkLemmatizer.noun(token);
                if (lemmatizedToken === token) {
                    lemmatizedToken = winkLemmatizer.verb(token);
                }
                if (lemmatizedToken === token) {
                    lemmatizedToken = winkLemmatizer.adjective(token);
                }
                processedTokens.push(lemmatizedToken);
            } catch (e) {
                // console.warn(`Lemmatizer failed for token: "${token}"`, e);
                processedTokens.push(token);
            }
        } else {
            // For other languages, push the raw token (lowercased)
            processedTokens.push(token);
        }
    }

    return processedTokens;
}

/**
 * Performs a "gentle" processing of text, suitable for display or semantic embedding.
 * Preserves most content but normalizes whitespace and removes noise.
 */
export function gentleProcessText(text: string): string {
    if (!text || typeof text !== 'string') {
        return '';
    }

    let cleanedText = text;

    // Remove invisible Unicode noise.
    cleanedText = cleanedText.replace(/[\u200B-\u200D\uFEFF\u00AD\u2060\u202A-\u202E]/g, '');

    // Replace image markdown (with or without title) with alt text.
    cleanedText = cleanedText.replace(/!\[(.*?)\]\([^)"']+(?:["'][^"']*["'])?\)/g, '$1');

    // Remove HTML comments.
    cleanedText = cleanedText.replace(/<!--[\s\S]*?-->/g, '');

    // Decode common HTML entities.
    cleanedText = cleanedText
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

    // Normalize smart quotes and dashes.
    cleanedText = cleanedText
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/[–—]/g, '-');

    // Remove duplicate punctuation (e.g. "!!!" → "!").
    cleanedText = cleanedText.replace(/([.!?])\1+/g, '$1');

    // Collapse all whitespace.
    cleanedText = cleanedText.replace(/\s+/g, ' ').trim();

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
