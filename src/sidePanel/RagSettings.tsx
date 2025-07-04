import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FiHelpCircle, FiRefreshCw, FiZap } from "react-icons/fi"; // Using FiZap for "Update", FiHelpCircle for tooltip
import { useConfig } from "./ConfigContext";
import { SettingTitle } from './SettingsTitle';
import { cn } from "@/src/background/util";
import React, { useEffect, useState, useRef } from "react";
import { type EmbeddingModelConfig, type Model, type Config as AppConfig } from "@/src/types/config";
import { GEMINI_URL, GROQ_URL, OPENAI_URL, OPENROUTER_URL } from './constants';
import { normalizeApiEndpoint } from "src/background/util";


// Helper function to get API URL (can be moved to a util file later)
const getApiUrlForProvider = (providerName: string, appConfig: AppConfig): string => {
  switch (providerName?.toLowerCase()) {
    case 'openai':
      return OPENAI_URL.replace('/chat/completions', '/embeddings'); // Adjust for embeddings endpoint
    case 'ollama':
      return normalizeApiEndpoint(appConfig.ollamaUrl || '') + '/api/embeddings';
    case 'lmstudio':
      return normalizeApiEndpoint(appConfig.lmStudioUrl || '') + '/v1/embeddings';
    case 'gemini':
      // Gemini specific model naming convention for embeddings might be needed.
      // Example: "models/embedding-001" - the modelId itself might contain this.
      // The GEMINI_URL is for "generateContent", embeddings might be different.
      // For now, assuming modelId includes full path if necessary or API handles it.
      // Placeholder: adjust if Gemini has a distinct embedding API base URL.
      return GEMINI_URL.replace(':generateContent', ':embedContent'); // Adjust based on actual Gemini API
    case 'groq':
      // Groq primarily offers inference, not standalone embeddings via its public API.
      // This case might need to be handled or disabled if Groq doesn't support this.
      // Placeholder: return a generic or empty URL, or handle error upstream.
      console.warn("Groq may not support standalone embeddings. Check API documentation.");
      return GROQ_URL.replace('/chat/completions', '/embeddings'); // Likely incorrect, placeholder
    case 'openrouter':
      return OPENROUTER_URL.replace('/chat/completions', '/embeddings');
    case 'custom':
      return normalizeApiEndpoint(appConfig.customEndpoint || '') + '/v1/embeddings';
    default:
      console.warn(`Unknown provider for API URL: ${providerName}`);
      return '';
  }
};

// Helper function to get API Key (can be moved to a util file later)
const getApiKeyForProvider = (providerName: string, appConfig: AppConfig): string | undefined => {
  switch (providerName?.toLowerCase()) {
    case 'openai':
      return appConfig.openAiApiKey;
    case 'gemini':
      return appConfig.geminiApiKey;
    case 'groq':
      return appConfig.groqApiKey;
    case 'openrouter':
      return appConfig.openRouterApiKey;
    case 'custom':
      return appConfig.customApiKey;
    // Ollama and LMStudio typically don't use API keys directly in this manner
    case 'ollama':
    case 'lmstudio':
      return undefined;
    default:
      return undefined;
  }
};


