import {
  engineInitializationPromise,
  search as bm25Search, // Alias for the BM25 search
  RawBM25SearchResult, // Type for BM25 results
} from './searchUtils';
import storage from './storageUtil';
import type { Config } from '../types/config';
import localforage from 'localforage';
import { 
  NOTE_CHUNK_TEXT_PREFIX, 
  getNoteByIdFromSystem,
  NOTE_STORAGE_PREFIX
} from './noteStorage';
import { 
  CHAT_CHUNK_TEXT_PREFIX, 
  getChatMessageById,
  CHAT_STORAGE_PREFIX,
  type ChatMessage // Import type ChatMessage
} from './chatHistoryStorage';
import { generateEmbedding } from './embeddingUtils';
import { findSimilarChunks, parseChunkId } from './semanticSearchUtils';
import type { Note } from '../types/noteTypes'; // Import type Note
import type { NoteChunk, ChatChunk } from '../types/chunkTypes'; // Import type Chunk
/**
 * Fetches all chunk texts for a given parent document (note or chat).
 * @param parentId The ID of the parent note or chat.
 * @param parentType The type of the parent ('note' or 'chat').
 * @returns A promise that resolves to an array of objects, each containing a chunkId and its text.
 */
export async function getChunkTextsForParent(
  parentId: string,
  parentType: 'note' | 'chat'
): Promise<Array<{ chunkId: string; chunkText: string }>> {
  const chunkTexts: Array<{ chunkId: string; chunkText: string }> = [];
  if (!parentId || !parentType) {
    console.warn('[getChunkTextsForParent] parentId or parentType is missing.');
    return chunkTexts;
  }

  const prefix = parentType === 'note' ? NOTE_CHUNK_TEXT_PREFIX : CHAT_CHUNK_TEXT_PREFIX;
  
  try {
    const keys = await localforage.keys();
    const relevantKeys = keys.filter(key => 
      key.startsWith(prefix) && key.includes(`_${parentId}_`) // Ensure it's for the specific parent
    );

    for (const key of relevantKeys) {
      const chunkText = await localforage.getItem<string>(key);
      if (typeof chunkText === 'string') {
        // The key is `notechunktext_<chunkId>` or `chatchunktext_<chunkId>`
        // The actual chunkId is the part after the prefix.
        const chunkId = key.substring(prefix.length);
        chunkTexts.push({ chunkId, chunkText });
      } else {
        console.warn(`[getChunkTextsForParent] No valid text found for key: ${key}`);
      }
    }
  } catch (error) {
    console.error(`[getChunkTextsForParent] Error fetching chunk texts for parent ${parentId} (${parentType}):`, error);
  }
  return chunkTexts;
}

/**
 * Normalizes an array of scores (e.g., BM25 or semantic scores) to a 0-1 range using min-max scaling.
 * @param itemsWithScores An array of objects, each having an 'id' and a 'score'.
 * @returns An array of objects with the same 'id's and normalized 'score's.
 *          Returns an empty array if input is empty.
 *          If all scores are the same, all normalized scores will be 1 (or 0 if min === max === 0).
 */
export function normalizeScores(
    itemsWithScores: Array<{ id: string | number; score: number; [key: string]: any }>
): Array<{ id: string | number; score: number; [key: string]: any }> {
    if (!itemsWithScores || itemsWithScores.length === 0) {
        return [];
    }

    if (itemsWithScores.length === 0) {
        console.warn('[normalizeScores] Input array is empty. Returning an empty array.');
        // Consider returning an empty array or throwing an error, depending on how
        // you want to handle this edge case.  Returning empty is a safe default.

        return [];
    }

    const scores = itemsWithScores.map(item => item.score);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);

    if (minScore === maxScore) {
        // If all scores are the same, normalize them all to 1 (if >0) or 0 (if 0 or <0)
        // This handles the case where there's only one item, or all items have identical scores.
        const uniformScore = maxScore > 0 ? 1 : 0; // Or just 1, if scores can't be <=0
        return itemsWithScores.map(item => ({ ...item, score: uniformScore }));
    }

    return itemsWithScores.map(item => ({
        ...item,
        score: (item.score - minScore) / (maxScore - minScore),
    }));
}

