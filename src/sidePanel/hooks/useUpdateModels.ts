import {
 useCallback, useEffect, useRef
} from 'react';

import type { Config, Model } from 'src/types/config';
import { useConfig } from '../ConfigContext';
import {
 GEMINI_URL, GROQ_URL, OPENAI_URL, OPENROUTER_URL, 
} from '../constants';

const HOST_OLLAMA = 'ollama';
const HOST_GEMINI = 'gemini';
const HOST_LMSTUDIO = 'lmStudio';
const HOST_GROQ = 'groq';
const HOST_OPENAI = 'openai';
const HOST_OPENROUTER = 'openrouter';

const fetchDataSilently = async (url: string, ModelSettingsPanel = {}) => {
  try {
    const res = await fetch(url, ModelSettingsPanel);

    if (!res.ok) {
      console.error(`[fetchDataSilently] HTTP error! Status: ${res.status} for URL: ${url}`);

      return undefined;
    }

    const data = await res.json();

    return data;
  } catch (error) {
    console.error(`[fetchDataSilently] Fetch or JSON parse error for URL: ${url}`, error);

    return undefined;
  }
};

interface ServiceConfig {
  host: string;
  isEnabled: (config: Config) => boolean;
  getUrl: (config: Config) => string | null;
  getFetchOptions?: (config: Config) => RequestInit | undefined;
  parseFn: (data: any, host: string) => Model[];
}

