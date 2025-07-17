import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FiHelpCircle } from "react-icons/fi";
import { useConfig } from "./ConfigContext";
import { SettingTitle } from './SettingsTitle';
import { cn } from "@/src/background/util";
import React, { useState, useEffect, useRef } from 'react';
import { type EmbeddingModelConfig, type Model, type Config as AppConfig } from "@/src/types/config";
import { GEMINI_URL, GROQ_URL, OPENAI_URL, OPENROUTER_URL } from './constants';
import { normalizeApiEndpoint } from "@/src/background/util";

export const RagSettings = () => {
  const { config, updateConfig } = useConfig();

  // --- Embedding Model Selection Logic (Moved from SettingsSheet.tsx) ---
  const [ragSearchQuery, setRagSearchQuery] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [selectedEmbeddingModelDisplay, setSelectedEmbeddingModelDisplay] = useState<string>('');
  const ragInputRef = useRef<HTMLInputElement>(null);
  const ragDropdownRef = useRef<HTMLDivElement>(null);

  const getApiUrlForProvider = (providerName: string, appConfig: AppConfig): string => {
    switch (providerName?.toLowerCase()) {
      case 'openai': return OPENAI_URL.replace('/chat/completions', '/embeddings');
      case 'ollama': return normalizeApiEndpoint(appConfig.ollamaUrl || '') + '/api/embeddings';
      case 'lmstudio': return normalizeApiEndpoint(appConfig.lmStudioUrl || '') + '/v1/embeddings';
      case 'gemini': return GEMINI_URL.replace(':generateContent', ':embedContent');
      case 'groq': console.warn("Groq may not support standalone embeddings."); return GROQ_URL.replace('/chat/completions', '/embeddings');
      case 'openrouter': return OPENROUTER_URL.replace('/chat/completions', '/embeddings');
      case 'custom': return normalizeApiEndpoint(appConfig.customEndpoint || '') + '/v1/embeddings';
      default: console.warn(`Unknown provider for API URL: ${providerName}`); return '';
    }
  };

  const getApiKeyForProvider = (providerName: string, appConfig: AppConfig): string | undefined => {
    switch (providerName?.toLowerCase()) {
      case 'openai': return appConfig.openAiApiKey;
      case 'gemini': return appConfig.geminiApiKey;
      case 'groq': return appConfig.groqApiKey;
      case 'openrouter': return appConfig.openRouterApiKey;
      case 'custom': return appConfig.customApiKey;
      default: return undefined;
    }
  };

  useEffect(() => {
    chrome.storage.local.get('embeddingModelConfig', (result) => {
      if (result.embeddingModelConfig) {
        const storedConfig = result.embeddingModelConfig as EmbeddingModelConfig;
        setSelectedEmbeddingModelDisplay(`[${storedConfig.providerName}] ${storedConfig.modelId}`);
      } else if (config.rag?.embedding_model && config.models) {
        const currentModelId = config.rag.embedding_model;
        const modelDetail = config.models.find(m => m.id === currentModelId);
        if (modelDetail) setSelectedEmbeddingModelDisplay(`[${modelDetail.host || 'Unknown'}] ${modelDetail.id}`);
        else setSelectedEmbeddingModelDisplay(currentModelId);
      }
    });
  }, [config.rag?.embedding_model, config.models]);

  const allModels: Model[] = config.models || [];
  const filteredModels = allModels
    .map(model => ({ ...model, providerName: model.host || 'Unknown', displayName: `[${model.host || 'Unknown'}] ${model.id}` }))
    .filter(model => {
      const modelIdLower = model.id.toLowerCase();
      const queryLower = ragSearchQuery.toLowerCase();
      const displayNameLower = model.displayName.toLowerCase();
      if (!queryLower) return true;
      const queryMatch = displayNameLower.includes(queryLower) || modelIdLower.includes(queryLower);
      if (!queryMatch) return false;
      return !(queryLower.includes('embed') && !modelIdLower.includes('embed'));
    })
    .sort((a, b) => {
      const aHasEmbed = a.id.toLowerCase().includes('embed');
      const bHasEmbed = b.id.toLowerCase().includes('embed');
      if (aHasEmbed && !bHasEmbed) return -1;
      if (!aHasEmbed && bHasEmbed) return 1;
      return a.displayName.localeCompare(b.displayName);
    });

  const handleModelSelect = (model: Model) => {
    const providerName = model.host || 'Unknown';
    const modelId = model.id;
    const apiUrl = getApiUrlForProvider(providerName, config);
    const apiKey = getApiKeyForProvider(providerName, config);
    if (!apiUrl) { console.error(`Could not determine API URL for provider: ${providerName}`); return; }
    const newEmbeddingConfig: EmbeddingModelConfig = { providerName, modelId, apiUrl, apiKey };
    chrome.storage.local.set({ embeddingModelConfig: newEmbeddingConfig }, () => {
      setSelectedEmbeddingModelDisplay(`[${providerName}] ${modelId}`);
      updateConfig({ rag: { ...config.rag, embedding_model: modelId } });
    });
    setRagSearchQuery(''); setInputFocused(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ragInputRef.current && !ragInputRef.current.contains(event.target as Node) &&
          ragDropdownRef.current && !ragDropdownRef.current.contains(event.target as Node)) {
        setInputFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  // --- End Embedding Model Selection Logic ---

  // BM25 specific
  const bm25k1 = config.rag?.bm25?.k1 ?? 1.2;
  const bm25b = config.rag?.bm25?.b ?? 0.75;
  const bm25TopK = config.rag?.bm25?.topK ?? 50;

  // Semantic search specific
  const semanticThreshold = config.rag?.semantic_threshold ?? 0.1;
  const semanticTopK = config.rag?.semantic_top_k ?? 50;

  // Hybrid search & general
  const finalTopK = config.rag?.final_top_k ?? semanticTopK; // Fallback to semanticTopK then to a default in retrieverUtils
  const bm25Weight = config.rag?.bm25_weight ?? 0.5;
  const vectorDimension = config.rag?.vectorDimension ?? 1024;
  const embeddingMode = config.rag?.embeddingMode ?? 'manual';

  return (
    <AccordionItem
      value="rag-settings"
      className={cn(
        "bg-[var(--input-background)] border-[var(--text)]/20 shadow-md",
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
                Ignore semantic results below this similarity. Default: 0.1
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
            
            {/* Final Top K */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label htmlFor="final-top-k" className="text-base font-medium text-foreground cursor-help">
                      Final Top K ({finalTopK})
                    </Label>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-sm border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md rounded-md">
                    <p>Total number of reranked chunks to return after hybrid search. Default: {semanticTopK} (matches Semantic Top K if not set).</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="final-top-k"
                type="number"
                step="1"
                min="1"
                max="100" // Assuming a reasonable maximum
                value={finalTopK}
                onChange={(e) => updateConfig({ rag: { ...config.rag, final_top_k: parseInt(e.target.value) } })}
                className="w-full h-8"
              />
              <p className="text-xs text-[var(--text)]/70">
                Total reranked chunks to return. Default: {semanticTopK}
              </p>
            </div>

            {/* Vector Dimension */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label htmlFor="vector-dimension" className="text-base font-medium text-foreground cursor-help">
                      Vector Dimension (inactive for now) ({vectorDimension})
                    </Label>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-sm border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md rounded-md">
                    <p>The dimensionality of the embedding vectors. This is usually determined by the selected embedding model. Common values: 256, 512, 768, 1024, 1536, 3072. Default: 1024.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="vector-dimension"
                type="number"
                step="1" 
                min="128" // Lower bound for typical vector dimensions
                max="4096" // Upper bound for typical vector dimensions
                value={vectorDimension}
                onChange={(e) => updateConfig({ rag: { ...config.rag, vectorDimension: parseInt(e.target.value) } })}
                className="w-full h-8"
              />
              <p className="text-xs text-[var(--text)]/70">
                Dimensionality of embedding vectors. Default: 1024
              </p>
            </div>

            {/* Embedding Model Selector - MOVED HERE */}
            <div className="space-y-3 pt-4 border-t border-[var(--text)]/20">
              <div className="flex justify-between items-center">
                <Label htmlFor="embedding-model-select-rag" className="text-base font-medium text-foreground">Embedding Model</Label>
                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="text-[var(--text)]/70 hover:text-[var(--text)]"><FiHelpCircle /></Button></TooltipTrigger><TooltipContent side="top" className="max-w-sm border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md"><p>For best results, choose a model designed for embeddings. If using a custom model not listed, consider renaming it to include 'embed' for model discovery here.</p></TooltipContent></Tooltip>
              </div>
              <div className="relative">
                <Input id="embedding-model-select-rag" ref={ragInputRef} type="text" value={inputFocused ? ragSearchQuery : selectedEmbeddingModelDisplay} placeholder={inputFocused ? "Search embedding models..." : (selectedEmbeddingModelDisplay || "Select embedding model...")} onFocus={() => setInputFocused(true)} onChange={(e) => setRagSearchQuery(e.target.value)} className={cn("w-full h-8 text-sm font-['Space_Mono',_monospace]", "text-[var(--text)] shadow-sm", "focus:border-[var(--active)] focus:ring-1 focus:ring-[var(--active)]", "hover:border-[var(--active)]/70", "bg-[var(--input-background)] border-[var(--text)]/20")} />
                {inputFocused && (
                  <div ref={ragDropdownRef} className={cn("absolute z-50 w-full mt-1", "bg-[var(--bg)] border border-[var(--text)]/20 shadow-lg", "max-h-60 overflow-y-auto no-scrollbar rounded-md py-1")}>
                    {filteredModels.length > 0 ? (
                      filteredModels.map((model) => (
                        <Button key={model.id + (model.host || '') + "-rag"} variant="ghost" className={cn("w-full justify-start text-left h-auto px-3 py-1.5 text-sm", "text-[var(--text)] hover:bg-[var(--active)]/20 focus:bg-[var(--active)]/30", "font-normal")} onClick={() => handleModelSelect(model)}>
                          {model.displayName} {model.id.toLowerCase().includes('embed') && (<span className="ml-2 px-1.5 py-0.5 text-xs rounded-sm bg-[var(--active)]/20 text-[var(--active)]">Embed</span>)}
                        </Button>
                      ))
                    ) : (<div className="px-3 py-2 text-sm text-[var(--text)]/70">No models found.</div>)}
                  </div>
                )}
              </div>
            </div>

            {/* Embedding Mode Selector */}
            <div className="space-y-3 pt-4 border-t border-[var(--text)]/20">
              <div className="flex justify-between items-center">
                <Label htmlFor="embedding-mode-select" className="text-base font-medium text-foreground">
                  Embedding Generation
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-[var(--text)]/70 hover:text-[var(--text)]">
                      <FiHelpCircle />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md rounded-md">
                    <p>
                      <strong>Automatic:</strong> Embeddings are generated when notes/chats are saved.
                    </p>
                    <p>
                      <strong>Manual:</strong> Embeddings are only generated when "Rebuild Embeddings" or "Update Embeddings" is clicked.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex space-x-6">
                {(['manual', 'automatic'] as const).map((mode) => (
                  <Button
                    key={mode}
                    variant={embeddingMode === mode ? "default" : "outline"}
                    onClick={() => updateConfig({ rag: { ...config.rag, embeddingMode: mode } })}
                    className={cn(
                      "flex-1 text-sm h-8",
                      embeddingMode === mode ? "bg-[var(--active)] text-[var(--active-foreground)] hover:bg-[var(--active)]/90" : "border-[var(--text)]/30 hover:bg-[var(--input-background)]"
                    )}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-[var(--text)]/70">
                Default: Manual. Automatic mode requires embedding service to be configured.
              </p>
            </div>
          </div>
        </TooltipProvider>
      </AccordionContent>
    </AccordionItem>
  );
};
