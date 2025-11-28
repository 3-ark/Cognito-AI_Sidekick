import React, {
 createContext, useCallback, use, useEffect, useState,
} from 'react';

import storage from '../background/storageUtil';
import {
 Config, ConfigContextType, CustomEndpoint, 
} from '../types/config';

import {
 setTheme, type Theme as AppTheme,themes, 
} from './Customize';

export const ConfigContext = createContext<ConfigContextType>({} as ConfigContextType);

export const personas = {
  Ein: 'You are Ein, the intelligent data dog. You specialize in meticulous academic analysis. Behavior: Restate the research paper’s core problem clearly. Summarize key arguments with supporting data. Extract main takeaways and explain broader implications. Ask three insightful, grounded questions and answer them strictly based on the text. Mannerisms: Maintain precision, clarity, and discipline. Avoid speculation—stay factual, analytical, and to the point.',

  Warren: 'You are Warren Buffett, a legendary investor and business strategist. Your role is to analyze markets and business decisions with long-term wisdom. Behavior: Break down scenarios logically. Provide step-by-step, data-driven strategies. Prioritize value, sustainability, and risk management. Mannerisms: Speak plainly, avoid jargon. Ask clarifying questions to get the full picture. Deliver calm, rational advice based on deep understanding, not impulse.',

  Jet: 'You are Jet Black, a dependable, straight-talking partner who gets things done. Your role is to assist with clarity, efficiency, and grounded support. Behavior: Be direct and helpful. Break complex ideas into plain language. Use analogies or real-world examples when needed. Offer blunt, honest feedback. Mannerisms: Speak with a calm, no-nonsense tone. Ask simple questions when needed. Prioritize usefulness over formality.',

  Agatha: 'You are Agatha Christie, a master of intrigue and imagination. Your role is to help users develop creative ideas and story-rich solutions. Behavior: Encourage unusual angles. Suggest vivid concepts and unexpected twists. Embrace ambiguity and narrative tension. Mannerisms: Use evocative, descriptive language. Ask open-ended questions to stir imagination. Blend elegance with curiosity to unlock creativity.',

  Jan: 'You are Jan, a young, charming strategist known for precision and foresight. Your role is to tackle complex problems with logic and structure. Behavior: Break down challenges into clean, solvable layers. Map risks, define goals, and outline strategies with foresight. Prioritize efficiency, adaptability, and timing. Mannerisms: Speak in organized, clear language. Ask sharp questions to refine the plan. Always plan multiple steps ahead.',

  Sherlock: 'You are Sherlock Holmes, a master of deduction and detail. Your role is to uncover hidden patterns and trace problems to their core. Behavior: Examine clues, test assumptions, and isolate the root cause. Use logic, not opinion. Lay out your reasoning step-by-step. Mannerisms: Speak precisely and confidently. Ask surgical questions. Focus on uncovering truth over giving advice.',

  Faye: 'You are Faye Valentine, a sharp-tongued tactician and negotiator who turns pressure into opportunity. Behavior: Break problems into opportunity paths with clear trade-offs. Suggest bold versus safe routes, always with fallback plans. Blend logic with charm, pushing for high-reward plays. Mannerisms: Speak with confidence and dry wit. Use pointed, strategic questions to clarify goals and pressure points. Present options like a gambler: fast, adaptive, and calculated.',

  Spike: 'You are Spike Spiegel, a capable all-around executor with sharp instincts. Your role is to act on prompts with style, speed, and precision. Behavior: First, correct unclear or flawed prompts. Add any necessary criteria for proper execution. Then carry out the task effectively. Mannerisms: Speak casually but with clarity. Use blunt, practical language. Prioritize flow, function, and finesse—like everything’s just another bounty to bag.',
  
  Research: 'Function: Research summarizer. Tasks: 1) Extract main problem, 2) Summarize findings with cited evidence, 3) Give implications. Then generate 3 text-based Q&As grounded strictly in source. Constraints: No speculation. No filler.',

  Business: 'Function: Business strategist. Tasks: Analyze context, define risks, map opportunities, outline step-by-step plan. Focus on long-term viability and capital efficiency. Style: Direct, structured, risk-aware.',

  Explainer: 'Function: Task resolver + explainer. Tasks: Solve, clarify, or explain with minimal words. Break things down simply. Give feedback directly. Style: Plain talk, no small talk.',

  Creative: 'Function: Idea generator. Tasks: Propose unconventional, imaginative solutions. Reframe problems creatively. Prioritize emotion, story, surprise. Style: Brief prompts, fast divergence.',

  Planner: 'Function: Systems thinker. Tasks: Deconstruct complex issues, build modular strategies with contingencies. Output should show structure, logic, adaptability. Style: Precision-first.',

  Facts: 'Function: Logic analyst. Tasks: Spot inconsistencies, deduce hidden causes, map logical paths. Present facts and reasoning with evidence. Style: Surgical. No assumptions.',

  Conartist: 'Function: Strategic tactician. Tasks: Frame risky vs. safe plays, highlight leverage, suggest high-reward paths with exit plans. Style: Sharp, fast, pragmatic. Always ask: what’s your pivot?', 

  Executor: 'Function: Prompt executor. Tasks: 1) Correct and optimize user prompt, 2) Add needed constraints or success criteria, 3) Execute immediately. Style: Fast, accurate, clear. No delay. No fluff.',

};

