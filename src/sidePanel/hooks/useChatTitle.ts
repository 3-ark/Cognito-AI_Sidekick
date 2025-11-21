import {
 useEffect, useRef,useState, 
} from 'react';
import OpenAI from "openai";

import ChannelNames from '../../types/ChannelNames';
import { Conversation, MessageTurn } from '../../types/chatTypes';
import { useConfig } from '../ConfigContext';

import { ApiMessage } from '../../types/chatTypes';


const extractTitle = (response: string): string => {
  // First remove any thinking blocks
  const titleOnly = response
    .replace(/<think>[\s\S]*?<\/think>/g, '') // Use [\s\S] to match any char including newlines
    .replace(/"/g, '')
    .replace(/#/g, '')
    .trim();

  if (!titleOnly) {
    return "New Chat";
  }

  // Limit to a maximum of 4 words
  const words = titleOnly.split(/\s+/);

  return words.slice(0, 4).join(' ') || "New Chat";
};

export const useChatTitle = (
    isLoading: boolean,
    conversation: Conversation | null,
    turns: MessageTurn[],
    onTitleGenerated: (conversation: Conversation) => void,
) => {
  const [chatTitle, setChatTitle] = useState(conversation?.title || '');
  const { config } = useConfig();
  const abortControllerRef = useRef<AbortController | null>(null);
  const generationAttemptedForId = useRef<string | null>(null);

  useEffect(() => {
    if (conversation) {
      setChatTitle(conversation.title || '');

      if (conversation.title) {
        // If the conversation object already has a title, mark it as "attempted"
        // to prevent re-generation if the object reference changes.
        generationAttemptedForId.current = conversation.id;
      }
    } else {
      // If there's no conversation, reset the lock.
      generationAttemptedForId.current = null;
    }
  }, [conversation]);

  useEffect(() => {
    if (
      !isLoading &&
      conversation &&
      conversation.id && !conversation.id.startsWith('temp-') &&
      turns.length >= 2 &&
      !conversation.title &&
      config?.generateTitle &&
      generationAttemptedForId.current !== conversation.id
    ) {
      generationAttemptedForId.current = conversation.id;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;
      const currentModel = config?.models?.find(
        model => model.id === config.selectedModel,
      );

      if (!currentModel) return;

      const messagesForTitle: ApiMessage[] = [
        ...turns.slice(0, 2).map(
          (turn): ApiMessage => ({
            content: turn.content || '',
            role: turn.role,
          }),
        ),
        {
          role: 'user',
          content:
            'Create a short 2-4 word title for this chat. Keep it concise, just give me the best one, just one. No explanations or thinking steps needed.',
        },
      ];

      const getApiConfig = () => {
        const baseConfig = {
          body: {
            model: currentModel.id,
            messages: messagesForTitle,
            stream: !['ollama', 'lmStudio'].includes(currentModel.host || ''),
          },
          headers: {} as Record<string, string>,
        };

        switch (currentModel.host) {
          case 'groq':
            return {
              ...baseConfig,
              url: 'https://api.groq.com/openai/v1/chat/completions',
              headers: { Authorization: `Bearer ${config.groqApiKey}` },
            };

          case 'ollama':
            return {
              ...baseConfig,
              url: `${config.ollamaUrl}/v1/chat/completions`,
            };

          case 'lmStudio':
            return {
              ...baseConfig,
              url: `${config.lmStudioUrl}/v1/chat/completions`,
            };

          case 'gemini':
            return {
              ...baseConfig,
              url:
                'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
              headers: { Authorization: `Bearer ${config.geminiApiKey}` },
            };

          case 'openai':
            return {
              ...baseConfig,
              url: 'https://api.openai.com/v1/chat/completions',
              headers: { Authorization: `Bearer ${config.openAiApiKey}` },
            };

          case 'openrouter':
            return {
              ...baseConfig,
              url: 'https://openrouter.ai/api/v1/chat/completions',
              headers: { Authorization: `Bearer ${config.openRouterApiKey}` },
            };
        }

        const standardHosts = ['groq', 'ollama', 'gemini', 'lmStudio', 'openai', 'openrouter'];
        if (currentModel.host && !standardHosts.includes(currentModel.host)) {
          const endpoint = config.customEndpoints?.find(
            e => e.id === currentModel.host,
          );

          if (endpoint?.endpoint) {
            const baseUrl = endpoint.endpoint.endsWith('/')
              ? endpoint.endpoint.slice(0, -1)
              : endpoint.endpoint;

            return {
              ...baseConfig,
              url: `${baseUrl}/chat/completions`,
              headers: { Authorization: `Bearer ${endpoint.apiKey}` },
            };
          }
        }
      };

      const apiConfig = getApiConfig();

      if (!apiConfig) return;

      const handleFetchError = (err: any) => {
        if (signal.aborted) {
          console.log('Title generation aborted.');
        } else {
          console.error('Title generation failed:', err);

          // If fetching fails, unlock to allow another attempt if the user retries
          generationAttemptedForId.current = null;
        }
      };

      const openai = new OpenAI({
        apiKey: apiConfig.headers.Authorization?.replace('Bearer ', '') || '',
        baseURL: apiConfig.url.replace(/\/chat\/completions$/, ''),
        dangerouslyAllowBrowser: true,
      });

      const modelIdToSend = (currentModel.host && apiConfig.body.model?.startsWith(`${currentModel.host}_`))
        ? apiConfig.body.model.substring(currentModel.host.length + 1)
        : apiConfig.body.model;

      const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
        model: modelIdToSend,
        messages:
          apiConfig.body.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        stream: true,
      };

      let accumulatedTitle = '';

      openai.chat.completions
        .create(params)
        .then(async stream => {
          for await (const chunk of stream) {
            if (signal.aborted) return;

            accumulatedTitle += chunk.choices?.[0]?.delta?.content || '';
          }

          const cleanTitle = extractTitle(accumulatedTitle);

          if (cleanTitle && conversation) {
            setChatTitle(cleanTitle);
            const updatedConversation = { ...conversation, title: cleanTitle };

            onTitleGenerated(updatedConversation); // Optimistic update
            chrome.runtime.sendMessage(
              {
                type: ChannelNames.SAVE_CHAT_REQUEST,
                payload: { conversation: updatedConversation },
              },
              response => {
                if (response.success && response.conversation) {
                  onTitleGenerated(response.conversation); // Final update with saved data
                } else {
                  console.error('Failed to save conversation title');
                }
              },
            );
          }
        })
        .catch(handleFetchError);
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [isLoading, turns, conversation, config, onTitleGenerated]);

  return { chatTitle, setChatTitle };
};
