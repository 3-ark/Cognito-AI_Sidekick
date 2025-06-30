import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FiRefreshCw, FiZap } from "react-icons/fi"; // Using FiZap for "Update"
import { useConfig } from "./ConfigContext";
import { SettingTitle } from './SettingsTitle';
import { cn } from "@/src/background/util";

export const RagSettings = () => {
  const { config, updateConfig } = useConfig();

  // BM25 specific
  const bm25k1 = config.rag?.bm25?.k1 ?? 1.2;
  const bm25b = config.rag?.bm25?.b ?? 0.75;
  const bm25TopK = config.rag?.bm25?.topK ?? 50; // Default from table

  // Semantic search specific
  const semanticThreshold = config.rag?.semantic_threshold ?? 0.6;
  const semanticTopK = config.rag?.semantic_top_k ?? 50;

  // Hybrid search & general
  const bm25Weight = config.rag?.bm25_weight ?? 0.5;
  const chunkSize = config.rag?.chunkSize ?? 300; // Default from table
  const embeddingModel = config.rag?.embedding_model ?? 'text-embedding-3-small';

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
                  <TooltipContent>
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
                  <TooltipContent>
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
                  <TooltipContent>
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
                  <TooltipContent>
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
                  <TooltipContent>
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
                  <TooltipContent>
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
                  <TooltipContent>
                    <p>Maximum number of tokens in each text chunk. Affects context granularity. Default: 300 tokens.</p>
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
                Affects context granularity. Default: 300 tokens
              </p>
            </div>

            {/* Embedding Model */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label htmlFor="embedding-model" className="text-base font-medium text-foreground cursor-help">
                      Embedding Model
                    </Label>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Name of the embedding model to use (e.g., 'text-embedding-3-small'). For power users or local GPU setups. Default: 'text-embedding-3-small'.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="embedding-model"
                type="text"
                value={embeddingModel}
                onChange={(e) => updateConfig({ rag: { ...config.rag, embedding_model: e.target.value } })}
                className="w-full h-8"
              />
              <p className="text-xs text-[var(--text)]/70">
                Developer-only: For power users or local GPU. Default: 'text-embedding-3-small'
              </p>
            </div>

            {/* Index Management Buttons */}
            <div className="space-y-3 pt-4 border-t border-[var(--text)]/20">
              <Label className="text-base font-medium text-foreground">Index Management</Label>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={handleRebuildBm25}>
                    <FiRefreshCw className="h-4 w-4" /> Rebuild BM25 Index
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Reindex all notes/chats from scratch for BM25.</p>
                  <p className="text-xs opacity-80">Last rebuild: {bm25LastRebuild}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={handleRebuildEmbeddings}>
                    <FiRefreshCw className="h-4 w-4" /> Rebuild Embeddings
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Wipe all embeddings and re-embed every document.</p>
                  <p className="text-xs opacity-80">Last rebuild: {embeddingsLastRebuild}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={handleUpdateEmbeddings}>
                    <FiZap className="h-4 w-4" /> Update Embeddings
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Incremental embedding for new/changed + prune deleted items.</p>
                  <p className="text-xs opacity-80">Last update: {embeddingsLastUpdate}</p>
                </TooltipContent>
              </Tooltip>
            </div>

          </div>
        </TooltipProvider>
      </AccordionContent>
    </AccordionItem>
  );
};
