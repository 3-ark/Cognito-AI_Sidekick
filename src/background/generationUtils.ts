import { getStoredAppSettings } from './storageUtil';
import { ApiMessage } from '../types/chatTypes';

// Generic function for OpenAI-compatible chat completion APIs
const getOpenAICompatibleCompletion = async (
  messages: ApiMessage[],
  apiUrl: string,
  apiKey: string,
  model: string,
): Promise<string> => {
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
        messages,
        model,
        stream: false, // We need the full response for summaries
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
        let errorDetails = 'Unknown error';
        try {
            const errorData = await response.json();
            console.error("Full error response from generation API:", errorData);
            errorDetails = errorData.error?.message || errorData.message || JSON.stringify(errorData);
        } catch (e) {
            errorDetails = await response.text();
            console.error("Non-JSON error response from generation API:", errorDetails);
        }
        throw new Error(`Failed to get completion: ${errorDetails}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out after 60 seconds');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const getCompletion = async (messages: ApiMessage[]): Promise<string> => {
  const config = await getStoredAppSettings();
  if (!config) {
    throw new Error('Configuration not found.');
  }

  // For summarization, we should use the main chat model, not the RAG model.
  const modelId = config.selectedModel;
  if (!modelId) {
    throw new Error('No model is selected for chat completion.');
  }

  const modelInfo = config.models?.find(m => m.id === modelId);
  if (!modelInfo) {
    throw new Error(`Model with ID '${modelId}' not found in configuration.`);
  }

  const hostId = modelInfo.host;
  const modelNameForApi = modelInfo.id;

  switch (hostId) {
    case 'ollama':
    case 'lmStudio': {
      const url = hostId === 'ollama' ? config.ollamaUrl : config.lmStudioUrl;
      if (!url) throw new Error(`${hostId} URL is not configured.`);
      return getOpenAICompatibleCompletion(messages, `${url}/v1/chat/completions`, 'no-key', modelNameForApi);
    }
    case 'openai':
      if (!config.openAiApiKey) throw new Error('OpenAI API key not found.');
      return getOpenAICompatibleCompletion(messages, 'https://api.openai.com/v1/chat/completions', config.openAiApiKey, modelNameForApi);
    case 'groq':
      if (!config.groqApiKey) throw new Error('Groq API key not found.');
      return getOpenAICompatibleCompletion(messages, 'https://api.groq.com/openai/v1/chat/completions', config.groqApiKey, modelNameForApi);
    case 'openrouter':
        if (!config.openRouterApiKey) throw new Error('OpenRouter API key not found.');
        return getOpenAICompatibleCompletion(messages, 'https://openrouter.ai/api/v1/chat/completions', config.openRouterApiKey, modelNameForApi);
    case 'gemini':
      if (!config.geminiApiKey) throw new Error('Gemini API key not found.');
      return getOpenAICompatibleCompletion(messages, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', config.geminiApiKey, modelNameForApi);
    default: {
      const customEndpoint = config.customEndpoints?.find(e => e.id === hostId);
      if (customEndpoint) {
        if (!customEndpoint.connected) throw new Error(`Custom endpoint '${customEndpoint.name}' is not connected.`);
        return getOpenAICompatibleCompletion(messages, `${customEndpoint.endpoint}/v1/chat/completions`, customEndpoint.apiKey, modelNameForApi);
      }
      throw new Error(`Unsupported completion provider or unknown custom endpoint ID: ${hostId}`);
    }
  }
};
