import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useConfig } from "./ConfigContext";
import { SettingTitle } from './SettingsTitle';
import { cn } from "@/src/background/util";

export const RagSettings = () => {
  const { config, updateConfig } = useConfig();

  const bm25k1 = config.rag?.bm25?.k1 ?? 1.2;
  const bm25b = config.rag?.bm25?.b ?? 0.75;
  const topK = config.rag?.topK ?? 3;
  const chunkSize = config.rag?.chunkSize ?? 512;

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
                    <p>Controls how much term frequency affects term weight. Higher values increase sensitivity to term frequency.</p>
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
                Controls term frequency scaling. Default: 1.2
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
                    <p>Controls how much document length normalizes term weight. Value between 0 and 1. Higher values increase normalization.</p>
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
                Controls document length normalization. Default: 0.75
              </p>
            </div>

            {/* Top K Results */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label htmlFor="top-k" className="text-base font-medium text-foreground cursor-help">
                      Top K Results ({topK})
                    </Label>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>The number of most relevant text chunks to retrieve from the knowledge base for context.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Slider
                id="top-k"
                min={1}
                max={10}
                step={1}
                value={[topK]}
                onValueChange={(value) => updateConfig({ rag: { ...config.rag, topK: value[0] } })}
                variant="themed"
              />
              <p className="text-xs text-[var(--text)]/70">
                Number of results to retrieve. Default: 3
              </p>
            </div>

            {/* Chunk Size */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Label htmlFor="chunk-size" className="text-base font-medium text-foreground cursor-help">
                      Chunk Size ({chunkSize})
                    </Label>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>The maximum number of characters or tokens in each text chunk when processing documents for the knowledge base.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="chunk-size"
                type="number"
                step="1"
                min="128" // Assuming a reasonable minimum
                max="4096" // Assuming a reasonable maximum
                value={chunkSize}
                onChange={(e) => updateConfig({ rag: { ...config.rag, chunkSize: parseInt(e.target.value) } })}
                className="w-full h-8"
              />
              <p className="text-xs text-[var(--text)]/70">
                Size of text chunks for processing. Default: 512
              </p>
            </div>
          </div>
        </TooltipProvider>
      </AccordionContent>
    </AccordionItem>
  );
};