// Define a more detailed type for the items returned by getHybridRankedChunks
export interface HybridRankedChunk {
  chunkId: string;
  parentId: string;
  parentType: 'note' | 'chat';
  hybridScore: number;
  chunkText: string;
  // Parent metadata
  parentTitle?: string;
  originalUrl?: string; // For notes
  originalTags?: string[]; // For notes
  // Chunk-specific metadata (examples)
  role?: string; // For chat chunks
  timestamp?: number; // For chat chunks
  headingPath?: string[]; // For note chunks
  // Scores for debugging or further analysis (optional)
  normalizedSemanticScore?: number;
  normalizedBm25Score?: number;
}


/**
 * Performs hybrid retrieval (BM25 + Semantic) and reranks chunks.
 * @param query The search query string.
 * @param config The application configuration.
 * @returns A promise that resolves to an array of top-K reranked chunk objects.
 */
export async function getHybridRankedChunks(
  query: string,
  config: Config // Assuming Config type is imported from '../types/config'
): Promise<HybridRankedChunk[]> {
  await engineInitializationPromise; // Ensure BM25 engine is ready

  if (!query || query.trim() === "") {
    console.warn('[getHybridRankedChunks] Query is empty.');
    return [];
  }

  const ragConfig = config.rag || {};
  const bm25Config = ragConfig.bm25 || {};
  const semanticTopK = ragConfig.semantic_top_k ?? 10;
  const semanticThreshold = ragConfig.semantic_threshold ?? 0.1; // Lower threshold for initial semantic fetch
  const bm25TopKParents = bm25Config.topK ?? 10; // How many parent docs to fetch via BM25
  const bm25Weight = ragConfig.bm25_weight ?? 0.5;
  // Use the new final_top_k, fallback to semantic_top_k, then to a hardcoded default
  const finalTopK = ragConfig.final_top_k ?? ragConfig.semantic_top_k ?? 10; 

  // --- Step 1: Get Query Embedding ---
  const queryEmbedding = await generateEmbedding(query);
  if (!queryEmbedding || queryEmbedding.length === 0) {
    console.warn('[getHybridRankedChunks] Could not generate query embedding. Falling back to BM25 only (or empty).');
    // Decide fallback: for now, return empty if semantic search is crucial part of hybrid
    return []; 
  }

  // --- Step 2: Get Semantic Results ---
  let semanticChunks: Array<{ chunkId: string; parentId: string; parentType: 'note' | 'chat'; semanticScore: number }> = [];
  if (1 - bm25Weight > 0) { // Only perform semantic search if it has a weight
    semanticChunks = await findSimilarChunks(queryEmbedding, semanticTopK, semanticThreshold);
  }
  
  // --- Step 3: Get BM25 Results (Parent Documents) ---
  let bm25ParentResults: RawBM25SearchResult[] = [];
  if (bm25Weight > 0) { // Only perform BM25 if it has a weight
     bm25ParentResults = await bm25Search(query, bm25TopKParents);
  }

  // --- Step 4: Prepare Chunks from BM25 Results ---
  // This will hold chunkId, parentId, parentType, and the *parent's* BM25 score
  const bm25DerivedChunks: Array<{ chunkId: string; parentId: string; parentType: 'note' | 'chat'; bm25Score: number }> = [];
  if (bm25Weight > 0) {
    for (const [parentId, parentBm25Score] of bm25ParentResults) {
      const parsedParentId = parseChunkIdFromParent(parentId); // Helper to determine type from parent ID
      if (!parsedParentId) continue;

      const chunksFromParent = await getChunkTextsForParent(parsedParentId.id, parsedParentId.type);
      for (const chunk of chunksFromParent) {
        bm25DerivedChunks.push({
          chunkId: chunk.chunkId,
          parentId: parsedParentId.id,
          parentType: parsedParentId.type,
          bm25Score: parentBm25Score, // Assign parent's score to each of its chunks
        });
      }
    }
  }
  
  // --- Step 5: Normalize Scores ---
  // Normalize semantic scores
  const normalizedSemanticChunks = normalizeScores(
      semanticChunks.map(c => ({ id: c.chunkId, score: c.semanticScore, ...c }))
  ).map(c => ({ ...c, semanticScore: c.score })) as Array<{ // Explicit type assertion
      id: string;
      score: number;
      parentId: string;
      parentType: 'note' | 'chat';
      semanticScore: number;
      chunkId: string; // Add chunkId here
  }>;

  // Normalize BM25 scores (from bm25DerivedChunks)
  const normalizedBm25Chunks = normalizeScores(
      bm25DerivedChunks.map(c => ({ id: c.chunkId, score: c.bm25Score, ...c }))
  ).map(c => ({ ...c, bm25Score: c.score })) as Array<{ // Explicit type assertion
      id: string;
      score: number;
      parentId: string;
      parentType: 'note' | 'chat';
      bm25Score: number;
      chunkId: string; // Add chunkId here
  }>;


  // --- Step 6: Combine & Calculate Hybrid Scores ---
  const combinedChunksMap = new Map<string, {
    parentId: string;
    parentType: 'note' | 'chat';
    semanticScore?: number;
    bm25Score?: number;
  }>();

  normalizedSemanticChunks.forEach(chunk => {
    combinedChunksMap.set(chunk.chunkId, {
      parentId: chunk.parentId,
      parentType: chunk.parentType,
      semanticScore: chunk.semanticScore,
    });
  });

  normalizedBm25Chunks.forEach(chunk => {
    const existing = combinedChunksMap.get(chunk.chunkId);
    if (existing) {
      existing.bm25Score = chunk.bm25Score;
    } else {
      combinedChunksMap.set(chunk.chunkId, {
        parentId: chunk.parentId,
        parentType: chunk.parentType,
        bm25Score: chunk.bm25Score,
      });
    }
  });
  
  const hybridScoredChunks: Array<{ chunkId: string; parentId: string; parentType: 'note' | 'chat'; hybridScore: number, normalizedSemanticScore?: number, normalizedBm25Score?: number }> = [];
  combinedChunksMap.forEach((scores, chunkId) => {
    const normSemantic = scores.semanticScore ?? 0;
    const normBm25 = scores.bm25Score ?? 0;
    const hybridScore = (bm25Weight * normBm25) + ((1 - bm25Weight) * normSemantic);
    hybridScoredChunks.push({
      chunkId,
      parentId: scores.parentId,
      parentType: scores.parentType,
      hybridScore,
      normalizedSemanticScore: normSemantic,
      normalizedBm25Score: normBm25,
    });
  });

  // --- Step 7: Final Reranking & Top-K ---
  hybridScoredChunks.sort((a, b) => b.hybridScore - a.hybridScore);
  const topHybridChunks = hybridScoredChunks.slice(0, finalTopK);

  // --- Step 8: Fetch Chunk Texts & Metadata ---
  const finalResults: HybridRankedChunk[] = [];
  for (const hybridChunk of topHybridChunks) {
    let chunkText: string | null = null;
    const textKey = hybridChunk.parentType === 'note' 
      ? `${NOTE_CHUNK_TEXT_PREFIX}${hybridChunk.chunkId}` 
      : `${CHAT_CHUNK_TEXT_PREFIX}${hybridChunk.chunkId}`;
    
    chunkText = await localforage.getItem<string>(textKey);

    if (typeof chunkText !== 'string') {
      console.warn(`[getHybridRankedChunks] Could not fetch text for chunk ${hybridChunk.chunkId}. Skipping.`);
      continue;
    }

    let parentData: Note | ChatMessage | null = null;
    let parentTitle: string | undefined;
    let originalUrl: string | undefined;
    let originalTags: string[] | undefined;

    if (hybridChunk.parentType === 'note') {
      parentData = await getNoteByIdFromSystem(hybridChunk.parentId);
      if (parentData) {
        parentTitle = (parentData as Note).title;
        originalUrl = (parentData as Note).url;
        originalTags = (parentData as Note).tags;
      }
    } else { // 'chat'
      parentData = await getChatMessageById(hybridChunk.parentId);
      if (parentData) {
        parentTitle = (parentData as ChatMessage).title || `Chat on ${new Date((parentData as ChatMessage).last_updated).toLocaleDateString()}`;
      }
    }
    
    // Attempt to get chunk-specific details from chunkId parsing
    const parsedChunkIdDetails = parseChunkId(hybridChunk.chunkId);

    finalResults.push({
      chunkId: hybridChunk.chunkId,
      parentId: hybridChunk.parentId,
      parentType: hybridChunk.parentType,
      hybridScore: hybridChunk.hybridScore,
      chunkText: chunkText,
      parentTitle: parentTitle || (parentData as any)?.title || 'Unknown Title',
      originalUrl,
      originalTags,
      role: parsedChunkIdDetails?.role,
      timestamp: parsedChunkIdDetails?.timestamp,
      headingPath: parsedChunkIdDetails?.headingPath, // This might not be directly in parseChunkId, adjust if needed
      normalizedSemanticScore: hybridChunk.normalizedSemanticScore,
      normalizedBm25Score: hybridChunk.normalizedBm25Score,
    });
  }
  return finalResults;
}

