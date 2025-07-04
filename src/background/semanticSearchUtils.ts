import localforage from 'localforage';
import { 
  EMBEDDING_NOTE_CHUNK_PREFIX,
  NOTE_CHUNK_TEXT_PREFIX // For parsing parentId from note chunk id
} from './noteStorage';
import { 
  EMBEDDING_CHAT_CHUNK_PREFIX,
  CHAT_CHUNK_TEXT_PREFIX // For parsing parentId from chat chunk id
} from './chatHistoryStorage';

/**
 * Calculates the cosine similarity between two vectors.
 * @param vecA The first vector.
 * @param vecB The second vector.
 * @returns The cosine similarity, or 0 if an error occurs (e.g., different lengths, zero vector).
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    console.error("Vectors have different lengths, cannot compute cosine similarity.");
    return 0;
  }
  if (vecA.length === 0) {
    console.error("Vectors are empty, cannot compute cosine similarity.");
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    // console.warn("One or both vectors have zero magnitude. Cosine similarity is 0.");
    return 0; // Or handle as an error, depending on desired behavior for zero vectors
  }

  return dotProduct / (normA * normB);
}

/**
 * Parses a chunk ID to extract parent ID, parent type, and other potential details.
 * Note chunk ID format: `notechunk_<parentId>_<index>`
 * Chat chunk ID format: `chatchunk_<parentId>_<turnIndex>_<timestamp>_<role>`
 * @param chunkId The chunk ID string.
 * @returns An object with parentId, parentType, and other parts, or null if parsing fails.
 */
export function parseChunkId(chunkId: string): { parentId: string; parentType: 'note' | 'chat'; [key: string]: any } | null {
  if (typeof chunkId !== 'string') return null;

  if (chunkId.startsWith('notechunk_')) {
    const parts = chunkId.split('_');
    // Expected: "notechunk", parentId (can contain underscores), index
    // To handle parentIds with underscores, we assume the last part is the index,
    // and everything between "notechunk" and the last part is the parentId.
    if (parts.length >= 3) {
      const parentId = parts.slice(1, parts.length - 1).join('_');
      const index = parts[parts.length - 1];
      return {
        parentId,
        parentType: 'note',
        index: parseInt(index, 10),
        originalChunkIdFormat: chunkId, // Keep original for reference if needed
      };
    }
  } else if (chunkId.startsWith('chatchunk_')) {
    const parts = chunkId.split('_');
    // Expected: "chatchunk", parentId (can contain underscores), turnIndex, timestamp, role
    // Similar logic for parentId with underscores.
    if (parts.length >= 5) {
      const role = parts[parts.length - 1];
      const timestamp = parts[parts.length - 2];
      const turnIndex = parts[parts.length - 3];
      const parentId = parts.slice(1, parts.length - 3).join('_');
      return {
        parentId,
        parentType: 'chat',
        turnIndex: parseInt(turnIndex, 10),
        timestamp: parseInt(timestamp, 10),
        role,
        originalChunkIdFormat: chunkId, // Keep original
      };
    }
  }
  console.warn(`[parseChunkId] Could not parse chunkId: ${chunkId}`);
  return null;
}


/**
 * Fetches all stored chunk embeddings (for notes and chats) from localforage.
 * @returns A promise that resolves to an array of objects, each containing a chunkId and its embedding.
 */
export async function getAllChunkEmbeddings(): Promise<Array<{ chunkId: string; embedding: number[] }>> {
  const allChunkEmbeddings: Array<{ chunkId: string; embedding: number[] }> = [];
  try {
    const keys = await localforage.keys();
    
    for (const key of keys) {
      if (key.startsWith(EMBEDDING_NOTE_CHUNK_PREFIX) || key.startsWith(EMBEDDING_CHAT_CHUNK_PREFIX)) {
        const embedding = await localforage.getItem<number[]>(key);
        if (embedding && Array.isArray(embedding) && embedding.length > 0) {
          // The key itself is the embedding key, e.g., "embedding_notechunk_parentId_index"
          // We need to derive the actual chunkId, e.g., "notechunk_parentId_index"
          let chunkId = '';
          if (key.startsWith(EMBEDDING_NOTE_CHUNK_PREFIX)) {
            chunkId = key.substring(EMBEDDING_NOTE_CHUNK_PREFIX.length);
          } else if (key.startsWith(EMBEDDING_CHAT_CHUNK_PREFIX)) {
            chunkId = key.substring(EMBEDDING_CHAT_CHUNK_PREFIX.length);
          }
          
          if (chunkId) {
            allChunkEmbeddings.push({ chunkId, embedding });
          } else {
            console.warn(`Could not derive chunkId from embedding key: ${key}`);
          }
        } else {
          console.warn(`No valid embedding found for key: ${key}`);
        }
      }
    }
  } catch (error) {
    console.error("Error fetching chunk embeddings from localforage:", error);
    // Depending on desired error handling, you might re-throw or return an empty array.
  }
  return allChunkEmbeddings;
}

/**
 * Finds the top K chunks most similar to a query embedding.
 * @param queryEmbedding The embedding of the query text.
 * @param topK The maximum number of similar chunks to return.
 * @param semanticThreshold The minimum cosine similarity score for a chunk to be considered.
 * @returns A promise that resolves to an array of the top K similar chunk objects.
 */
export async function findSimilarChunks(
  queryEmbedding: number[],
  topK: number,
  semanticThreshold: number
): Promise<Array<{ chunkId: string; parentId: string; parentType: 'note' | 'chat'; semanticScore: number }>> {
  if (!queryEmbedding || queryEmbedding.length === 0) {
    console.warn("[findSimilarChunks] Query embedding is empty.");
    return [];
  }
  if (topK <= 0) {
    console.warn("[findSimilarChunks] topK must be positive.");
    return [];
  }

  const allChunkEmbeddings = await getAllChunkEmbeddings();
  if (allChunkEmbeddings.length === 0) {
    console.log("[findSimilarChunks] No chunk embeddings found in storage.");
    return [];
  }

  const scoredChunks: Array<{ chunkId: string; parentId: string; parentType: 'note' | 'chat'; semanticScore: number }> = [];

  for (const chunkData of allChunkEmbeddings) {
    const { chunkId, embedding: chunkEmbedding } = chunkData;
    const parsedId = parseChunkId(chunkId);

    if (!parsedId) {
      console.warn(`[findSimilarChunks] Could not parse chunkId ${chunkId}. Skipping.`);
      continue;
    }

    const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);

    if (similarity >= semanticThreshold) {
      scoredChunks.push({
        chunkId,
        parentId: parsedId.parentId,
        parentType: parsedId.parentType,
        semanticScore: similarity,
      });
    }
  }

  // Sort by semantic score in descending order
  scoredChunks.sort((a, b) => b.semanticScore - a.semanticScore);

  return scoredChunks.slice(0, topK);
}
