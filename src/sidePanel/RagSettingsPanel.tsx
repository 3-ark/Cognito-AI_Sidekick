import React, {
 useCallback,useEffect, useState, 
} from 'react';
import localforage from 'localforage';

import AnimatedBackground from './AnimatedBackground';
import { useConfig } from './ConfigContext';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from "@/components/ui/progress";
import {
 Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, 
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { type RagConfig } from '@/src/types/config';
import ChannelNames from '@/src/types/ChannelNames';

type RagParamKey = keyof RagConfig;

export const RagSettingsPanel: React.FC = () => {
  const { config, updateConfig } = useConfig();
  const [embeddingProgress, setEmbeddingProgress] = useState({ processed: 0, total: 0 });
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [stats, setStats] = useState({
 noteCount: 0, convoCount: 0, lastUpdated: 0, 
});

  const fetchStats = useCallback(async () => {
    const keys = await localforage.keys();
    const noteCount = keys.filter(k => k.startsWith('note_')).length;
    const convoCount = keys.filter(k => k.startsWith('conv_')).length;
    const lastUpdated = await localforage.getItem('embedding_stats_last_updated') as number || 0;

    setStats({
 noteCount, convoCount, lastUpdated, 
});
  }, []);

  useEffect(() => {
    fetchStats();
    const handleMessage = (message: any) => {
      if (message.type === 'EMBEDDING_START') {
        setIsEmbedding(true);
        setEmbeddingProgress({ processed: 0, total: message.data.total });
      } else if (message.type === 'EMBEDDING_PROGRESS') {
        setEmbeddingProgress(message.data);
      } else if (message.type === 'EMBEDDING_END' || message.type === 'EMBEDDING_ERROR') {
        setIsEmbedding(false);
        setEmbeddingProgress({ processed: 0, total: 0 });
        fetchStats(); // Re-fetch stats after process completes
      } else if (message.type === ChannelNames.BM25_REBUILD_START) {
        setIsRebuilding(true);
      } else if (message.type === ChannelNames.BM25_REBUILD_END) {
        setIsRebuilding(false);
        fetchStats();
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [fetchStats]);

  const defaultRagConfig: RagConfig = {
    model: "",
    use_gpu: true,
    semantic_top_k: 20,
    similarity_threshold: 0.3,
    BM25_top_k: 50,
    k: 1.2,
    b: 0.75,
    d: 0.5,
    bm25_weight: 0.5,
    autoEmbedOnSave: false,
    maxChunkChars: 2000,
    minChunkChars: 150,
    overlapChars: 50,
    lambda: 0.5,
  };

  const currentRagConfig = { ...defaultRagConfig, ...(config.ragConfig || {}) };

  const handleChange = (key: RagParamKey) => (val: string | number | boolean | number[]) => {
    let valueToSet = val;

    if (Array.isArray(val)) {
      valueToSet = val[0];
    }

    updateConfig({ ragConfig: { ...currentRagConfig, [key]: valueToSet } });
  };
  
  const inputStyles = "bg-[var(--input-background)] rounded-xl border-(--text)/20 text-(--text) focus:border-(--active) hide-number-spinners";
  const labelStyles = "text-base font-medium text-(--text) opacity-90";
  const progressPercentage = embeddingProgress.total > 0 ? (embeddingProgress.processed / embeddingProgress.total) * 100 : 0;

  return (
    <div className="relative z-1 flex flex-col h-full flex-1 overflow-y-auto p-6 text-(--text) no-scrollbar">
      <AnimatedBackground />
      <div className="flex flex-col gap-6">
        {/* Data Management */}
        <div className="space-y-4 p-4 border rounded-lg border-(--text)/20">
          <h3 className="text-lg font-semibold text-(--text)">Data Management</h3>
          <div className="flex items-center justify-between">
            <Label className={labelStyles} htmlFor="auto-embed-on-save">
              Auto-generate embeddings on save
            </Label>
            <Switch
              checked={currentRagConfig.autoEmbedOnSave}
              className="[&>span]:bg-(--active)"
              disabled={isEmbedding || isRebuilding}
              id="auto-embed-on-save"
              onCheckedChange={checked => handleChange('autoEmbedOnSave')(checked)}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              className="px-3 py-1.5 rounded-md bg-(--active) text-white font-semibold hover:bg-opacity-80 transition-colors text-sm disabled:bg-opacity-50"
              disabled={isEmbedding || isRebuilding}
              onClick={() => chrome.runtime.sendMessage({ type: ChannelNames.BUILD_ALL_EMBEDDINGS_REQUEST })}
            >
              Rebuild
            </button>
            <button
              className="px-3 py-1.5 rounded-md bg-(--active) text-white font-semibold hover:bg-opacity-80 transition-colors text-sm disabled:bg-opacity-50"
              disabled={isEmbedding || isRebuilding}
              onClick={() => chrome.runtime.sendMessage({ type: 'UPDATE_EMBEDDINGS_REQUEST' })}
            >
              Update
            </button>
            <div className="flex flex-col items-start text-xs text-(--text)/60 flex-1">
              <div>
                <span className="mr-2">Notes: {stats.noteCount}</span>
                <span>Chats: {stats.convoCount}</span>
              </div>
              <span>Last Updated: {stats.lastUpdated ? new Date(stats.lastUpdated).toLocaleTimeString() : 'Never'}</span>
            </div>
          </div>
          {(isEmbedding || isRebuilding) && (
            <div className="space-y-1">
              {isEmbedding && <Progress value={progressPercentage} />}
              <p className="variant-themed text-xs text-center text-(--text)/70">
                {isEmbedding && `Processing Embeddings: ${embeddingProgress.processed} / ${embeddingProgress.total}`}
                {isRebuilding && 'Rebuilding search index...'}
              </p>
            </div>
          )}
        </div>

        {/* Model */}
        <div className="space-y-3">
          <Label className={labelStyles} htmlFor="rag-model">
            Embedding Model
          </Label>
          <Select
            value={currentRagConfig.model}
            onValueChange={handleChange('model')}
          >
            <SelectTrigger className="w-full" id="rag-model" variant="settingsPanel">
              <SelectValue placeholder="Select an embedding model" />
            </SelectTrigger>
            <SelectContent
              className="bg-[var(--background)] text-(--text) border-(--text)/20"
              variant="settingsPanel"
            >
              <SelectGroup>
                {config.models
                  ?.filter(m =>
                    m.id.toLowerCase().includes('embed') ||
                    m.name?.toLowerCase().includes('embed') ||
                    m.id.toLowerCase().includes('embedding') ||
                    m.name?.toLowerCase().includes('embedding'),
                  )
                  .map(model => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name || model.id}
                    </SelectItem>
                  ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

          {/* Use GPU */}
          <div className="flex items-center justify-between space-y-0">
            <Label className={labelStyles} htmlFor="rag-use_gpu">
              Use GPU (if available)
            </Label>
            <Switch
              checked={currentRagConfig.use_gpu}
              className="[&>span]:bg-(--active)" // Themed switch
              id="rag-use_gpu"
              onCheckedChange={checked => handleChange('use_gpu')(checked)}
            />
          </div>

          {/* Contextual Summaries */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className={labelStyles} htmlFor="rag-use-contextual-summaries">
                Use Contextual Summaries
              </Label>
              <Switch
                checked={currentRagConfig.useContextualSummaries}
                className="[&>span]:bg-(--active)"
                id="rag-use-contextual-summaries"
                onCheckedChange={checked => handleChange('useContextualSummaries')(checked)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Contextual Summaries generate a brief summary for each chunk of your notes using an LLM. This can improve retrieval accuracy by providing more context. <strong className="font-bold text-red-500">Warning:</strong> Enabling this feature will send the full content of every note and chat to your selected API provider during the embedding process, which can be very costly and slow and has privacy implications. <strong className="font-bold text-green-500">Adding description, tags</strong> manually inside note works in a similar way, simpler, acceptable, but not as accurate, however, it's much less costly.
            </p>
          </div>

          {/* Semantic Top K */}
          <div className="space-y-3">
            <Label className={labelStyles} htmlFor="rag-semantic_top_k">
              Semantic Top K ({currentRagConfig.semantic_top_k})
            </Label>
            <Input
              className={inputStyles}
              id="rag-semantic_top_k"
              min={1}
              type="number"
              value={currentRagConfig.semantic_top_k}
              onChange={e => handleChange('semantic_top_k')(parseInt(e.target.value, 10) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              The number of most similar chunks to retrieve based on semantic meaning.
            </p>
          </div>

          {/* Similarity Threshold */}
          <div className="space-y-3">
            <Label className={labelStyles} htmlFor="rag-similarity_threshold">
              Similarity Threshold ({currentRagConfig.similarity_threshold.toFixed(2)})
              <span className="ml-2 text-xs text-(--text)/60">Default: 0.3</span>
            </Label>
            <Slider
              id="rag-similarity_threshold"
              max={1}
              min={0}
              step={0.01}
              value={[currentRagConfig.similarity_threshold]}
              variant="themed"
              onValueChange={handleChange('similarity_threshold')}
            />
            <p className="text-xs text-muted-foreground">
              Chunks with similarity below this threshold will be filtered out.
            </p>
          </div>

          {/* BM25 Top K */}
          <div className="space-y-3">
            <Label className={labelStyles} htmlFor="rag-BM25_top_k">
              BM25 Top K ({currentRagConfig.BM25_top_k})
            </Label>
            <Input
              className={inputStyles}
              id="rag-BM25_top_k"
              min={1}
              type="number"
              value={currentRagConfig.BM25_top_k}
              onChange={e => handleChange('BM25_top_k')(parseInt(e.target.value, 10) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              The number of most relevant chunks to retrieve based on keyword matching.
            </p>
          </div>

          {/* Final Top K */}
          <div className="space-y-3">
            <Label className={labelStyles} htmlFor="rag-final_top_k">
              Final Top K ({currentRagConfig.final_top_k})
            </Label>
            <Input
              className={inputStyles}
              id="rag-final_top_k"
              min={1}
              type="number"
              value={currentRagConfig.final_top_k}
              onChange={e => handleChange('final_top_k')(parseInt(e.target.value, 10) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              The final number of chunks to use after re-ranking.
            </p>
          </div>

          {/* k */}
          <div className="space-y-3">
            <Label className={labelStyles} htmlFor="rag-k">
              K ({currentRagConfig.k?.toFixed(1) ?? '1.2'})
              <span className="ml-2 text-xs text-(--text)/60">Default: 1.2</span>
            </Label>
            <Slider
              id="rag-k"
              max={3}
              min={0}
              step={0.1}
              value={[currentRagConfig.k ?? 1.2]}
              variant="themed"
              onValueChange={handleChange('k')}
            />
            <p className="text-xs text-muted-foreground">
              Controls the term frequency saturation. Higher values mean weaker saturation.
            </p>
          </div>

          {/* b */}
          <div className="space-y-3">
            <Label className={labelStyles} htmlFor="rag-b">
              b ({currentRagConfig.b.toFixed(2)})
              <span className="ml-2 text-xs text-(--text)/60">Default: 0.75</span>
            </Label>
            <Slider
              id="rag-b"
              max={1}
              min={0}
              step={0.01}
              value={[currentRagConfig.b]}
              variant="themed"
              onValueChange={(value) => handleChange('b')(value)}
            />
            <p className="text-xs text-muted-foreground">
              Controls the document length normalization. 0 means no normalization.
            </p>
          </div>
          
          {/* d */}
          <div className="space-y-3">
            <Label className={labelStyles} htmlFor="rag-d">
              D ({currentRagConfig.d?.toFixed(2) ?? '0.50'})
              <span className="ml-2 text-xs text-(--text)/60">Default: 0.5</span>
            </Label>
            <Slider
              id="rag-d"
              max={1}
              min={0}
              step={0.01} // Consistent with 'b' and typical range for 'd'
              value={[currentRagConfig.d ?? 0.50]}
              variant="themed"
              onValueChange={handleChange('d')}
            />
            <p className="text-xs text-muted-foreground">
              Delta decay, penalizes term frequency in long documents.
            </p>
          </div>

          {/* BM25 Weight */}
          <div className="space-y-3">
            <Label className={labelStyles} htmlFor="rag-bm25_weight">
              BM25 Weight ({currentRagConfig.bm25_weight.toFixed(2)})
              <span className="ml-2 text-xs text-(--text)/60">Default: 0.5</span>
            </Label>
            <Slider
              id="rag-bm25_weight"
              max={1}
              min={0}
              step={0.01}
              value={[currentRagConfig.bm25_weight]}
              variant="themed"
              onValueChange={handleChange('bm25_weight')}
            />
            <p className="text-xs text-muted-foreground">
              The weight given to the BM25 score in the final ranking.
            </p>
          </div>

          {/* Lambda for MMR */}
          <div className="space-y-3">
            <Label className={labelStyles} htmlFor="rag-lambda">
              Diversity (Lambda) ({currentRagConfig.lambda.toFixed(2)})
              <span className="ml-2 text-xs text-(--text)/60">Default: 0.5</span>
            </Label>
            <Slider
              id="rag-lambda"
              max={1}
              min={0}
              step={0.05}
              value={[currentRagConfig.lambda]}
              variant="themed"
              onValueChange={handleChange('lambda')}
            />
            <p className="text-xs text-muted-foreground">
              Balances relevance and diversity. Lower value for more diversity.
            </p>
          </div>

          {/* Max Chunk Chars */}
          <div className="space-y-3">
            <Label className={labelStyles} htmlFor="rag-max-chunk-chars">
              Max Chunk Chars ({currentRagConfig.maxChunkChars})
              <span className="ml-2 text-xs text-(--text)/60">Default: 2000</span>
            </Label>
            <Slider
              id="rag-max-chunk-chars"
              max={8000}
              min={500}
              step={100}
              value={[currentRagConfig.maxChunkChars]}
              variant="themed"
              onValueChange={handleChange('maxChunkChars')}
            />
            <p className="text-xs text-muted-foreground">
              The maximum number of characters in a single chunk.
            </p>
          </div>

          {/* Min Chunk Chars */}
          <div className="space-y-3">
            <Label className={labelStyles} htmlFor="rag-min-chunk-chars">
              Min Chunk Chars ({currentRagConfig.minChunkChars})
              <span className="ml-2 text-xs text-(--text)/60">Default: 150</span>
            </Label>
            <Slider
              id="rag-min-chunk-chars"
              max={500}
              min={50}
              step={10}
              value={[currentRagConfig.minChunkChars]}
              variant="themed"
              onValueChange={handleChange('minChunkChars')}
            />
            <p className="text-xs text-muted-foreground">
              The minimum number of characters in a single chunk.
            </p>
          </div>

          {/* Overlap Chars */}
          <div className="space-y-3">
            <Label className={labelStyles} htmlFor="rag-overlap-chars">
              Overlap Chars ({currentRagConfig.overlapChars})
              <span className="ml-2 text-xs text-(--text)/60">Default: 50</span>
            </Label>
            <Slider
              id="rag-overlap-chars"
              max={250}
              min={0}
              step={10}
              value={[currentRagConfig.overlapChars]}
              variant="themed"
              onValueChange={handleChange('overlapChars')}
            />
            <p className="text-xs text-muted-foreground">
              The number of characters to overlap between adjacent chunks.
            </p>
          </div>
        </div>
      </div>
  );
};
