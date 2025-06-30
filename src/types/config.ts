export interface Persona {
  Ein: string;
  Jan: string;
  Spike: string;
  Sherlock: string;
  Agatha: string;
  Jet: string;
  Warren: string;
}

export interface Model {
  id: string;
  host?: 'groq' | 'ollama' | 'gemini' | 'lmStudio' | 'openai' | 'openrouter' | 'custom' | string;
  active?: boolean;
  context_length?: number;
  name?: string;
}
export interface Tool {
  name: string;
  description: string;
}
export type Tools = Tool[];

export interface TtsSettings {
  selectedVoice?: string;
  rate?:number;
  pitch?:number;
  volume?:number;
}

export const CHAT_MODE_OPTIONS = [
  { value: "chat", label: "Chat" },
  { value: "page", label: "Page" },
  { value: "web", label: "Web" },
] as const;

export type ChatMode = typeof CHAT_MODE_OPTIONS[number]['value'];

export type ChatStatus =
  | 'idle'
  | 'typing'
  | 'searching'
  | 'reading'
  | 'thinking'
  | 'done';
export interface Config {
  personas: Record<string, string>;
  persona: string;
  personaAvatars?: Record<string, string>;
  generateTitle?: boolean;
  backgroundImage?: boolean;
  animatedBackground?: boolean;
  webMode?: 'Duckduckgo' | 'Brave' | 'Google' | 'Wikipedia' | 'GoogleCustomSearch' | string;
  webLimit?: number;
  serpMaxLinksToVisit?: number;
  wikiNumBlocks?: number;
  wikiRerank?: boolean;
  wikiNumBlocksToRerank?: number;
  contextLimit: number;
  ModelSettingsPanel?: Record<string, unknown>;
  temperature: number;
  maxTokens: number;
  topP: number;
  presencepenalty: number;
  lmStudioUrl?: string;
  lmStudioConnected?: boolean;
  lmStudioError?: string | unknown;
  ollamaUrl?: string;
  ollamaConnected?: boolean;
  ollamaError?: string | unknown;
  groqApiKey?: string;
  groqConnected?: boolean;
  groqError?: string | unknown;
  geminiApiKey?: string;
  geminiConnected?: boolean;
  geminiError?: string | unknown;
  openAiApiKey?: string;
  openAiConnected?: boolean;
  openAiError?: string | unknown;
  openRouterApiKey?: string;
  openRouterConnected?: boolean;
  openRouterError?: string | unknown;
  customEndpoint?: string;
  customApiKey?: string;
  customConnected?: boolean;
  customError?: string | unknown;
  googleApiKey?: string;
  googleCx?: string;
  visibleApiKeys?: boolean;
  fontSize?: number;
  models?: Model[];
  selectedModel?: string;
  useNote?: boolean;
  noteContent?: string;
  chatMode?: Exclude<ChatMode, 'chat'>;
  theme?: string;
  customTheme?: {
    active?: string;
    bg?: string;
    text?: string;
    bold?: string;
    italic?: string;
    link?: string;
    codeBg?: string;
    codeFg?: string;
    preBg?: string;
    preFg?: string;
    mute?: string;
    tableBorder?: string;
    error?: string;
    success?: string;
    warning?: string;
    name?: string;
  };
  paperTexture?: boolean;
  panelOpen: boolean;
  tts?: TtsSettings;
  userName?: string;
  userProfile?: string;
  popoverTitleDraft?: string;
  popoverTagsDraft?: string;
  tools?: Tools;
  rag?: {
    bm25?: {
      k1?: number;
      b?: number;
    };
    topK?: number;
    chunkSize?: number;
  };
}

export interface ConfigContextType {
  config: Config;
  updateConfig: (newConfig: Partial<Config>) => void;
}