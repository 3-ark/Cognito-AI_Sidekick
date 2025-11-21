
import { getStoredAppSettings } from './storageUtil';

// Generic function for OpenAI-compatible embedding APIs
const getOpenAICompatibleEmbedding = async (
  text: string,
  apiUrl: string,
  apiKey: string,
  model: string,
): Promise<number[]> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60-second timeout

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: text,
        model: model,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to get embedding: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Embedding request timed out after 60 seconds');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

// Specific function for Gemini
const getGeminiEmbedding = async (
    text: string,
    apiKey: string,
    model: string,
): Promise<number[]> => {
    const url = `https://generativelanguage.googleapis.com/v1beta/${model}:embedContent`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60-second timeout

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
            },
            body: JSON.stringify({
                content: {
                    parts: [{ text: text }],
                },
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to get Gemini embedding: ${errorData.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();
        return data.embedding.values;
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('Gemini embedding request timed out after 60 seconds');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

export const getEmbedding = async (text: string): Promise<number[]> => {
  const config = await getStoredAppSettings();

  if (!config) {
    throw new Error('Configuration not found.');
  }

  const modelId = config.ragConfig?.model;

  if (!modelId) {
    throw new Error('No embedding model is configured in RAG settings.');
  }

  // Preferred method: Find the model in the config and use its host property.
  const modelInfo = config.models?.find(m => m.id === modelId);

  let hostId = modelInfo?.host;
  let modelNameForApi = modelId;

  // Fallback method: If model not found in config, parse the ID string.
  if (!hostId) {
    console.warn(`Model with ID '${modelId}' not found in config.models. Falling back to parsing ID.`);
    const parts = modelId.split('/');

    hostId = parts[0];
    modelNameForApi = parts.slice(1).join('/');
  }

  switch (hostId) {
    case 'ollama':

    case 'lmStudio': {
      const url = hostId === 'ollama' ? config.ollamaUrl : config.lmStudioUrl;

      if (!url) {
        throw new Error(`${hostId} URL is not configured.`);
      }

      return getOpenAICompatibleEmbedding(text, `${url}/v1/embeddings`, 'no-key', modelNameForApi);
    }

    case 'openai':
      if (!config.openAiApiKey) throw new Error('OpenAI API key not found.');

      return getOpenAICompatibleEmbedding(text, 'https://api.openai.com/v1/embeddings', config.openAiApiKey, modelNameForApi);

    case 'groq':
      if (!config.groqApiKey) throw new Error('Groq API key not found.');

      return getOpenAICompatibleEmbedding(text, 'https://api.groq.com/openai/v1/embeddings', config.groqApiKey, modelNameForApi);

    case 'openrouter':
        if (!config.openRouterApiKey) throw new Error('OpenRouter API key not found.');

        return getOpenAICompatibleEmbedding(text, 'https://openrouter.ai/api/v1/embeddings', config.openRouterApiKey, modelNameForApi);

    case 'gemini':
      if (!config.geminiApiKey) throw new Error('Gemini API key not found.');

      // The model name for Gemini is passed differently, expecting the full ID.
      return getGeminiEmbedding(text, config.geminiApiKey, modelId);

    default: {
      // Handle custom endpoints
      const customEndpoint = config.customEndpoints?.find(e => e.id === hostId);

      if (customEndpoint) {
        if (!customEndpoint.connected) {
          throw new Error(`Custom endpoint '${customEndpoint.name}' is not connected.`);
        }

        return getOpenAICompatibleEmbedding(text, `${customEndpoint.endpoint}/v1/embeddings`, customEndpoint.apiKey, modelNameForApi);
      }

      throw new Error(`Unsupported embedding provider or unknown custom endpoint ID: ${hostId}`);
    }
  }
};