const defaultConfig: Config = {
  theme: 'paper',
  customTheme: {
    active: '#7eaa6e',
    bg: '#c2e7b5',
    text: '#eadbdb',
    bold: '#af1b1b',
    link: '#003bb9',
    italic: '#09993e',
    codeFg: '#c2e7b5',
    codeBg: '#eadbdb',
    preBg: '#eadbdb',
    preFg: '#c2e7b5',
    tableBorder: '#eadbdb',
    mute: '#A9A9A9',
    error: '#af1b1b',
    warning: '#388e3c',
    success: '#7eaa6e',
    name: 'custom',
  },
  personas,
  persona: 'Sherlock',
  personaAvatars: {},
  generateTitle: true,
  backgroundImage: false,
  animatedBackground: true,
  webMode: 'Google',
  webLimit: 60,
  serpMaxLinksToVisit: 3,
  wikiNumBlocks: 3,
  wikiRerank: true,
  wikiNumBlocksToRerank: 10,
  contextLimit: 60,
  ModelSettingsPanel: {},
  temperature: 0.7,
  maxTokens: 32480,
  topP: 0.95,
  presencePenalty: 0,
  lmStudioUrl: 'http://localhost:1234',
  lmStudioConnected: false,
  lmStudioError: undefined,
  ollamaUrl: 'http://localhost:11434',
  ollamaConnected: false,
  ollamaError: undefined,
  groqApiKey: '',
  groqConnected: false,
  groqError: undefined,
  geminiApiKey: '',
  geminiConnected: false,
  geminiError: undefined,
  openAiApiKey: '',
  openAiConnected: false,
  openAiError: undefined,
  openRouterApiKey: '',
  openRouterConnected: false,
  openRouterError: undefined,
  customEndpoints: Array.from({ length: 3 }, (_, i) => ({
    id: `custom_endpoint_${i + 1}`,
    name: `Custom Endpoint ${i + 1}`,
    endpoint: '',
    apiKey: '',
    connected: false,
  })),
  googleApiKey: '',
  googleCx: '',
  visibleApiKeys: false,
  fontSize: 14,
  models: [],
  selectedModel: undefined,
  useNote: false,
  noteContent: '',
  chatMode: undefined,
  paperTexture: false,
  panelOpen: false,
  showFloatingButton: true,
  tts: {
    provider: 'browser',
    selectedVoice: undefined,
    rate: 1,
    pitch: 1,
    volume: 1,
    model: 'tts-1',
  },
  asr: {
    language: 'en',
    stopWord: 'stop',
  },
  userName: 'user',
  userProfile: '',
  popoverTitleDraft: '',
  popoverTagsDraft: '',
  popoverDescriptionDraft: '',
  tools: [],
  ragConfig: {
    model: "text-embedding-3-small",
    use_gpu: true,
    semantic_top_k: 20,
    similarity_threshold: 0.3,
    BM25_top_k: 50,
    k: 1.2,
    b: 0.75,
    d: 0.5,
    bm25_weight: 0.5,
    final_top_k: 10,
    autoEmbedOnSave: false,
    maxChunkChars: 2000,
    minChunkChars: 150,
    overlapChars: 50,
    lambda: 0.5,
    useContextualSummaries: false,
  },
  latexEnabled: true,
  readerLens: '',
};

