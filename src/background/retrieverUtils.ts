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

/**
 * Fetches all chunk texts for a given list of parent documents using a parent-to-chunk index.
 * This is highly performant as it avoids scanning the entire database.
 * @param parentItems An array of objects, each with a parentId and parentType.
 * @returns A promise that resolves to a map where keys are parentIds and values are arrays of chunk objects.
 */
export async function getChunkTextsForParents(
  parentItems: Array<{ parentId: string; parentType: 'note' | 'chat' }>
): Promise<Map<string, Array<{ chunkId: string; chunkText: string }>>> {
  const results = new Map<string, Array<{ chunkId: string; chunkText: string }>>();
  if (!parentItems || parentItems.length === 0) {
    return results;
  }

  // Process all parents in parallel for maximum speed
  await Promise.all(parentItems.map(async ({ parentId, parentType }) => {
    // Define the keys for the index and the chunk texts based on parent type
    const indexKey = parentType === 'note' 
      ? `note-chunk-index:${parentId}` 
      : `chat-chunk-index:${parentId}`;
      
    const textPrefix = parentType === 'note' 
      ? NOTE_CHUNK_TEXT_PREFIX 
      : CHAT_CHUNK_TEXT_PREFIX;

    try {
      // 1. Fetch the list of chunk IDs directly from the index. This is very fast.
      const chunkIds = await localforage.getItem<string[]>(indexKey);

      if (!chunkIds || chunkIds.length === 0) {
        results.set(parentId, []); // No chunks found for this parent
        return;
      }

      // 2. Create the full keys for all chunk texts
      const chunkTextKeys = chunkIds.map(chunkId => `${textPrefix}${chunkId}`);

      // 3. Fetch all chunk texts for this parent in a single parallel batch
      const chunkTexts = await Promise.all(
        chunkTextKeys.map(key => localforage.getItem<string>(key))
      );

      // 4. Assemble the results for this parent
      const parentChunks: Array<{ chunkId: string; chunkText: string }> = [];
      for (let i = 0; i < chunkIds.length; i++) {
        const text = chunkTexts[i];
        if (typeof text === 'string') {
          parentChunks.push({ chunkId: chunkIds[i], chunkText: text });
        } else {
          console.warn(`[getChunkTextsForParents] Could not find text for chunk ${chunkIds[i]} of parent ${parentId}`);
        }
      }
      results.set(parentId, parentChunks);

    } catch (error) {
      console.error(`[getChunkTextsForParents] Error fetching chunks for parent ${parentId}:`, error);
      results.set(parentId, []); // Ensure an entry exists even on error
    }
  }));

  return results;
}

/**
 * Normalizes an array of scores (e.g., BM25 or semantic scores) to a 0-1 range using min-max scaling.
 * @param itemsWithScores An array of objects, each having an 'id' and a 'score'.
 * @returns An array of objects with the same 'id's and normalized 'score's.
 *          Returns an empty array if input is empty.
 *          If all scores are the same, all normalized scores will be 1 (or 0 if min === max === 0).
 */
