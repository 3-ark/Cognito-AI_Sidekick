import { useCallback, useRef } from 'react';
import { useConfig } from '../ConfigContext';
import { GEMINI_URL, GROQ_URL, OPENAI_URL, OPENROUTER_URL } from '../constants';
import type { Config, Model } from 'src/types/config';
import { normalizeApiEndpoint } from 'src/background/util';

const HOST_OLLAMA = 'ollama';
const HOST_GEMINI = 'gemini';
const HOST_LMSTUDIO = 'lmStudio';
const HOST_GROQ = 'groq';
const HOST_OPENAI = 'openai';
const HOST_OPENROUTER = 'openrouter';
const HOST_CUSTOM = 'custom';

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
  onFetchFail?: (config: Config, updateConfig: (updates: Partial<Config>) => void) => void;
}


export const useUpdateModels = () => {
  const { config, updateConfig } = useConfig();

  const FETCH_INTERVAL =  30 * 1000;
  const lastFetchRef = useRef(0);

  const serviceConfigs: ServiceConfig[] = [
    {
      host: HOST_OLLAMA,
      isEnabled: (cfg) => !!cfg.ollamaUrl && cfg.ollamaConnected === true,
      getUrl: (cfg) => `${cfg.ollamaUrl}/api/tags`,
      parseFn: (data, host) => (data?.models as Model[] ?? []).map(m => ({ ...m, id: m.id ?? m.name, host })), // Use name if id missing
      onFetchFail: (_, updateCfg) => updateCfg({ ollamaConnected: false, ollamaUrl: '' }),
    },
    {
      host: HOST_GEMINI,
      isEnabled: (cfg) => !!cfg.geminiApiKey,
      getUrl: () => GEMINI_URL,
      getFetchOptions: (cfg) => ({ headers: { Authorization: `Bearer ${cfg.geminiApiKey}` } }),
      parseFn: (data, host) => (data?.data as Model[] ?? []).filter(m => m.id.startsWith('models/gemini')).map(m => ({ ...m, id: m.id, host })),
    },
    {
      host: HOST_LMSTUDIO,
      isEnabled: (cfg) => !!cfg.lmStudioUrl && cfg.lmStudioConnected === true,
      getUrl: (cfg) => `${cfg.lmStudioUrl}/v1/models`,
      parseFn: (data, host) => (data?.data as Model[] ?? []).map(m => ({ ...m, id: m.id, host })),
      onFetchFail: (_, updateCfg) => {
        console.log(`[useUpdateModels] LM Studio fetch failed, setting lmStudioConnected: false`);
        updateCfg({ lmStudioConnected: false });
      },
    },
    {
      host: HOST_GROQ,
      isEnabled: (cfg) => !!cfg.groqApiKey,
      getUrl: () => GROQ_URL,
      getFetchOptions: (cfg) => ({ headers: { Authorization: `Bearer ${cfg.groqApiKey}` } }),
      parseFn: (data, host) => (data?.data as Model[] ?? []).map(m => ({ ...m, id: m.id, host })),
    },
    {
      host: HOST_OPENAI,
      isEnabled: (cfg) => !!cfg.openAiApiKey,
      getUrl: () => OPENAI_URL,
      getFetchOptions: (cfg) => ({ headers: { Authorization: `Bearer ${cfg.openAiApiKey}` } }),
      parseFn: (data, host) => (data?.data as Model[] ?? []).filter(m => m.id.startsWith('gpt-')).map(m => ({ ...m, id: m.id, host })),
    },
    {
      host: HOST_OPENROUTER,
      isEnabled: (cfg) => !!cfg.openRouterApiKey,
      getUrl: () => OPENROUTER_URL,
      getFetchOptions: (cfg) => ({ headers: { Authorization: `Bearer ${cfg.openRouterApiKey}` } }),
      parseFn: (data, host) => (data?.data as Model[] ?? []).map(m => ({ ...m, id: m.id, context_length: m.context_length, host })),
    },
    {
      host: HOST_CUSTOM,
      isEnabled: (cfg) => !!cfg.customEndpoint,
      getUrl: (cfg) => {
        const normalizedUrl = normalizeApiEndpoint(cfg.customEndpoint);
        return `${normalizedUrl}/v1/models`;
      },
      getFetchOptions: (cfg) => ({ headers: { Authorization: `Bearer ${cfg.customApiKey}` } }),
      parseFn: (data, host) => {
        // Handle both { data: [...] } and [...] structures
        const modelsArray = Array.isArray(data) ? data : data?.data;
        if (modelsArray && Array.isArray(modelsArray)) {
          return (modelsArray as Model[]).map(m => ({ ...m, id: m.id, host }));
        }
        return [];
      },
    },
  ];

  const fetchAllModels = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetchRef.current < FETCH_INTERVAL) {
      console.log('[useUpdateModels] Model fetch throttled');
      return;
    }
    lastFetchRef.current = now;

    const currentConfig = config;
    if (!currentConfig) {
      console.warn('[useUpdateModels] Config not available, skipping fetch.');
      return;
    }

    console.log('[useUpdateModels] Starting model fetch for all configured services...');

    const results = await Promise.allSettled(
      serviceConfigs.map(async (service) => {
        if (!service.isEnabled(currentConfig)) {
          return { host: service.host, models: [], status: 'disabled' as const };
        }

        const url = service.getUrl(currentConfig);
        if (!url) {
          console.warn(`[useUpdateModels] Could not determine URL for host: ${service.host}`);
          return { host: service.host, models: [], status: 'error' as const, error: 'Invalid URL' };
        }

        const fetchOptions = service.getFetchOptions ? service.getFetchOptions(currentConfig) : {};
        const data = await fetchDataSilently(url, fetchOptions);

        if (data) {
          const parsedModels = service.parseFn(data, service.host);
          return { host: service.host, models: parsedModels, status: 'success' as const };
        } else {
          if (service.onFetchFail) {
            service.onFetchFail(currentConfig, updateConfig);
          }
          return { host: service.host, models: [], status: 'error' as const, error: 'Fetch failed' };
        }
      })
    );

    let newOverallModels: Model[] = [];
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value.status === 'success') {
        newOverallModels.push(...result.value.models);
      }
    });

    const originalConfigModels = currentConfig.models || [];

    const haveModelsChanged = (newModelsList: Model[], existingModelsList: Model[]) => {
      if (newModelsList.length !== existingModelsList.length) return true;
      const sortById = (a: Model, b: Model) => a.id.localeCompare(b.id);
      const sortedNew = [...newModelsList].sort(sortById);
      const sortedExisting = [...existingModelsList].sort(sortById);
      return JSON.stringify(sortedNew) !== JSON.stringify(sortedExisting);
    };

    const pendingConfigUpdates: Partial<Config> = {};

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
      updateConfig(pendingConfigUpdates);
    } else {
      console.log(`[useUpdateModels] No changes to models or selectedModel needed.`);
    }

    console.log('[useUpdateModels] Model fetch cycle complete.');
  }, [config, updateConfig, FETCH_INTERVAL, serviceConfigs]);

  return { fetchAllModels };
};