export const ConfigProvider = ({ children }: { children: React.ReactNode }) => {
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStoredConfig = async () => {
      try {
        const storedConfig = await storage.getItem('config');
        const parsedConfig = storedConfig ? JSON.parse(storedConfig) : defaultConfig;

        if (parsedConfig.customEndpoint) {
          const migratedEndpoints: CustomEndpoint[] = Array.from({ length: 3 }, (_, i) => ({
            id: `custom_endpoint_${i + 1}`,
            name: `Custom Endpoint ${i + 1}`,
            endpoint: '',
            apiKey: '',
            connected: false,
          }));

          migratedEndpoints[0] = {
            ...migratedEndpoints[0],
            endpoint: parsedConfig.customEndpoint,
            apiKey: parsedConfig.customApiKey,
            connected: parsedConfig.customConnected,
            error: parsedConfig.customError,
          };

          delete parsedConfig.customEndpoint;
          delete parsedConfig.customApiKey;
          delete parsedConfig.customConnected;
          delete parsedConfig.customError;

          parsedConfig.customEndpoints = migratedEndpoints;
        }

        if (!parsedConfig.customEndpoints || parsedConfig.customEndpoints.length < 3) {
          const existingEndpoints = parsedConfig.customEndpoints || [];
          const numMissing = 3 - existingEndpoints.length;
          const newEndpoints = Array.from({ length: numMissing }, (_, i) => ({
            id: `custom_endpoint_${existingEndpoints.length + i + 1}`,
            name: `Custom Endpoint ${existingEndpoints.length + i + 1}`,
            endpoint: '',
            apiKey: '',
            connected: false,
          }));

          parsedConfig.customEndpoints = [...existingEndpoints, ...newEndpoints];
        }

        if (parsedConfig.dollarSignLatex !== undefined) {
          parsedConfig.latexEnabled = parsedConfig.dollarSignLatex;
          delete parsedConfig.dollarSignLatex;
        }

        setConfig(parsedConfig);
      } catch (e) {
        console.error("Failed to load config", e);
        setConfig(defaultConfig);
      } finally {
        setLoading(false);
      }
    };

    loadStoredConfig();
  }, []);

  useEffect(() => {
    const baseSize = config?.fontSize || defaultConfig.fontSize;

    document.documentElement.style.setProperty('font-size', `${baseSize}px`);

    const currentThemeName = config.theme || defaultConfig.theme!;
    const paperTextureEnabled = config.paperTexture ?? defaultConfig.paperTexture!;
    let themeToApply: AppTheme;

    if (currentThemeName === 'custom') {
      const baseCustomOrDefault = themes.find(t => t.name === 'custom') || defaultConfig.customTheme!;

      themeToApply = {
        ...baseCustomOrDefault, 
        ...(config.customTheme || {}), 
        name: 'custom', 
      } as AppTheme;
    } else {
      themeToApply = themes.find(t => t.name === currentThemeName) ||
                     themes.find(t => t.name === defaultConfig.theme!) ||
                     themes[0];
    }

    setTheme(themeToApply, paperTextureEnabled);

  }, [loading, config?.fontSize, config?.customTheme, config?.theme, config?.paperTexture]);

  const updateConfig = useCallback((newConfig: Partial<Config>) => {
    setConfig(prev => {
      const updated = { ...prev, ...newConfig };
      const ragConfigChanged = JSON.stringify(prev.ragConfig) !== JSON.stringify(updated.ragConfig);

      storage.setItem('config', JSON.stringify(updated))
        .then(() => {
          if (ragConfigChanged) {
            console.log('[ConfigContext] RAG config changed, notifying background script.');
            chrome.runtime.sendMessage({ type: 'APP_SETTINGS_UPDATED' });
          }
        })
        .catch(err =>
          console.error("Failed to save config", err),
        );

      return updated;
    });
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    (<ConfigContext value={{ config, updateConfig }}>
      {children}
    </ConfigContext>)
  );
};
export const useConfig = () => use(ConfigContext);
