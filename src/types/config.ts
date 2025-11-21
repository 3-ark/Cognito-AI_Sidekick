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
  context_window?: number;
  inputTokenLimit?: number;
  num_ctx?: number;
  host_display_name?: string;
  name?: string;
  supportedGenerationMethods?: string[];
}
export interface Tool {
  name: string;
  description: string;
}
export type Tools = Tool[];

export interface TtsSettings {
  provider?: string;
  selectedVoice?: string;
  rate?:number;
  pitch?:number;
  volume?:number;
  endpoint?: string;
  model?: string;
  customVoices?: string;
}

export interface AsrSettings {
  stopWord?: string;
  language?: string;
}

export interface CustomEndpoint {
  id: string;
  name: string;
  endpoint: string;
  apiKey: string;
  connected: boolean;
  error?: string;
}

export const CHAT_MODE_OPTIONS = [
  { value: "chat", label: "Chat" },
  { value: "page", label: "Page" },
  { value: "web", label: "Web" },
  { value: "file", label: "File" },
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
  presencePenalty: number;
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
  customEndpoints?: CustomEndpoint[];
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
  showFloatingButton?: boolean;
  windowPosition?: { x: number; y: number };
  windowSize?: { width: number; height: number };
  tts?: TtsSettings;
  asr?: AsrSettings;
  userName?: string;
  userProfile?: string;
  popoverTitleDraft?: string;
  popoverTagsDraft?: string;
  popoverDescriptionDraft?: string;
  tools?: Tools;
  ragConfig?: RagConfig;
  latexEnabled?: boolean;
  readerLens?: string;
}

export interface RagConfig {
  model: string;
  use_gpu: boolean;
  semantic_top_k: number;
  similarity_threshold: number;
  BM25_top_k: number;
  k: number; // Corresponds to BM25 k
  b: number;  // Corresponds to BM25 b
  d?: number; // Corresponds to BM25+ d (optional, defaults will be applied if not set)
  bm25_weight: number;
  autoEmbedOnSave: boolean;
  final_top_k?: number;

  // Chunking parameters
  maxChunkChars: number;
  minChunkChars: number;
  overlapChars: number;

  // MMR Reranking
  lambda: number;

  // Contextual Retrieval
  useContextualSummaries?: boolean;
}

export interface ConfigContextType {
  config: Config;
  updateConfig: (newConfig: Partial<Config>) => void;
}
