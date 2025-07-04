// @file embeddingUtils.ts
// Utilities for generating embeddings for text content.

interface EmbeddingServiceConfig {
  apiUrl: string;
  model: string;
  apiKey?: string; // Optional API key
}

// Internal configuration store
let embeddingServiceConfig: EmbeddingServiceConfig = {
  apiUrl: '', // Needs to be configured
  model: '',   // Needs to be configured
};

let _embeddingServiceReadyResolve: () => void;
export const embeddingServiceReadyPromise = new Promise<void>(resolve => {
  _embeddingServiceReadyResolve = resolve;
});

// Function to check if the service is configured
const isServiceConfigured = (): boolean => {
  return !!embeddingServiceConfig.apiUrl && !!embeddingServiceConfig.model;
};

/**
 * Configures the embedding service details.
 * This should be called during application initialization.
 * For example, in src/background/index.ts
 */
export const configureEmbeddingService = (
  apiUrl: string,
  model: string,
  apiKey?: string
): void => {
  embeddingServiceConfig.apiUrl = apiUrl;
  embeddingServiceConfig.model = model;
  embeddingServiceConfig.apiKey = apiKey;
  console.log('Embedding service configured:', { apiUrl, model, apiKey: apiKey ? '******' : 'Not set' });

  if (isServiceConfigured()) {
    _embeddingServiceReadyResolve();
  }
};

/**
 * Returns a promise that resolves when the embedding service is configured.
 */
export const ensureEmbeddingServiceConfigured = (): Promise<void> => {
  if (isServiceConfigured()) {
    return Promise.resolve();
  }
  return embeddingServiceReadyPromise;
};

/**
 * Generates an embedding for a single piece of text.
 * @param text The text to embed.
 * @returns A promise that resolves to an array of numbers representing the embedding, or an empty array on error.
 */
export const generateEmbedding = async (text: string): Promise<number[]> => {
  if (!embeddingServiceConfig.apiUrl || !embeddingServiceConfig.model) {
    console.error(
      'Embedding service is not configured. Call configureEmbeddingService first.'
    );
    return [];
  }
  if (!text || text.trim() === '') {
    console.warn('generateEmbedding called with empty text.');
    return [];
  }

  try {
    // Assuming a common API structure. This may need adjustment based on the actual service.
    // Example: OpenAI embeddings API, Cohere, or a custom service.
    // Here, we'll use a generic structure: POST { "input": "...", "model": "..." }
    // and expect { "embedding": [...] } or { "data": [{ "embedding": [...] }] }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (embeddingServiceConfig.apiKey) {
      headers['Authorization'] = `Bearer ${embeddingServiceConfig.apiKey}`;
    }

    const body = JSON.stringify({
      input: text,
      model: embeddingServiceConfig.model,
    });

    const response = await fetch(embeddingServiceConfig.apiUrl, {
      method: 'POST',
      headers: headers,
      body: body,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `Error generating embedding for text "${text.substring(0, 50)}...": ${response.status} ${response.statusText}`,
        errorBody
      );
      return [];
    }

    const data = await response.json();

    // Adapt based on actual API response structure
    if (data.embedding) {
      return data.embedding as number[];
    } else if (data.data && Array.isArray(data.data) && data.data.length > 0 && data.data[0].embedding) {
      // Common structure for OpenAI API
      return data.data[0].embedding as number[];
    } else {
      console.error(
        `Unexpected response structure from embedding service for text "${text.substring(0,50)}..."`, data);
      return [];
    }
  } catch (error) {
    console.error(`Network or other error generating embedding for text "${text.substring(0,50)}...":`, error);
    return [];
  }
};

/**
 * Generates embeddings for multiple texts, processing them in batches concurrently.
 * @param texts An array of strings to embed.
 * @param batchSize The number of texts to process in each concurrent batch. Defaults to 5.
 * @returns A promise that resolves to an array of embeddings (number[][]).
 *          Each inner array corresponds to the embedding of the text at the same index in the input.
 *          If an embedding for a specific text fails, its corresponding entry will be an empty array.
 */
export const generateEmbeddings = async (
  texts: string[],
  batchSize = 5
): Promise<number[][]> => {
  if (!embeddingServiceConfig.apiUrl || !embeddingServiceConfig.model) {
    console.error(
      'Embedding service is not configured. Call configureEmbeddingService first.'
    );
    return texts.map(() => []);
  }

  if (!texts || texts.length === 0) {
    return [];
  }

  const allEmbeddings: (number[] | null)[] = new Array(texts.length).fill(null); // Use null as placeholder for pending

  for (let i = 0; i < texts.length; i += batchSize) {
    const batchTexts = texts.slice(i, i + batchSize);
    const batchPromises = batchTexts.map((text, batchIndex) => {
      // If the API supports batch inputs directly, that would be more efficient.
      // This implementation uses concurrent calls to the single text embedding function.
      return generateEmbedding(text)
        .then(embedding => ({ embedding, originalIndex: i + batchIndex }))
        .catch(error => {
          console.error(`Error processing text at index ${i + batchIndex} in batch:`, error);
          return { embedding: [], originalIndex: i + batchIndex }; // Ensure an empty array for failure
        });
    });

    try {
      const batchResults = await Promise.all(batchPromises);
      for (const result of batchResults) {
        allEmbeddings[result.originalIndex] = result.embedding;
      }
    } catch (batchError) {
      // This catch block might be redundant if individual promises handle their errors,
      // but it's a safeguard for Promise.all itself failing, though unlikely with individual catches.
      console.error('Error processing a batch of embeddings:', batchError);
      // Mark all items in this batch as failed if Promise.all itself throws (shouldn't happen with individual catches)
      for (let j = 0; j < batchTexts.length; j++) {
        if (allEmbeddings[i + j] === null) { // Only if not already set by a successful promise
          allEmbeddings[i + j] = [];
        }
      }
    }
  }

  // Replace any remaining nulls (if any error path missed them, though unlikely) with empty arrays
  return allEmbeddings.map(emb => emb === null ? [] : emb);
};

// Example of how to configure (this should be done in background/index.ts or similar setup file):
/*
import { getEmbeddingConfigFromStorage } from './configStorage'; // Assuming a function to get config

async function initializeEmbeddingService() {
  // const config = await getEmbeddingConfigFromStorage(); // Or get from chrome.storage.local
  // Example fixed config:
  const exampleApiUrl = 'YOUR_EMBEDDING_SERVICE_ENDPOINT'; // e.g., 'https://api.openai.com/v1/embeddings'
  const exampleModel = 'YOUR_MODEL_NAME'; // e.g., 'text-embedding-ada-002'
  const exampleApiKey = 'YOUR_API_KEY'; // Optional, depending on service

  if (exampleApiUrl && exampleModel) {
    configureEmbeddingService(exampleApiUrl, exampleModel, exampleApiKey);
  } else {
    console.warn('Embedding service URL or model not found in configuration. Embeddings will not be generated.');
  }
}

// Call this early in your service worker lifecycle
// initializeEmbeddingService();
*/
