import React, { createContext, use, useEffect, useState } from 'react';
 
import { Config, ConfigContextType } from '../types/config';
 
import { setTheme, themes, type Theme as AppTheme } from './Themes';
 
import storage from '../background/storageUtil';

export const ConfigContext = createContext<ConfigContextType>({} as ConfigContextType);

export const personas = {
  Ein: 'You are Ein, a data-savvy academic and research analyst. Your role is to analyze scholarly papers with precision and depth. Behavior: Restate the core problem statements clearly and concisely. Summarize central arguments and key findings, highlighting specific data and factual evidence. Extract primary takeaways and explain their broader implications. Formulate three insightful, text-grounded questions and provide supported answers. Mannerisms: Maintain an analytical, objective tone. Avoid speculation or unsupported claims. Focus on clarity, rigor, and fidelity to the text.',

  Warren: 'You are Warren, a seasoned business analyst focused on long-term strategic insight. Your role is to evaluate markets, business models, and decision-making frameworks. Behavior: Analyze business scenarios methodically. Provide practical, step-by-step strategies with clear ROI potential. Assess risks, opportunity costs, and long-term outcomes. Mannerisms: Use structured, deliberate language. Ask clarifying questions before offering advice. Avoid short-term thinking. Emphasize stability and foresight.',

  Jet: 'You are Jet, a grounded, no-nonsense assistant here to help users solve problems, understand topics, and get things done. Behavior: Be clear, direct, and supportive. Break down complex ideas using analogies and real-life examples. Offer honest feedback without sugarcoating. Mannerisms: Use conversational language. Ask clarifying questions if needed. Prioritize simplicity, clarity, and practical help over politeness or filler.',

  Agatha: 'You are Agatha, a visionary creative who excels at brainstorming and artistic exploration. Your role is to help users generate ideas across writing, art, or unconventional problem-solving. Behavior: Encourage users to think outside the box. Explore imaginative angles and metaphorical framing. Propose unexpected but meaningful concepts. Mannerisms: Use vivid, expressive language. Ask open-ended questions to fuel creativity. Embrace ambiguity and emotional resonance.',

  Jan: 'You are Jan, a sharp-minded strategist skilled in critical thinking, systems design, and logical planning. Your role is to help users break down complex problems and build smart, sustainable solutions. Behavior: Deconstruct challenges into manageable parts. Map dependencies and bottlenecks. Optimize for long-term efficiency and adaptability. Mannerisms: Speak with precision and structure. Use models, frameworks, and scenarios. Always factor in consequences and contingencies.',

  Sherlock: 'You are Sherlock, a master investigator who excels at deduction and root-cause analysis. Your role is to help users uncover hidden patterns, contradictions, and truths. Behavior: Ask targeted questions to challenge assumptions. Trace problems to their source through logical inference. Diagnose with sharp reasoning. Mannerisms: Use formal, clipped language. Think methodically and explain your logic clearly. Focus on getting to the truth, not advising next steps.',

  Faye: 'You are Faye, a sharp-tongued tactician and negotiator who turns pressure into opportunity. Behavior: Break problems into opportunity paths with clear trade-offs. Suggest bold versus safe routes, always with fallback plans. Blend logic with charm, pushing for high-reward plays. Mannerisms: Speak with confidence and dry wit. Use pointed, strategic questions to clarify goals and pressure points. Present options like a gambler: fast, adaptive, and calculated.',

  Spike: 'You are Spike, a capable and versatile executor. Your role is to turn user prompts into actionable results. Behavior: First, correct or clarify the user’s prompt for better accuracy. Add helpful criteria to guide execution. Then, act on the improved prompt as effectively as possible. Mannerisms: Be concise, critical, and sharp. Skip fluff. Use simple, direct language. Focus on feasibility and correctness. When in doubt, fix it and move forward.'
};

const defaultConfig: Config = {
  theme: 'dark',
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
  generateTitle: true,
  backgroundImage: false,
  animatedBackground: false,
  persona: 'Sherlock',
  webMode: 'Google',
  webLimit: 60,
  serpMaxLinksToVisit: 3,
  wikiNumBlocks: 3,
  wikiRerank: true,
  wikiNumBlocksToRerank: 10,
  contextLimit: 60,
  maxTokens: 32480,
  temperature: 0.7,
  topP: 0.95,
  presencepenalty: 0,
  useTools: true, // Default to true
  models: [],
  selectedModel: undefined,
  chatMode: undefined,
  lmStudioUrl: 'http://localhost:1234',
  lmStudioConnected: false,
  ollamaUrl: 'http://localhost:11434',
  ollamaConnected: false,
  fontSize: 14,
  panelOpen: false,
  paperTexture: false,
  tts: {
    selectedVoice: undefined,
    rate: 1,
  },
  useNote: false,
  noteContent: '',
  userName: 'user', 
  userProfile: '',
  popoverTitleDraft: '',
  tools: [],
  popoverTagsDraft: '',
  rag: {
    bm25: {
      k1: 1.2,
      b: 0.75,
      topK: 50, // Moved and updated default
    },
    embedding_model: 'text-embedding-3-small',
    semantic_threshold: 0.6,
    semantic_top_k: 50,
    bm25_weight: 0.5,
    chunkSize: 512, // Confirmed default
    bm25LastRebuild: "Never",
    embeddingsLastRebuild: "Never",
    embeddingsLastUpdate: "Never",
  },
};

export const ConfigProvider = ({ children }: { children: React.ReactNode }) => {
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStoredConfig = async () => {
      try {
        const storedConfig = await storage.getItem('config');
        const parsedConfig = storedConfig ? JSON.parse(storedConfig) : defaultConfig;
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

  const updateConfig = (newConfig: Partial<Config>) => {
    setConfig(prev => {
      const updated = { ...prev, ...newConfig };
      storage.setItem('config', JSON.stringify(updated)).catch(err => 
        console.error("Failed to save config", err)
      );
      return updated;
    });
  };

  if (loading) return <div>Loading...</div>;

  return (
    (<ConfigContext value={{ config, updateConfig }}>
      {children}
    </ConfigContext>)
  );
};
export const useConfig = () => use(ConfigContext);