export function normalizeScores<T extends { id: string | number; score: number }>(
    itemsWithScores: T[]
): T[] {
    if (!itemsWithScores || itemsWithScores.length === 0) {
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
  const finalTopK = ragConfig.final_top_k ?? ragConfig.semantic_top_k ?? 10; 

  // --- Step 1: Get Query Embedding ---
  const queryEmbedding = await generateEmbedding(query);
  if (!queryEmbedding || queryEmbedding.length === 0) {
    console.warn('[getHybridRankedChunks] Could not generate query embedding. Proceeding with BM25 part of hybrid search if weighted.');
    // Do not return here; allow BM25 processing to occur.
    // queryEmbedding will remain [] and semanticChunks will consequently be empty if semantic weight > 0.
  }
  
  let semanticChunks: Array<{ chunkId: string; parentId: string; parentType: 'note' | 'chat'; semanticScore: number }> = [];
  
  // --- Step 2: Get Semantic Results ---
  // Only attempt semantic search if embedding was successful AND semantic search has a weight
  if (queryEmbedding && queryEmbedding.length > 0 && (1 - bm25Weight) > 0) { 
    semanticChunks = await findSimilarChunks(queryEmbedding, semanticTopK, semanticThreshold);
  } else if ((1 - bm25Weight) > 0 && (!queryEmbedding || queryEmbedding.length === 0)) {
    // This condition explicitly means embedding failed AND semantic search had weight.
    console.log('[getHybridRankedChunks] Semantic search part is skipped due to failed embedding generation.');
  }
  // If embedding succeeded but (1 - bm25Weight) <= 0 (i.e., bm25Weight is 1), semanticChunks remains [].
  
  // --- Step 3: Get BM25 Results (Parent Documents) ---
  let bm25ParentResults: RawBM25SearchResult[] = [];
  if (bm25Weight > 0) { // Only perform BM25 if it has a weight
     bm25ParentResults = await bm25Search(query, bm25TopKParents);
  }
// --- !!! ADD THIS DEBUGGING BLOCK !!! ---
console.log("--- BM25 DEBUG ---");
console.log("Raw BM25 Results:", JSON.parse(JSON.stringify(bm25ParentResults)));
const parentIdsForBM25_debug = bm25ParentResults.map(([parentId, _]) => {
    const parsed = parseChunkIdFromParent(parentId);
    return parsed ? { parentId: parsed.id, parentType: parsed.type } : null;
}).filter((p): p is { parentId: string; parentType: 'note' | 'chat' } => p !== null);
console.log("Parent IDs passed to getChunkTextsForParents:", parentIdsForBM25_debug);
console.log("--- END BM25 DEBUG ---");
// --- END OF DEBUGGING BLOCK ---


  // --- Step 4: Prepare Chunks from BM25 Results (Corrected) ---
  const bm25DerivedChunks: Array<{ chunkId: string; parentId: string; parentType: 'note' | 'chat'; bm25Score: number }> = [];
  if (bm25Weight > 0 && bm25ParentResults.length > 0) {
  // This part is correct: it creates a list of objects with UN-PREFIXED parent IDs.
  const parentIdsForBM25 = bm25ParentResults.map(([fullParentId, _]) => {
    const parsed = parseChunkIdFromParent(fullParentId);
    return parsed ? { parentId: parsed.id, parentType: parsed.type } : null;
  }).filter((p): p is { parentId: string; parentType: 'note' | 'chat' } => p !== null);
  
  // This is also correct: it fetches chunks and returns a map keyed by UN-PREFIXED parent IDs.
  const allChunksForParents = await getChunkTextsForParents(parentIdsForBM25);

  // --- THIS IS THE CORRECTED LOOP ---
  // Now, associate the BM25 score of a parent with all of its chunks.
  for (const [fullParentId, parentBm25Score] of bm25ParentResults) {
    // First, parse the full ID to get the clean ID and type.
    const parsedParent = parseChunkIdFromParent(fullParentId);
    if (!parsedParent) {
      continue; // Skip if the ID format is unexpected.
    }

    // Use the CLEAN, UN-PREFIXED ID for the map lookup. This is the fix.
    const chunksFromParent = allChunksForParents.get(parsedParent.id);
    
    if (chunksFromParent) {
      for (const chunk of chunksFromParent) {
        bm25DerivedChunks.push({
          chunkId: chunk.chunkId,
          parentId: parsedParent.id,     // Use the clean ID for consistency.
          parentType: parsedParent.type,
          bm25Score: parentBm25Score,    // Assign the parent's score to the chunk.
        });
      }
    }
  }
}  
  // --- Step 5: Normalize Scores ---
  // Normalize semantic scores
  const semanticScoresToNormalize = semanticChunks.map(c => ({ id: c.chunkId, score: c.semanticScore }));
  const normalizedSemanticScores = normalizeScores(semanticScoresToNormalize);
  const normalizedSemanticScoreMap = new Map(normalizedSemanticScores.map(s => [s.id, s.score]));
  const normalizedSemanticChunks = semanticChunks.map(chunk => ({
    ...chunk,
    semanticScore: normalizedSemanticScoreMap.get(chunk.chunkId) ?? 0,
  }));

  // Normalize BM25 scores (from bm25DerivedChunks)
  const bm25ScoresToNormalize = bm25DerivedChunks.map(c => ({ id: c.chunkId, score: c.bm25Score }));
  const normalizedBm25Scores = normalizeScores(bm25ScoresToNormalize);
  const normalizedBm25ScoreMap = new Map(normalizedBm25Scores.map(s => [s.id, s.score]));
  const normalizedBm25Chunks = bm25DerivedChunks.map(chunk => ({
    ...chunk,
    bm25Score: normalizedBm25ScoreMap.get(chunk.chunkId) ?? 0,
  }));


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

// --- Step 8: Fetch Chunk Texts & Metadata (Optimized for Performance) ---

  // If there are no chunks after ranking, return early.
  if (topHybridChunks.length === 0) {
    return [];
  }

  // 1. GATHER ALL IDENTIFIERS NEEDED FOR FETCHING
  // This avoids fetching the same parent document multiple times if several of its chunks are in the top results.
  const noteParentIds = new Set<string>();
  const chatParentIds = new Set<string>();
  
  topHybridChunks.forEach(chunk => {
    if (chunk.parentType === 'note') {
      noteParentIds.add(chunk.parentId);
    } else {
      chatParentIds.add(chunk.parentId);
    }
  });

  const textKeys = topHybridChunks.map(c => 
    c.parentType === 'note' 
      ? `${NOTE_CHUNK_TEXT_PREFIX}${c.chunkId}` 
      : `${CHAT_CHUNK_TEXT_PREFIX}${c.chunkId}`
  );

  // 2. FETCH ALL DATA IN PARALLEL using Promise.all
  // This is significantly faster than awaiting each fetch inside a loop.
  const [
    chunkTexts,
    noteParents,
    chatParents
  ] = await Promise.all([
    Promise.all(textKeys.map(key => localforage.getItem<string>(key))),
    Promise.all(Array.from(noteParentIds).map(id => getNoteByIdFromSystem(id))),
    Promise.all(Array.from(chatParentIds).map(id => getChatMessageById(id)))
  ]);

  // 3. CREATE FAST-ACCESS LOOKUP MAPS for the fetched parent data
  // This provides O(1) access to parent data in the final assembly loop.
  const noteParentMap = new Map(
    noteParents.filter((p): p is Note => p !== null).map(p => [p.id, p])
  );
  const chatParentMap = new Map(
    chatParents.filter((p): p is ChatMessage => p !== null).map(p => [p.id, p])
  );

  // 4. ASSEMBLE THE FINAL RESULTS
  // This loop is now very fast as all data is already in memory.
  const finalResults: HybridRankedChunk[] = [];
  for (let i = 0; i < topHybridChunks.length; i++) {
    const hybridChunk = topHybridChunks[i];
    const chunkText = chunkTexts[i];

    if (typeof chunkText !== 'string') {
      console.warn(`[getHybridRankedChunks] Could not fetch text for chunk ${hybridChunk.chunkId}. Skipping.`);
      continue;
    }

    let parentData: Note | ChatMessage | undefined;
    let parentTitle: string | undefined;
    let originalUrl: string | undefined;
    let originalTags: string[] | undefined;

    if (hybridChunk.parentType === 'note') {
      parentData = noteParentMap.get(hybridChunk.parentId);
      if (parentData) {
        parentTitle = parentData.title;
        originalUrl = parentData.url;
        originalTags = parentData.tags;
      }
    } else { // 'chat'
      parentData = chatParentMap.get(hybridChunk.parentId);
      if (parentData) {
        parentTitle = parentData.title || `Chat on ${new Date(parentData.last_updated).toLocaleDateString()}`;
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
      parentTitle: parentTitle || 'Unknown Title',
      originalUrl,
      originalTags,
      // Use optional chaining for safety in case parsing fails or properties don't exist
      role: parsedChunkIdDetails?.role,
      timestamp: parsedChunkIdDetails?.timestamp,
      headingPath: parsedChunkIdDetails?.headingPath,
      normalizedSemanticScore: hybridChunk.normalizedSemanticScore,
      normalizedBm25Score: hybridChunk.normalizedBm25Score,
    });
  }

  return finalResults;
}
// Helper to parse parent ID and determine type (Note: BM25 search returns parent IDs)
// Parent IDs from BM25 are like "note:xxxx" or "chat:yyyy"
function parseChunkIdFromParent(parentIdFromBM25: string): { id: string; type: 'note' | 'chat' } | null {
  const notePrefix = NOTE_STORAGE_PREFIX; // e.g., 'note:'
  const chatPrefix = CHAT_STORAGE_PREFIX; // e.g., 'chat:'

  if (parentIdFromBM25.startsWith(notePrefix)) {
    // Return the type and the ID *without* the prefix
    return { id: parentIdFromBM25, type: 'note' };
  } else if (parentIdFromBM25.startsWith(CHAT_STORAGE_PREFIX)) {
    return { id: parentIdFromBM25, type: 'chat' };
  }
    
  console.warn(`[parseChunkIdFromParent] Could not determine type for parent ID: ${parentIdFromBM25}`);
  return null;
}

/**
 * Formats hybrid ranked chunks for an LLM prompt and separately provides the sources string.
 *
 * @param rankedChunks An array of HybridRankedChunk objects.
 * @returns An object with two properties:
 *          - `promptContext`: The context part of the prompt for the LLM.
 *          - `sourcesString`: A pre-formatted markdown string of the sources.
 */
export function formatResultsForLLM(rankedChunks: HybridRankedChunk[]): { promptContext: string; sourcesString: string } {
  if (!rankedChunks || rankedChunks.length === 0) {
    return {
      promptContext: "No relevant search results found to provide context.",
      sourcesString: ""
    };
  }

  // (The grouping logic from before is still correct and necessary)
  const chunksBySource = new Map<string, HybridRankedChunk[]>();
  const sourceInfoMap = new Map<string, { citationNum: number; chunk: HybridRankedChunk }>();
  let citationCounter = 1;

  for (const chunk of rankedChunks) {
    const sourceKey = chunk.parentId;
    if (!chunksBySource.has(sourceKey)) {
      chunksBySource.set(sourceKey, []);
      sourceInfoMap.set(sourceKey, { citationNum: citationCounter++, chunk });
    }
    chunksBySource.get(sourceKey)!.push(chunk);
  }

  const sortedSourceInfo = Array.from(sourceInfoMap.entries()).sort(
    (a, b) => a[1].citationNum - b[1].citationNum
  );

  // --- BUILD THE PROMPT CONTEXT FOR THE LLM ---
  // Notice we REMOVED the "### Sources" part from here.
  let promptContext = "Use the following search results to answer. Cite sources using footnotes (e.g., [^1]) where appropriate. Place the footnotes at the end of your response.\n\n";

  for (const [sourceKey, { citationNum }] of sortedSourceInfo) {
    promptContext += `### [Content Source [^${citationNum}]]\n`;
    const chunks = chunksBySource.get(sourceKey)!;
    for (const chunk of chunks) {
      if (chunk.parentType === 'chat' && chunk.role && chunk.timestamp) {
        const date = new Date(chunk.timestamp).toLocaleString();
        promptContext += `(Role: ${chunk.role}, Time: ${date})\n`;
      }
      promptContext += `${chunk.chunkText}\n\n`;
    }
  }
  
  // --- BUILD THE SOURCES STRING SEPARATELY ---
  let sourcesString = "";
  if (sourceInfoMap.size > 0) {
    sourcesString += "### Sources\n";
    for (const [_sourceKey, { citationNum, chunk }] of sortedSourceInfo) {
      const sourceType = chunk.parentType === 'note' ? 'Note' : 'Chat';
      const title = chunk.parentTitle || 'Untitled Parent';
      sourcesString += `[^${citationNum}]: ${sourceType}: "${title}"`;
      if (chunk.parentType === 'note' && chunk.originalUrl) {
        sourcesString += ` (URL: ${chunk.originalUrl})`;
      }
      sourcesString += '\n';
    }
  }

  // Return both parts
  return {
    promptContext: promptContext.trim(),
    sourcesString: sourcesString.trim()
  };
}