// Helper to parse parent ID and determine type (Note: BM25 search returns parent IDs)
// Parent IDs from BM25 are like "note_xxxx" or "chat_yyyy"
function parseChunkIdFromParent(parentIdFromBM25: string): { id: string; type: 'note' | 'chat' } | null {
  if (parentIdFromBM25.startsWith(NOTE_STORAGE_PREFIX.replace(/:$/, ''))) { // remove trailing colon if present for comparison
    return { id: parentIdFromBM25, type: 'note' };
  } else if (parentIdFromBM25.startsWith(CHAT_STORAGE_PREFIX.replace(/:$/, ''))) {
    return { id: parentIdFromBM25, type: 'chat' };
  }
  console.warn(`[parseChunkIdFromParent] Could not determine type for parent ID: ${parentIdFromBM25}`);
  return null;
}

/**
 * Formats the hybrid ranked chunks for display or use by an LLM.
 * @param rankedChunks An array of HybridRankedChunk objects.
 * @returns A string formatted for LLM context.
 */
export function formatResultsForLLM(rankedChunks: HybridRankedChunk[]): string {
  if (!rankedChunks || rankedChunks.length === 0) {
    return "No relevant search results found to provide context.";
  }

  let promptOutput = "Use the following search results to answer. Cite sources using [Source Type: Parent Title, Chunk ID: chunk_id, Score: X.XX] where appropriate:\n\n";
  
  rankedChunks.forEach(chunk => {
    const sourceType = chunk.parentType === 'note' ? 'Note Chunk' : 'Chat Chunk';
    const title = chunk.parentTitle || 'Untitled Parent';
    // Ensure score is displayed with a reasonable number of decimal places
    const scoreStr = chunk.hybridScore.toFixed(2);

    promptOutput += `### [${sourceType} from: ${title}, Chunk ID: ${chunk.chunkId}, Score: ${scoreStr}]\n`;
    // Include parent URL for notes if available
    if (chunk.parentType === 'note' && chunk.originalUrl) {
      promptOutput += `(Source URL: ${chunk.originalUrl})\n`;
    }
    // Include heading path for notes if available
    if (chunk.parentType === 'note' && chunk.headingPath && chunk.headingPath.length > 0) {
      promptOutput += `(Section: ${chunk.headingPath.join(' > ')})\n`;
    }
    // Include role and timestamp for chat chunks if available
    if (chunk.parentType === 'chat' && chunk.role && chunk.timestamp) {
      const date = new Date(chunk.timestamp).toLocaleString();
      promptOutput += `(Role: ${chunk.role}, Time: ${date})\n`;
    }
    
    promptOutput += `${chunk.chunkText}\n\n`;
  });

  return promptOutput.trim();
}
