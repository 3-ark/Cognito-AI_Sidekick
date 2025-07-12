import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button"; // Still used for Embedding Mode toggle
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FiHelpCircle } from "react-icons/fi"; // FiRefreshCw, FiZap removed
import { useConfig } from "./ConfigContext";
import { SettingTitle } from './SettingsTitle';
import { cn } from "@/src/background/util";
// Config as AppConfig, Model related types, URL constants, normalizeApiEndpoint removed


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
  const finalTopK = config.rag?.final_top_k ?? semanticTopK; // Fallback to semanticTopK then to a default in retrieverUtils
  const bm25Weight = config.rag?.bm25_weight ?? 0.5;
  const vectorDimension = config.rag?.vectorDimension ?? 1024;
  const embeddingMode = config.rag?.embeddingMode ?? 'manual';

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

            {/* Embedding Mode Selector */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label htmlFor="embedding-mode-select" className="text-base font-medium text-foreground">
                  Embedding Generation
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-[var(--text)]/70 hover:text-[var(--text)]">
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
              <div className="flex space-x-2">
                {(['manual', 'automatic'] as const).map((mode) => (
                  <Button
                    key={mode}
                    variant={embeddingMode === mode ? "default" : "outline"}
                    onClick={() => updateConfig({ rag: { ...config.rag, embeddingMode: mode } })}
                    className={cn(
                      "flex-1 text-sm h-9",
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
