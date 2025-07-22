import { fetchData } from '../sidePanel/network';
import storage from './storageUtil';
import { getAuthHeader } from '../sidePanel/hooks/useSendMessage';
import { normalizeApiEndpoint } from './util';
import { Config, Model } from '../types/config';

export const prompt = async (prompt: string): Promise<string> => {
  try {
    const config: Config = JSON.parse((await storage.getItem('config')) || '{}');
    const currentModel: Model | undefined = config.models?.find(
      (m) => m.id === config.selectedModel
    );

    if (!currentModel) {
      throw new Error('No model selected');
    }

    const authHeader = getAuthHeader(config, currentModel);
    const normalizedUrl = normalizeApiEndpoint(config.customEndpoint);

    const urlMap: Record<string, string> = {
      groq: 'https://api.groq.com/openai/v1/chat/completions',
      ollama: `${config.ollamaUrl || ''}/api/chat`,
      gemini:
        'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      lmStudio: `${config.lmStudioUrl || ''}/v1/chat/completions`,
      openai: 'https://api.openai.com/v1/chat/completions',
      openrouter: 'https://openrouter.ai/api/v1/chat/completions',
      custom: config.customEndpoint ? `${normalizedUrl}/v1/chat/completions` : '',
    };

    const url = urlMap[currentModel.host || ''];
    if (!url) {
      throw new Error(`Configuration error: Could not determine API URL for host '${currentModel.host}'.`);
    }

    const messages = [{ role: 'user', content: prompt }];
    const data = {
      model: config.selectedModel || '',
      messages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 32048,
      top_p: config.topP ?? 1,
      presence_penalty: config.presencepenalty ?? 0,
    };

    const response = await fetchData(url, data, authHeader, currentModel.host || '');
    return response;
  } catch (error: any) {
    console.error(`Error generating response for prompt "${prompt}":`, error);
    return `Error generating response: ${error.message || 'Unknown error'}`;
  }
};