export const RagSettings = () => {
  const { config, updateConfig } = useConfig();

  // BM25 specific
  const bm25k1 = config.rag?.bm25?.k1 ?? 1.2;
  const bm25b = config.rag?.bm25?.b ?? 0.75;
  const bm25TopK = config.rag?.bm25?.topK ?? 50;

  // Semantic search specific
  const semanticThreshold = config.rag?.semantic_threshold ?? 0.6;
  const semanticTopK = config.rag?.semantic_top_k ?? 50;

  // Hybrid search & general
  const bm25Weight = config.rag?.bm25_weight ?? 0.5;
  const chunkSize = config.rag?.chunkSize ?? 512;
  // const embeddingModel = config.rag?.embedding_model ?? 'text-embedding-3-small'; // Replaced by new selector

  // State for model selection
  const [searchQuery, setSearchQuery] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [selectedEmbeddingModelDisplay, setSelectedEmbeddingModelDisplay] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);


  // Load initial embedding model config from storage and set display
  useEffect(() => {
    chrome.storage.local.get('embeddingModelConfig', (result) => {
      if (result.embeddingModelConfig) {
        const storedConfig = result.embeddingModelConfig as EmbeddingModelConfig;
        setSelectedEmbeddingModelDisplay(`[${storedConfig.providerName}] ${storedConfig.modelId}`);
        // Also ensure the RAG config in context is updated if this is the source of truth
        // This might be redundant if RagSettings directly updates chrome.storage and background service handles context/config updates
      } else if (config.rag?.embedding_model && config.models) {
        // Fallback to existing config.rag.embedding_model if embeddingModelConfig is not set
        // This helps with migration or if the user had a model set before this feature
        const currentModelId = config.rag.embedding_model;
        const modelDetail = config.models.find(m => m.id === currentModelId);
        if (modelDetail) {
            setSelectedEmbeddingModelDisplay(`[${modelDetail.host || 'Unknown'}] ${modelDetail.id}`);
        } else {
            setSelectedEmbeddingModelDisplay(currentModelId); // Display just the ID if host not found
        }
      }
    });
  }, [config.rag?.embedding_model, config.models]);


  const allModels: Model[] = config.models || [];
  const filteredModels = allModels
    .map(model => ({
      ...model,
      providerName: model.host || 'Unknown', // Ensure providerName for display
      displayName: `[${model.host || 'Unknown'}] ${model.id}`
    }))
    .filter(model => {
      const modelIdLower = model.id.toLowerCase();
      const queryLower = searchQuery.toLowerCase();
      const displayNameLower = model.displayName.toLowerCase();

      if (!queryLower) return true; // Show all if no search query

      // Model must match the query text either in display name or model ID
      const queryMatch = displayNameLower.includes(queryLower) || modelIdLower.includes(queryLower);
      if (!queryMatch) return false;

      // If query specifically asks for "embed", model must also be an "embed" model
      if (queryLower.includes('embed')) {
        return modelIdLower.includes('embed');
      }
      
      // Otherwise, if it matched the query, it's a candidate
      return true;
    })
    .sort((a, b) => {
        // Prioritize models with "embed" in their name
        const aHasEmbed = a.id.toLowerCase().includes('embed');
        const bHasEmbed = b.id.toLowerCase().includes('embed');
        if (aHasEmbed && !bHasEmbed) return -1;
        if (!aHasEmbed && bHasEmbed) return 1;
        return a.displayName.localeCompare(b.displayName); // Alphabetical otherwise
    });


  const handleModelSelect = (model: Model) => {
    const providerName = model.host || 'Unknown';
    const modelId = model.id;

    const apiUrl = getApiUrlForProvider(providerName, config);
    const apiKey = getApiKeyForProvider(providerName, config);

    if (!apiUrl) {
      console.error(`Could not determine API URL for provider: ${providerName} and model: ${modelId}. Aborting config save.`);
      // Optionally, provide user feedback here (e.g., a toast notification)
      return;
    }

    const newEmbeddingConfig: EmbeddingModelConfig = {
      providerName,
      modelId,
      apiUrl,
      apiKey,
    };

    chrome.storage.local.set({ embeddingModelConfig: newEmbeddingConfig }, () => {
      console.log('Embedding model configuration saved:', newEmbeddingConfig);
      setSelectedEmbeddingModelDisplay(`[${providerName}] ${modelId}`);
      updateConfig({ rag: { ...config.rag, embedding_model: modelId } }); // Keep legacy field in sync for now
    });

    setSearchQuery('');
    setInputFocused(false);
  };


  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current && !inputRef.current.contains(event.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node)
      ) {
        setInputFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  // Timestamps for buttons
  const bm25LastRebuild = config.rag?.bm25LastRebuild ?? "Never";
  const embeddingsLastRebuild = config.rag?.embeddingsLastRebuild ?? "Never";
  const embeddingsLastUpdate = config.rag?.embeddingsLastUpdate ?? "Never";

  const handleRebuildBm25 = () => {
    console.log("Rebuilding BM25 Index...");
    // In a real scenario, this would trigger the rebuild and then update the timestamp
    updateConfig({ rag: { ...config.rag, bm25LastRebuild: new Date().toLocaleString() } });
  };

  const handleRebuildEmbeddings = () => {
    console.log("Rebuilding Embeddings...");
    updateConfig({ rag: { ...config.rag, embeddingsLastRebuild: new Date().toLocaleString() } });
  };

  const handleUpdateEmbeddings = () => {
    console.log("Updating Embeddings...");
    updateConfig({ rag: { ...config.rag, embeddingsLastUpdate: new Date().toLocaleString() } });
  };

  return (
    <AccordionItem
      value="rag-settings"
      className={cn(
        "bg-[var(--input-background)] border-[var(--text)]/10 rounded-xl shadow-md",
        "transition-all duration-150 ease-in-out",
        "hover:border-[var(--active)] hover:brightness-105"
      )}
    >
      <AccordionTrigger
        className={cn(
          "flex items-center justify-between w-full px-3 py-2 hover:no-underline",
          "text-[var(--text)] font-medium",
          "hover:brightness-95",
        )}
      >
        <SettingTitle icon="🗃️" text="RAG Settings" />
      </AccordionTrigger>
      <AccordionContent className="px-3 pb-4 pt-2 text-[var(--text)]">
        <TooltipProvider>
          <div className="space-y-6">
            {/* BM25 k1 */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label htmlFor="bm25-k1" className="text-base font-medium text-foreground cursor-help">
                      BM25 k1 ({bm25k1.toFixed(1)})
                    </Label>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-sm border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md rounded-md">
                    <p>Term frequency saturation (k1). Default: 1.2. Higher values increase sensitivity to term frequency.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="bm25-k1"
                type="number"
                step="0.1"
                value={bm25k1}
                onChange={(e) => updateConfig({ rag: { ...config.rag, bm25: { ...config.rag?.bm25, k1: parseFloat(e.target.value) } } })}
                className="w-full h-8"
              />
              <p className="text-xs text-[var(--text)]/70">
                Advanced: Controls term frequency scaling. Default: 1.2
              </p>
            </div>

            {/* BM25 b */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label htmlFor="bm25-b" className="text-base font-medium text-foreground cursor-help">
                      BM25 b ({bm25b.toFixed(2)})
                    </Label>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-sm border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md rounded-md">
                    <p>Length normalization (b). Default: 0.75. Value between 0 and 1. Higher values increase normalization.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="bm25-b"
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={bm25b}
                onChange={(e) => updateConfig({ rag: { ...config.rag, bm25: { ...config.rag?.bm25, b: parseFloat(e.target.value) } } })}
                className="w-full h-8"
              />
              <p className="text-xs text-[var(--text)]/70">
                Advanced: Controls document length normalization. Default: 0.75
              </p>
            </div>

            {/* BM25 Top K */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label htmlFor="bm25-top-k" className="text-base font-medium text-foreground cursor-help">
                      BM25 Top K ({bm25TopK})
                    </Label>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-sm border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md rounded-md">
                    <p>Number of top documents to retrieve using BM25 lexical search. Default: 50.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="bm25-top-k"
                type="number"
                step="1"
                min="1"
                max="100" // Assuming a reasonable maximum
                value={bm25TopK}
                onChange={(e) => updateConfig({ rag: { ...config.rag, bm25: { ...config.rag?.bm25, topK: parseInt(e.target.value) } } })}
                className="w-full h-8"
              />
              <p className="text-xs text-[var(--text)]/70">
                Number of BM25 documents to retrieve. Default: 50
              </p>
            </div>

            {/* BM25 Weight */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label htmlFor="bm25-weight" className="text-base font-medium text-foreground cursor-help">
                      BM25 Weight ({bm25Weight.toFixed(2)})
                    </Label>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-sm border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md rounded-md">
                    <p>Weight for BM25 lexical search results in hybrid search. Slider 0–1. Default: 0.5. Higher values give more weight to lexical search.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Slider
                id="bm25-weight"
                min={0}
                max={1}
                step={0.01}
                value={[bm25Weight]}
                onValueChange={(value) => updateConfig({ rag: { ...config.rag, bm25_weight: value[0] } })}
                variant="themed"
              />
              <p className="text-xs text-[var(--text)]/70">
                Core UX: Balance between lexical (BM25) and semantic search. Default: 0.5
              </p>
            </div>

            {/* Semantic Threshold */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label htmlFor="semantic-threshold" className="text-base font-medium text-foreground cursor-help">
                      Semantic Threshold ({semanticThreshold.toFixed(2)})
                    </Label>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-sm border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md rounded-md">
                    <p>Minimum similarity score for semantic search results. Results below this threshold are ignored. Default: 0.6.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="semantic-threshold"
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={semanticThreshold}
                onChange={(e) => updateConfig({ rag: { ...config.rag, semantic_threshold: parseFloat(e.target.value) } })}
                className="w-full h-8"
              />
              <p className="text-xs text-[var(--text)]/70">
                Ignore semantic results below this similarity. Default: 0.6
              </p>
            </div>

            {/* Semantic Top K */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label htmlFor="semantic-top-k" className="text-base font-medium text-foreground cursor-help">
                      Semantic Top K ({semanticTopK})
                    </Label>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-sm border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md rounded-md">
                    <p>Number of top documents to retrieve using semantic search, *after* filtering by threshold. Default: 50.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="semantic-top-k"
                type="number"
                step="1"
                min="1"
                max="100" // Assuming a reasonable maximum
                value={semanticTopK}
                onChange={(e) => updateConfig({ rag: { ...config.rag, semantic_top_k: parseInt(e.target.value) } })}
                className="w-full h-8"
              />
              <p className="text-xs text-[var(--text)]/70">
                Number of semantic results (post-threshold). Default: 50
              </p>
            </div>

            {/* Chunk Size */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label htmlFor="chunk-size" className="text-base font-medium text-foreground cursor-help">
                      Chunk Size ({chunkSize} tokens)
                    </Label>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-sm border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md rounded-md">
                    <p>Maximum number of tokens in each text chunk. Affects context granularity. Default: 512 tokens.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="chunk-size"
                type="number"
                step="10" // Chunk sizes are often in multiples
                min="50"
                max="2000"
                value={chunkSize}
                onChange={(e) => updateConfig({ rag: { ...config.rag, chunkSize: parseInt(e.target.value) } })}
                className="w-full h-8"
              />
              <p className="text-xs text-[var(--text)]/70">
                Affects context granularity. Default: 512 tokens
              </p>
            </div>

            {/* Embedding Model Selector */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label htmlFor="embedding-model-select" className="text-base font-medium text-foreground">
                  Embedding Model
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-[var(--text)]/70 hover:text-[var(--text)]">
                      <FiHelpCircle />
                    </Button>
                  </TooltipTrigger>
                   <TooltipContent side="top" className="max-w-sm border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md rounded-md">
                    <p>
                      For best results, choose a model designed for embeddings.
                      If using a custom model not listed, consider renaming it to include 'embed' for model discovery here.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="relative">
                <Input
                  id="embedding-model-select"
                  ref={inputRef}
                  type="text"
                  value={inputFocused ? searchQuery : selectedEmbeddingModelDisplay}
                  placeholder={inputFocused ? "Search embedding models..." : (selectedEmbeddingModelDisplay || "Select embedding model...")}
                  onFocus={() => {
                    // Fetch models again on focus? Or rely on global state being up-to-date.
                    // For now, assume config.models is fresh.
                    setInputFocused(true);
                  }}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={cn(
                    "w-full h-9 text-sm", // Adjusted size to match SettingsSheet
                    "text-[var(--text)] rounded-md shadow-sm",
                    "focus:border-[var(--active)] focus:ring-1 focus:ring-[var(--active)]",
                    "hover:border-[var(--active)]/70",
                    "bg-[var(--input-background)] border-[var(--text)]/20"
                  )}
                />
                {inputFocused && (
                  <div
                    ref={dropdownRef}
                    className={cn(
                      "absolute z-10 w-full mt-1",
                      "bg-[var(--bg)] border border-[var(--text)]/20 rounded-md shadow-lg", // Changed to --bg
                      "max-h-60 overflow-y-auto no-scrollbar py-1"
                    )}
                  >
                    {filteredModels.length > 0 ? (
                      filteredModels.map((model) => (
                        <Button
                          key={model.id + (model.host || '')} // More unique key
                          variant="ghost"
                          className={cn(
                            "w-full justify-start text-left h-auto px-3 py-1.5 text-sm", // Adjusted padding & height
                            "text-[var(--text)] hover:bg-[var(--active)]/20 focus:bg-[var(--active)]/30",
                            "font-normal" // Ensure text is not bolded like some buttons
                          )}
                          onClick={() => handleModelSelect(model)}
                        >
                          {model.displayName}
                           {model.id.toLowerCase().includes('embed') && (
                            <span className="ml-2 px-1.5 py-0.5 text-xs rounded-sm bg-[var(--active)]/20 text-[var(--active)]">
                              Embed
                            </span>
                          )}
                        </Button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-[var(--text)]/70">
                        No models found. Try a different search or check your model provider configurations.
                      </div>
                    )}
                  </div>
                )}
              </div>
               <p className="text-xs text-[var(--text)]/70">
                Selected: {selectedEmbeddingModelDisplay || 'None'}
              </p>
            </div>

            {/* Index Management Buttons */}
            <div className="space-y-2 pt-4 border-t border-[var(--text)]/20">
              <Label className="text-base font-medium text-foreground">Index Management</Label>

              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 px-2 py-1 text-sm"
                  onClick={handleRebuildBm25}
                >
                  <FiRefreshCw className="h-4 w-4" /> Rebuild BM25
                </Button>
                <span className="text-xs text-[var(--text)]/60 whitespace-nowrap">
                  Last: {bm25LastRebuild}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 px-2 py-1 text-sm"
                  onClick={handleRebuildEmbeddings}
                >
                  <FiRefreshCw className="h-4 w-4" /> Rebuild Embeddings
                </Button>
                <span className="text-xs text-[var(--text)]/60 whitespace-nowrap">
                  Last: {embeddingsLastRebuild}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 px-2 py-1 text-sm"
                  onClick={handleUpdateEmbeddings}
                >
                  <FiZap className="h-4 w-4" /> Update Embeddings
                </Button>
                <span className="text-xs text-[var(--text)]/60 whitespace-nowrap">
                  Last: {embeddingsLastUpdate}
                </span>
              </div>
            </div>

          </div>
        </TooltipProvider>
      </AccordionContent>
    </AccordionItem>
  );
};
