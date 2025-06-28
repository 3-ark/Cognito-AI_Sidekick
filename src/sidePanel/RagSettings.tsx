import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useConfig } from "./ConfigContext";

export const RagSettings = () => {
  const { config, updateConfig } = useConfig();

  return (
    <AccordionItem value="rag-settings">
      <AccordionTrigger>
        <div className='flex flex-col gap-1 items-start'>
          <h3 className='text-base font-medium'>RAG Settings</h3>
          <p className='text-xs text-muted-foreground'>Configure Retrieval Augmented Generation parameters.</p>
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-4">
        <TooltipProvider>
          <div className="space-y-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Label htmlFor="bm25-k1">BM25 k1</Label>
              </TooltipTrigger>
              <TooltipContent>
                <p>BM25 k1 parameter. Controls how much term frequency affects term weight. Higher values increase sensitivity to term frequency.</p>
              </TooltipContent>
            </Tooltip>
            <Input
              id="bm25-k1"
              type="number"
              step="0.1"
              value={config.rag?.bm25?.k1 ?? 1.2}
              onChange={(e) => updateConfig({ rag: { ...config.rag, bm25: { ...config.rag?.bm25, k1: parseFloat(e.target.value) } } })}
            />
            <p className="text-xs text-muted-foreground">Controls term frequency scaling. Default: 1.2</p>
          </div>
          <div className="space-y-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Label htmlFor="bm25-b">BM25 b</Label>
              </TooltipTrigger>
              <TooltipContent>
                <p>BM25 b parameter. Controls how much document length normalizes term weight. Value between 0 and 1. Higher values increase normalization.</p>
              </TooltipContent>
            </Tooltip>
            <Input
              id="bm25-b"
              type="number"
              step="0.01"
              value={config.rag?.bm25?.b ?? 0.75}
              onChange={(e) => updateConfig({ rag: { ...config.rag, bm25: { ...config.rag?.bm25, b: parseFloat(e.target.value) } } })}
            />
            <p className="text-xs text-muted-foreground">Controls document length normalization. Default: 0.75</p>
          </div>
          <div className="space-y-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Label htmlFor="top-k">Top K Results</Label>
              </TooltipTrigger>
              <TooltipContent>
                <p>The number of most relevant text chunks to retrieve from the knowledge base for context.</p>
              </TooltipContent>
            </Tooltip>
            <Slider
              id="top-k"
              min={1}
              max={10}
              step={1}
              value={[config.rag?.topK ?? 3]}
              onValueChange={(value) => updateConfig({ rag: { ...config.rag, topK: value[0] } })}
            />
            <p className="text-xs text-muted-foreground">Number of results to retrieve. Default: 3</p>
          </div>
          <div className="space-y-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Label htmlFor="chunk-size">Chunk Size</Label>
              </TooltipTrigger>
              <TooltipContent>
                <p>The maximum number of characters or tokens in each text chunk when processing documents for the knowledge base.</p>
              </TooltipContent>
            </Tooltip>
            <Input
              id="chunk-size"
              type="number"
              step="1"
              value={config.rag?.chunkSize ?? 512}
              onChange={(e) => updateConfig({ rag: { ...config.rag, chunkSize: parseInt(e.target.value) } })}
            />
            <p className="text-xs text-muted-foreground">Size of text chunks for processing. Default: 512</p>
          </div>
        </TooltipProvider>
      </AccordionContent>
    </AccordionItem>
  );
};
