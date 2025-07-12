import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { FiX, FiBookOpen, FiSearch, FiHelpCircle, FiRefreshCw, FiZap } from 'react-icons/fi';
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetOverlay } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; 
import { type EmbeddingModelConfig, type Model, type Config as AppConfig } from "@/src/types/config";
import { GEMINI_URL, GROQ_URL, OPENAI_URL, OPENROUTER_URL } from './constants';
import { normalizeApiEndpoint } from "@/src/background/util";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { HybridRankedChunk } from '@/src/background/retrieverUtils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { type Config } from "@/src/types/config";
import { themes as appThemes, type Theme as AppTheme } from './Themes';
import { cn } from "@/src/background/util";
import { DEFAULT_PERSONA_IMAGES } from './constants';
import AnimatedBackground from './AnimatedBackground';

const SheetThemeButton = ({ theme, updateConfig, size = "h-6 w-6" }: { theme: AppTheme; updateConfig: (newConfig: Partial<Config>) => void; size?: string }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant="ghost"
        className={cn(
          size,
          "rounded-full p-0",
          "focus-visible:ring-1 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg)]",
          "hover:opacity-80 transition-opacity"
        )}
        style={{
          backgroundColor: theme.bg,
          borderColor: theme.text,
          borderWidth: '2px',
          boxShadow: `0 0 0 1px ${theme.active}`
        }}
        onClick={() => {
          updateConfig({ theme: theme.name });
        }}
        aria-label={`Set ${theme.name} theme`}
      />
    </TooltipTrigger>
    <TooltipContent side="top" className="bg-[var(--active)]/50 text-[var(--text)] border-[var(--text)]">
      <p className="capitalize">{theme.name}</p>
    </TooltipContent>
  </Tooltip>
);

export interface SettingsSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  config: Config;
  updateConfig: (newConfig: Partial<Config>) => void;
  setSettingsMode: (mode: boolean) => void;
  setHistoryMode: (mode: boolean) => void;
  setNoteSystemMode: (mode: boolean) => void;
}