export const useUpdateModels = () => {
  const { config, updateConfig } = useConfig();
  const configRef = useRef(config);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const FETCH_INTERVAL =  30 * 1000;
  const lastFetchRef = useRef(0);

  const fetchAllModels = useCallback(async () => {
    const now = Date.now();

    if (now - lastFetchRef.current < FETCH_INTERVAL) {
      console.log('[useUpdateModels] Model fetch throttled');

      return;
    }

    lastFetchRef.current = now;

    const currentConfig = configRef.current;

    if (!currentConfig) {
      console.warn('[useUpdateModels] Config not available, skipping fetch.');

      return;
    }

    const serviceConfigs: ServiceConfig[] = [
      {
        host: HOST_OLLAMA,
        isEnabled: cfg => !!cfg.ollamaUrl && cfg.ollamaConnected === true,
        getUrl: cfg => `${cfg.ollamaUrl}/v1/models`,
        parseFn: (data, host) => (data?.data as Model[] ?? []).map(m => ({
          ...m,
          id: m.id,
          name: m.name || m.id,
          host,
          context_length: m.num_ctx,
        })),
      },
      {
        host: HOST_GEMINI,
        isEnabled: cfg => !!cfg.geminiApiKey,
        getUrl: () => GEMINI_URL,
        getFetchOptions: cfg => ({ headers: { Authorization: `Bearer ${cfg.geminiApiKey}` } }),
        parseFn: (data, host) => (data?.data as Model[] ?? []).map(m => ({
          ...m, id: m.id, name: m.name, host, context_length: m.inputTokenLimit,
        })),
      },
      {
        host: HOST_LMSTUDIO,
        isEnabled: cfg => !!cfg.lmStudioUrl && cfg.lmStudioConnected === true,
        getUrl: cfg => `${cfg.lmStudioUrl}/v1/models`,
        parseFn: (data, host) => (data?.data as Model[] ?? []).map(m => ({
          ...m,
          id: m.id,
          name: m.name || m.id,
          host,
          context_length: m.context_length,
        })),
      },
      {
        host: HOST_GROQ,
        isEnabled: cfg => !!cfg.groqApiKey,
        getUrl: () => GROQ_URL,
        getFetchOptions: cfg => ({ headers: { Authorization: `Bearer ${cfg.groqApiKey}` } }),
        parseFn: (data, host) => (data?.data as Model[] ?? []).map(m => ({
          ...m,
          id: m.id.includes('/') ? m.id : `${host}_${m.id}`,
          name: m.name || m.id,
          host,
          context_length: m.context_window,
        })),
      },
      {
        host: HOST_OPENAI,
        isEnabled: cfg => !!cfg.openAiApiKey,
        getUrl: () => OPENAI_URL,
        getFetchOptions: cfg => ({ headers: { Authorization: `Bearer ${cfg.openAiApiKey}` } }),
        parseFn: (data, host) => (data?.data as Model[] ?? []).filter(m => m.id.startsWith('gpt-')).map(m => ({
          ...m,
          id: m.id,
          name: m.name || m.id,
          host,
          context_length: m.context_length,
        })),
      },
      {
        host: HOST_OPENROUTER,
        isEnabled: cfg => !!cfg.openRouterApiKey,
        getUrl: () => OPENROUTER_URL,
        getFetchOptions: cfg => ({ headers: { Authorization: `Bearer ${cfg.openRouterApiKey}` } }),
        parseFn: (data, host) => (data?.data as Model[] ?? []).map(m => ({
          ...m,
          id: `${host}_${m.id}`,
          name: m.name || m.id,
          host,
          context_length: m.context_length,
        })),
      },
      ...(currentConfig.customEndpoints || []).map(customEndpoint => ({
        host: customEndpoint.id,
        isEnabled: () => customEndpoint.connected && !!customEndpoint.endpoint,
        getUrl: () => {
          const endpointUrl = customEndpoint.endpoint;

          if (!endpointUrl) return null;

          const baseUrl = endpointUrl.endsWith('/') ? endpointUrl.slice(0, -1) : endpointUrl;

          return `${baseUrl}/models`;
        },
        getFetchOptions: () => ({ headers: { Authorization: `Bearer ${customEndpoint.apiKey}` } }),
        parseFn: (data: any, host: string) => {
          const modelsArray = Array.isArray(data) ? data : data?.data;

          if (modelsArray && Array.isArray(modelsArray)) {
            return (modelsArray as Model[]).map(m => ({
              ...m,
              id: `${host}_${m.id}`,
              name: m.name || m.id,
              host,
              host_display_name: customEndpoint.name,
              context_length: m.context_length || m.context_window || m.inputTokenLimit,
            }));
          }

          return [];
        },
      })),
    ];

    console.log('[useUpdateModels] Starting model fetch for all configured services...');

    const results = await Promise.allSettled(
      serviceConfigs.map(async service => {
        if (!service.isEnabled(currentConfig)) {
          return {
 host: service.host, models: [], status: 'disabled' as const, 
};
        }

        const url = service.getUrl(currentConfig);

        if (!url) {
          console.warn(`[useUpdateModels] Could not determine URL for host: ${service.host}`);

          return {
 host: service.host, models: [], status: 'error' as const, error: 'Invalid URL', 
};
        }

        const fetchOptions = service.getFetchOptions ? service.getFetchOptions(currentConfig) : {};
        const data = await fetchDataSilently(url, fetchOptions);

        if (data) {
          const parsedModels = service.parseFn(data, service.host);

          return {
 host: service.host, models: parsedModels, status: 'success' as const, 
};
        } else {
          return {
 host: service.host, models: [], status: 'error' as const, error: 'Fetch failed', 
};
        }
      }),
    );

    const newOverallModels: Model[] = [];
    const pendingConfigUpdates: Partial<Config> = {};

    const customEndpoints = currentConfig.customEndpoints || [];
    // Deep copy for safe modification
    const newCustomEndpoints = JSON.parse(JSON.stringify(customEndpoints));
    let customEndpointsModified = false;

    results.forEach(result => {
      if (result.status === 'fulfilled') {
        const {
 host, models, status,
} = result.value;
        if (status === 'success') {
          newOverallModels.push(...models);
        } else if (status === 'error') {
          console.log(`[useUpdateModels] Fetch failed for host: ${host}`);
          if (host === HOST_OLLAMA) {
            if (currentConfig.ollamaConnected) {
              pendingConfigUpdates.ollamaConnected = false;
            }
          } else if (host === HOST_LMSTUDIO) {
            if (currentConfig.lmStudioConnected) {
              pendingConfigUpdates.lmStudioConnected = false;
            }
          } else {
            const endpointIndex = newCustomEndpoints.findIndex((e: any) => e.id === host);
            if (endpointIndex > -1 && newCustomEndpoints[endpointIndex].connected) {
              newCustomEndpoints[endpointIndex].connected = false;
              customEndpointsModified = true;
            }
          }
        }
      } else if (result.status === 'rejected') {
        console.error('[useUpdateModels] A service promise was rejected:', result.reason);
      }
    });

    if (customEndpointsModified) {
      pendingConfigUpdates.customEndpoints = newCustomEndpoints;
    }

    console.log('[useUpdateModels] Fetched models:', newOverallModels);

    const originalConfigModels = currentConfig.models || [];

    const haveModelsChanged = (newModelsList: Model[], existingModelsList: Model[]) => {
      if (newModelsList.length !== existingModelsList.length) return true;

      const sortById = (a: Model, b: Model) => a.id.localeCompare(b.id);
      const sortedNew = [...newModelsList].sort(sortById);
      const sortedExisting = [...existingModelsList].sort(sortById);

      return JSON.stringify(sortedNew) !== JSON.stringify(sortedExisting);
    };

    if (haveModelsChanged(newOverallModels, originalConfigModels)) {
      console.log(`[useUpdateModels] Aggregated models changed. Updating config.`);
      pendingConfigUpdates.models = newOverallModels;
    }

    const currentSelectedModel = currentConfig.selectedModel;
    const finalModelsForSelection = pendingConfigUpdates.models || originalConfigModels;

    const isSelectedStillAvailable = currentSelectedModel &&
      finalModelsForSelection.some(m => m.id === currentSelectedModel);

    const newSelectedModel = isSelectedStillAvailable ? currentSelectedModel : finalModelsForSelection[0]?.id;

    if (newSelectedModel !== currentSelectedModel || pendingConfigUpdates.models) {
      pendingConfigUpdates.selectedModel = newSelectedModel;
    }

    if (Object.keys(pendingConfigUpdates).length > 0) {
      console.log('[useUpdateModels] Applying config updates:', pendingConfigUpdates);
      updateConfig(pendingConfigUpdates);
    } else {
      console.log(`[useUpdateModels] No changes to models or selectedModel needed.`);
    }

    console.log('[useUpdateModels] Model fetch cycle complete.');
  }, [updateConfig, FETCH_INTERVAL]);

  return { fetchAllModels };
};