export const SettingsSheet: React.FC<SettingsSheetProps> = ({
  isOpen,
  onOpenChange,
  config,
  updateConfig,
  setSettingsMode,
  setHistoryMode,
  setNoteSystemMode,
}) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<HybridRankedChunk[]>([]);
  const [isLoadingSearch, setIsLoadingSearch] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const sheetContentRef = React.useRef<HTMLDivElement>(null);


  const currentPersona = config?.persona || 'default';
  const sharedTooltipContentStyle = "bg-[var(--active)]/50 text-[var(--text)] border-[var(--text)]";

  // --- RAG Controls Logic (Moved and Adapted) ---
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

  const bm25LastRebuild = config.rag?.bm25LastRebuild ?? "Never";
  const embeddingsLastRebuild = config.rag?.embeddingsLastRebuild ?? "Never";
  const embeddingsLastUpdate = config.rag?.embeddingsLastUpdate ?? "Never";

  const handleRebuildBm25 = () => {
    chrome.runtime.sendMessage({ type: "REBUILD_BM25_INDEX_REQUEST" }, (response) => {
      if (chrome.runtime.lastError) console.error("Error REBUILD_BM25_INDEX_REQUEST:", chrome.runtime.lastError.message);
      else if (response?.success) console.log("BM25 Index rebuild initiated.");
      else console.error("Failed BM25 Index rebuild:", response?.error);
    });
  };
  const handleRebuildEmbeddings = () => {
    chrome.runtime.sendMessage({ type: "REBUILD_ALL_EMBEDDINGS_REQUEST" }, (response) => {
      if (chrome.runtime.lastError) { updateConfig({ rag: { ...config.rag, embeddingsLastRebuild: "Error!" } }); console.error("Error REBUILD_ALL_EMBEDDINGS_REQUEST:", chrome.runtime.lastError.message); }
      else if (response?.success) console.log("Full embeddings rebuild initiated.");
      else { updateConfig({ rag: { ...config.rag, embeddingsLastRebuild: `Failed: ${response?.error}` } }); console.error("Failed full embeddings rebuild:", response?.error); }
    });
  };
  const handleUpdateEmbeddings = () => {
    chrome.runtime.sendMessage({ type: "UPDATE_MISSING_EMBEDDINGS_REQUEST" }, (response) => {
      if (chrome.runtime.lastError) { updateConfig({ rag: { ...config.rag, embeddingsLastUpdate: "Error!" } }); console.error("Error UPDATE_MISSING_EMBEDDINGS_REQUEST:", chrome.runtime.lastError.message); }
      else if (response?.success) console.log("Update missing embeddings initiated.");
      else { updateConfig({ rag: { ...config.rag, embeddingsLastUpdate: `Failed: ${response?.error}` } }); console.error("Failed update missing embeddings:", response?.error); }
    });
  };
  // --- End RAG Controls Logic ---

  useEffect(() => {
    const performSearch = async () => {
      if (searchQuery.trim().length < 3) { setSearchResults([]); setSearchError(null); return; }
      setIsLoadingSearch(true); setSearchError(null);
      chrome.runtime.sendMessage({ type: 'PERFORM_SETTINGS_SEARCH', payload: { query: searchQuery } }, (response) => {
        if (chrome.runtime.lastError) { console.error("Error PERFORM_SETTINGS_SEARCH:", chrome.runtime.lastError.message); setSearchError("Error with background script."); setSearchResults([]); }
        else if (response.success) setSearchResults(response.results);
        else { console.error("Search failed:", response.error); setSearchError(response.error || "Failed to fetch results."); setSearchResults([]); }
        setIsLoadingSearch(false);
      });
    };
    const debounceTimeout = setTimeout(performSearch, 500);
    return () => clearTimeout(debounceTimeout);
  }, [searchQuery]);

  const sectionPaddingX = 'px-6';
  const handleConfigClick = () => { setSettingsMode(true); onOpenChange(false); };
  const handleHistoryClick = () => { setHistoryMode(true); onOpenChange(false); };
  const handleNoteSystemClick = () => { setNoteSystemMode(true); onOpenChange(false); };
  const presetThemesForSheet = appThemes.filter(t => t.name !== 'custom' && t.name !== config?.customTheme?.name);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetOverlay />
      <SheetContent variant="themedPanel" side="left" className={cn("p-0 border-r-0", "w-[22.857rem] sm:w-[27.143rem]", "flex flex-col h-full max-h-screen", "[&>button]:hidden", "settings-drawer-content", "overflow-y-auto")} style={{ height: '100dvh' }} ref={sheetContentRef} onOpenAutoFocus={(e) => { e.preventDefault(); sheetContentRef.current?.focus({ preventScroll: true }); }}>
        <AnimatedBackground />
        <div className={cn("flex flex-col flex-1 overflow-y-auto settings-drawer-body", "no-scrollbar")}>
          <div className={cn("flex flex-col space-y-5 flex-1", sectionPaddingX, "py-4")}>
            <div className="relative mt-5">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text)] opacity-50" />
              <Input type="text" placeholder="Search your notes and chat history..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className={cn("pl-10 pr-4 py-2 w-full rounded-xl border border-[var(--text)]/20 bg-[var(--input-background)] text-[var(--text)] placeholder:text-[var(--text)]/50", "focus:ring-1 focus:ring-[var(--active)] focus:border-[var(--active)]")} />
            </div>
            {isLoadingSearch && <div className="text-center text-[var(--text)] opacity-70">Searching...</div>}
            {searchError && <div className="text-center text-red-500">{searchError}</div>}
            {searchResults.length > 0 && (
              <ScrollArea className="h-[200px] rounded-md border border-[var(--text)]/20 p-2 bg-[var(--bg)]/30">
                <div className="space-y-2">
                  {searchResults.map((result) => (
                    <div key={result.chunkId} className="p-2 rounded-md bg-[var(--bg)]/50 border border-[var(--text)]/10">
                      <div className="text-xs text-[var(--text)] opacity-70">{result.parentType === 'note' ? 'Note' : 'Chat'} - Score: {result.hybridScore.toFixed(2)}</div>
                      <div className="font-medium text-sm text-[var(--text)] truncate" title={result.parentTitle}>{result.parentTitle}</div>
                      <p className="text-xs text-[var(--text)] opacity-80 line-clamp-2" title={result.chunkText}>{result.chunkText}</p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
            <div>
              <div className="flex items-center justify-between mt-5 mb-3">
                <div className="flex items-center space-x-1.5">
                  {presetThemesForSheet.map(theme => (<SheetThemeButton key={theme.name} theme={theme} updateConfig={updateConfig} />))}
                </div>
              </div>
              <div className="w-full">
                <Select value={currentPersona} onValueChange={(value) => updateConfig({ persona: value })}>
                  <SelectTrigger id="persona-select" variant="settingsPanel" className="w-full font-['Space_Mono',_monospace] data-[placeholder]:text-muted-foreground"><SelectValue placeholder="Select Persona..." /></SelectTrigger>
                  <SelectContent variant="settingsPanel">
                    {Object.keys(config?.personas || {}).map((p) => {
                      const personaAvatar = config?.personaAvatars?.[p] || DEFAULT_PERSONA_IMAGES[p] || DEFAULT_PERSONA_IMAGES.default;
                      return (<SelectItem key={p} value={p} className={cn("hover:brightness-95 focus:bg-[var(--active)]", "font-['Space_Mono',_monospace]", "flex items-center gap-2")}>
                        <Avatar className="h-5 w-5"><AvatarImage src={personaAvatar} alt={p} /><AvatarFallback>{p.substring(0, 1).toUpperCase()}</AvatarFallback></Avatar>{p}
                      </SelectItem>);
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Configuration Button - direct child of space-y-5 container */}
            <Button size="default" onClick={handleConfigClick} variant="outline" className={cn("text-[var(--text)] rounded-xl shadow-md w-full justify-start font-medium h-8", "bg-[rgba(255,250,240,0.4)] dark:bg-[rgba(255,255,255,0.1)]", "border-[var(--text)]/10", "font-['Space_Mono',_monospace]", "hover:border-[var(--active)] hover:brightness-98 active:bg-[var(--active)] active:brightness-95", "focus:ring-1 focus:ring-[var(--active)]")}>
              Configuration
            </Button>

            {/* Memory Section - direct child of space-y-5 container */}
            <div>
              <label className="text-[var(--text)] opacity-80 font-['Bruno_Ace_SC'] text-lg">Memory</label>
              <TooltipProvider>
                <div className="space-y-3 mt-3">
                  <div className="flex space-x-2"> {/* Flex container for horizontal layout */}
                    <Button variant="outline" size="default" onClick={handleHistoryClick} className={cn("flex-1 text-[var(--text)] rounded-xl shadow-md justify-center font-medium h-8 text-sm px-2 py-1", "bg-[rgba(255,250,240,0.4)] dark:bg-[rgba(255,255,255,0.1)]", "border-[var(--text)]/10", "font-['Space_Mono',_monospace]", "hover:border-[var(--active)] hover:brightness-98 active:bg-[var(--active)] active:brightness-95", "focus:ring-1 focus:ring-[var(--active)]")}>
                      Chat History
                    </Button>
                    <Button variant="outline" size="default" onClick={handleNoteSystemClick} className={cn("flex-1 text-[var(--text)] rounded-xl shadow-md justify-center font-medium h-8 text-sm px-2 py-1", "bg-[rgba(255,250,240,0.4)] dark:bg-[rgba(255,255,255,0.1)]", "border-[var(--text)]/10", "font-['Space_Mono',_monospace]", "hover:border-[var(--active)] hover:brightness-98 active:bg-[var(--active)] active:brightness-95", "focus:ring-1 focus:ring-[var(--active)]")}>
                      Note System
                    </Button>
                  </div>
                  {/* Index Management Buttons - Refactored for compactness - MOVED UP */}
                  <div className="pt-4 border-t border-[var(--text)]/10">
                    <Label className="text-base font-medium text-foreground opacity-80 mb-2 block">Embedding Management</Label>
                    <div className="flex space-x-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="sm" onClick={handleRebuildEmbeddings} className={cn("flex-1 text-[var(--text)] rounded-xl shadow-md justify-center font-medium h-8 text-xs px-2 py-1", "bg-[rgba(255,250,240,0.4)] dark:bg-[rgba(255,255,255,0.1)]", "border-[var(--text)]/10", "font-['Space_Mono',_monospace]", "hover:border-[var(--active)] hover:brightness-98 active:bg-[var(--active)] active:brightness-95", "focus:ring-1 focus:ring-[var(--active)]")}>
                            <FiRefreshCw className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate">Rebuild</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className={sharedTooltipContentStyle}>
                          <p>Rebuild Embeddings</p>
                          <p className="text-xs opacity-80">Last: {embeddingsLastRebuild}</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="sm" onClick={handleUpdateEmbeddings} className={cn("flex-1 text-[var(--text)] rounded-xl shadow-md justify-center font-medium h-8 text-xs px-2 py-1", "bg-[rgba(255,250,240,0.4)] dark:bg-[rgba(255,255,255,0.1)]", "border-[var(--text)]/10", "font-['Space_Mono',_monospace]", "hover:border-[var(--active)] hover:brightness-98 active:bg-[var(--active)] active:brightness-95", "focus:ring-1 focus:ring-[var(--active)]")}>
                            <FiZap className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate">Update</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className={sharedTooltipContentStyle}>
                          <p>Update Embeddings</p>
                          <p className="text-xs opacity-80">Last: {embeddingsLastUpdate}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  {/* Embedding Model Selector - MOVED DOWN */}
                  <div className="space-y-3 pt-4 border-t border-[var(--text)]/10">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="embedding-model-select-sheet" className="text-base font-medium text-foreground opacity-80">Embedding Model</Label>
                      <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="xs" className="text-[var(--text)]/70 hover:text-[var(--text)]"><FiHelpCircle /></Button></TooltipTrigger><TooltipContent side="top" className="max-w-sm border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md rounded-xl"><p>For best results, choose a model designed for embeddings. If using a custom model not listed, consider renaming it to include 'embed' for model discovery here.</p></TooltipContent></Tooltip>
                    </div>
                    <div className="relative">
                      <Input id="embedding-model-select-sheet" ref={ragInputRef} type="text" value={inputFocused ? ragSearchQuery : selectedEmbeddingModelDisplay} placeholder={inputFocused ? "Search embedding models..." : (selectedEmbeddingModelDisplay || "Select embedding model...")} onFocus={() => setInputFocused(true)} onChange={(e) => setRagSearchQuery(e.target.value)} className={cn("w-full h-8 text-sm font-['Space_Mono',_monospace]", "text-[var(--text)] rounded-xl shadow-sm", "focus:border-[var(--active)] focus:ring-1 focus:ring-[var(--active)]", "hover:border-[var(--active)]/70", "bg-[var(--input-background)] border-[var(--text)]/20")} /> {/* Added font */}
                      {inputFocused && (
                        <div ref={ragDropdownRef} className={cn("absolute z-50 w-full mt-1", "bg-[var(--bg)] border border-[var(--text)]/20 rounded-xl shadow-lg", "max-h-60 overflow-y-auto no-scrollbar py-1")}>
                          {filteredModels.length > 0 ? (
                            filteredModels.map((model) => (
                              <Button key={model.id + (model.host || '') + "-sheet"} variant="ghost" className={cn("w-full justify-start text-left h-auto px-3 py-1.5 text-sm", "text-[var(--text)] hover:bg-[var(--active)]/20 focus:bg-[var(--active)]/30", "font-normal")} onClick={() => handleModelSelect(model)}>
                                {model.displayName} {model.id.toLowerCase().includes('embed') && (<span className="ml-2 px-1.5 py-0.5 text-xs rounded-sm bg-[var(--active)]/20 text-[var(--active)]">Embed</span>)}
                              </Button>
                            ))
                          ) : (<div className="px-3 py-2 text-sm text-[var(--text)]/70">No models found.</div>)}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text)]/70">Selected: {selectedEmbeddingModelDisplay || 'None'}</p>
                  </div>
                </div>
              </TooltipProvider>
            </div>
          </div>
            {/* New Footer Section */}
            <div className={cn(
                "sticky bottom-0 z-10 p-3", // p-3 provides padding around the footer content
                "flex items-center justify-between"
            )}>
                {/* Pill Tag */}
                <div className="flex rounded-xl overflow-hidden shadow-md">
                    <SheetTitle asChild>
                        <span
                            className="px-2 py-0 text-xs flex items-center justify-center"
                            style={{ backgroundColor: 'var(--active)', color: 'var(--text)' }}
                        >
                            COGNITO
                        </span>
                    </SheetTitle>
                    <SheetDescription asChild>
                        <span
                            className="px-2 py-0 text-xs text-white flex items-center justify-center"
                            style={{ backgroundColor: 'var(--link)', color: 'white' }}
                        >
                            v{APP_VERSION}
                        </span>
                    </SheetDescription>
                </div>

                {/* Icons */}
                <div className="flex items-center space-x-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <a
                                href="https://github.com/3-ark/Cognito-AI_Sidekick/blob/main/docs/USER_GUIDE.md"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[var(--text)] p-1.5 hover:bg-[var(--active)]/20 focus-visible:ring-1 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg)]"
                                aria-label="User Guide"
                            >
                                <FiBookOpen />
                            </a>
                        </TooltipTrigger>
                        <TooltipContent side="top" className={sharedTooltipContentStyle}>User Guide</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button 
                                variant={'link'}
                                aria-label="Close Settings" 
                                className="text-[var(--text)] p-1.5 hover:bg-[var(--active)]/20 h-6 w-6 hover:px-0 focus-visible:ring-1 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg)]" 
                                onClick={() => onOpenChange(false)}
                            >
                                <FiX />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className={sharedTooltipContentStyle}> Close Settings </TooltipContent>
                    </Tooltip>
                </div>
                </div>
            </div>
         </SheetContent>
     </Sheet>
  );
};