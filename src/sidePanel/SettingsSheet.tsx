import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { FiX, FiBookOpen, FiSearch, FiRefreshCw, FiZap, FiEdit2, FiPlus, FiTrash2, FiSliders, FiFileText } from 'react-icons/fi';
import { PersonaEditPopover, DeletePersonaDialog } from './Persona'; // Import new persona components
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetOverlay } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { RiChatHistoryLine } from "react-icons/ri";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"; 
import { type EmbeddingModelConfig, type Model, type Config as AppConfig } from "@/src/types/config";
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

  const parseModelNameForDisplay = (modelString: string): string => {
    if (!modelString || modelString === 'Not Set') {
      return modelString;
    }
    // Remove provider part like `[lmStudio] `
    let name = modelString.replace(/\[.*?\]\s*/, '');
    // Remove path-like prefixes
    const parts = name.split('/');
    name = parts[parts.length - 1];
    // Remove common model file extensions
    const extensions = ['.gguf', '.bin', '.safetensors'];
    for (const ext of extensions) {
      if (name.endsWith(ext)) {
        name = name.slice(0, -ext.length);
        break;
      }
    }
    return name;
  };

  const currentPersona = config?.persona || 'Ein'; // Default to 'Ein' if not set
  const sharedTooltipContentStyle = "bg-[var(--active)]/50 text-[var(--text)] border-[var(--text)]";

  // --- Persona Management State & Handlers ---
  const personas = config?.personas || { Ein: "You are Ein, a helpful AI assistant." };
  const currentPersonaPrompt = personas[currentPersona] || "";
  // Ensure currentPersonaAvatar has a fallback if the persona or its avatar isn't in defaults
  const defaultAvatarForCurrent = DEFAULT_PERSONA_IMAGES[currentPersona] || DEFAULT_PERSONA_IMAGES.default;
  const currentPersonaAvatar = config?.personaAvatars?.[currentPersona] || defaultAvatarForCurrent;


  const handleSavePersona = (name: string, prompt: string, avatar?: string) => {
    const newPersonas = { ...config.personas, [name]: prompt };
    const newAvatars = { ...config.personaAvatars };
    if (avatar) {
      newAvatars[name] = avatar;
    } else if (name !== currentPersona && !newAvatars[name]) { 
      // If it's a new persona or an existing one without a specific avatar being set now,
      // and no new avatar is provided, ensure no old avatar reference persists if it's not a default.
      // However, if it's an existing persona being edited and no new avatar is chosen, we keep the old one.
      // This logic might need refinement based on exact desired behavior for avatar reset/persistence.
      // For now, if no avatar is explicitly passed, we don't clear it unless it's a truly new persona.
      // If 'name' is a new persona, and no avatar is given, it won't have one in newAvatars.
    }


    updateConfig({ 
      personas: newPersonas, 
      personaAvatars: newAvatars,
      persona: name // Select the newly saved/created persona
    });
  };

  const handleDeletePersona = () => {
    if (currentPersona === 'Ein' || currentPersona === 'Default') return; // Cannot delete default

    const newPersonas = { ...config.personas };
    delete newPersonas[currentPersona];
    
    const newAvatars = { ...config.personaAvatars };
    delete newAvatars[currentPersona];

    updateConfig({
      personas: newPersonas,
      personaAvatars: newAvatars,
      persona: 'Ein' // Revert to default persona
    });
  };

  // --- RAG Controls Logic (Moved and Adapted) ---
  const [selectedEmbeddingModelDisplay, setSelectedEmbeddingModelDisplay] = useState<string>('');

  useEffect(() => {
    const updateDisplay = () => {
      chrome.storage.local.get('embeddingModelConfig', (result) => {
        if (result.embeddingModelConfig) {
          const storedConfig = result.embeddingModelConfig as EmbeddingModelConfig;
          setSelectedEmbeddingModelDisplay(`[${storedConfig.providerName}] ${storedConfig.modelId}`);
        } else if (config.rag?.embedding_model && config.models) {
          const currentModelId = config.rag.embedding_model;
          const modelDetail = config.models.find(m => m.id === currentModelId);
          if (modelDetail) {
            setSelectedEmbeddingModelDisplay(`[${modelDetail.host || 'Unknown'}] ${modelDetail.id}`);
          } else {
            setSelectedEmbeddingModelDisplay(currentModelId);
          }
        } else {
          setSelectedEmbeddingModelDisplay('Not Set');
        }
      });
    };

    updateDisplay();
    // Also listen for changes from other parts of the extension
    const messageListener = (message: any) => {
      if (message.type === 'CONFIG_UPDATED') {
        updateDisplay();
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [config.rag?.embedding_model, config.models]); // Keep dependencies to re-run if the direct config object changes

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

  const sectionPaddingX = 'px-8';
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
              <div className="flex items-center justify-between mt-10 mb-10">
                <div className="flex items-center space-x-1.5">
                  {presetThemesForSheet.map(theme => (<SheetThemeButton key={theme.name} theme={theme} updateConfig={updateConfig} size="h-5 w-5" />))}
                </div>
                <Button size="sm" onClick={handleConfigClick} variant="outline" 
                  className={cn(
                    "text-white rounded-sm shadow-md justify-start font-medium h-6 px-2 text-xs", 
                    "border-none",
                    "font-['Space_Mono',_monospace]", 
                    "hover:brightness-95 active:brightness-90", 
                    "focus:ring-1 focus:ring-white/50"
                  )}
                  style={{ backgroundColor: 'var(--link)' }}
                >
                  <FiSliders className="h-3 w-3 mr-1" />
                  Settings
                </Button>
              </div>
              <div className="w-full flex items-center space-x-2">
                <Select value={currentPersona} onValueChange={(value) => updateConfig({ persona: value })}>
                  <SelectTrigger id="persona-select" variant="settingsPanel" className="flex-1 font-['Space_Mono',_monospace] data-[placeholder]:text-muted-foreground w-auto">
                    <SelectValue placeholder="Select Persona..." />
                  </SelectTrigger>
                  <SelectContent variant="settingsPanel">
                    {Object.keys(config?.personas || {}).map((p) => {
                      const personaAvatar = config?.personaAvatars?.[p] || DEFAULT_PERSONA_IMAGES[p] || DEFAULT_PERSONA_IMAGES.default;
                      return (
                        <SelectItem key={p} value={p} className={cn("hover:brightness-95 focus:bg-[var(--active)]", "font-['Space_Mono',_monospace]", "flex items-center gap-2")}>
                          <Avatar className="h-5 w-5">
                            <AvatarImage src={personaAvatar} alt={p} />
                            <AvatarFallback>{p.substring(0, 1).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          {p}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>

                <PersonaEditPopover
                  isEditing
                  personaName={currentPersona}
                  initialPrompt={currentPersonaPrompt}
                  initialAvatar={currentPersonaAvatar}
                  onSave={handleSavePersona}
                  trigger={
                    <Button variant="ghost" size="sm" className="text-[var(--text)]/80 hover:text-[var(--text)] hover:bg-[var(--text)]/10 rounded-md" aria-label="Edit selected persona">
                      <FiEdit2 />
                    </Button>
                  }
                />
                <PersonaEditPopover
                  onSave={handleSavePersona}
                  trigger={
                    <Button variant="ghost" size="sm" className="text-[var(--text)]/80 hover:text-[var(--text)] hover:bg-[var(--text)]/10 rounded-md" aria-label="Add new persona">
                      <FiPlus />
                    </Button>
                  }
                />
                {currentPersona !== 'Ein' && currentPersona !== 'Default' && Object.keys(personas).length > 1 && (
                  <DeletePersonaDialog
                    personaName={currentPersona}
                    onConfirm={handleDeletePersona}
                    trigger={
                      <Button variant="ghost" size="sm" className="text-[var(--error)]/80 hover:text-[var(--error)] hover:bg-[var(--error)]/10 rounded-md" aria-label="Delete selected persona">
                        <FiTrash2 />
                      </Button>
                    }
                  />
                )}
              </div>
            </div>
            {/* Memory Section - direct child of space-y-5 container */}
            <div className="py-5 border-t border-[var(--text)]/10">
              <TooltipProvider>
                <div className="space-y-5">
                  <div className="flex space-x-4"> {/* Adjusted spacing */}
                    <Button variant="outline" onClick={handleHistoryClick} className={cn("flex-1 text-[var(--text)] rounded-xl shadow-md justify-start pl-4 font-medium h-8 text-xs px-3 py-1", "bg-[rgba(255,250,240,0.4)] dark:bg-[rgba(255,255,255,0.1)]", "border-[var(--text)]/10", "font-['Space_Mono',_monospace]", "hover:border-[var(--active)] hover:brightness-98 active:bg-[var(--active)] active:brightness-95", "focus:ring-1 focus:ring-[var(--active)]")}>
                      <RiChatHistoryLine className="h-3 w-3 mr-1.5" />
                      <span className="text-xs">History</span>
                    </Button>
                    <Button variant="outline" onClick={handleNoteSystemClick} className={cn("flex-1 text-[var(--text)] rounded-xl shadow-md justify-start pl-4 font-medium h-8 text-xs px-3 py-1", "bg-[rgba(255,250,240,0.4)] dark:bg-[rgba(255,255,255,0.1)]", "border-[var(--text)]/10", "font-['Space_Mono',_monospace]", "hover:border-[var(--active)] hover:brightness-98 active:bg-[var(--active)] active:brightness-95", "focus:ring-1 focus:ring-[var(--active)]")}>
                      <FiFileText className="h-3 w-3 mr-1.5" />
                      <span className="text-xs">Notes</span>
                    </Button>
                  </div>
                  {/* Index Management Buttons */}
                  <div className="pt-4 border-t border-[var(--text)]/10">
                    <div className="flex justify-between items-center mb-2">
                      <Label className="text-base font-medium text-foreground opacity-80">Embedding Management</Label>
                    </div>
                    <p className="text-xs text-[var(--text)]/70 mb-3">
                      Current Model: {parseModelNameForDisplay(selectedEmbeddingModelDisplay) || 'None'}
                    </p>
                    <div className="flex space-x-4"> {/* Adjusted spacing */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" onClick={handleRebuildEmbeddings} className={cn("flex-1 text-[var(--text)] rounded-xl shadow-md justify-start pl-4 font-medium h-8 text-xs px-3 py-1", "bg-[rgba(255,250,240,0.4)] dark:bg-[rgba(255,255,255,0.1)]", "border-[var(--text)]/10", "font-['Space_Mono',_monospace]", "hover:border-[var(--active)] hover:brightness-98 active:bg-[var(--active)] active:brightness-95", "focus:ring-1 focus:ring-[var(--active)]")}>
                            <FiRefreshCw className="h-3 w-3" />
                            <span className="truncate ml-1.5">Rebuild</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className={sharedTooltipContentStyle}>
                          <p>Rebuild Embeddings</p>
                          <p className="text-xs opacity-80">Last: {embeddingsLastRebuild}</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" onClick={handleUpdateEmbeddings} className={cn("flex-1 text-[var(--text)] rounded-xl shadow-md justify-start pl-4 font-medium h-8 text-xs px-3 py-1", "bg-[rgba(255,250,240,0.4)] dark:bg-[rgba(255,255,255,0.1)]", "border-[var(--text)]/10", "font-['Space_Mono',_monospace]", "hover:border-[var(--active)] hover:brightness-98 active:bg-[var(--active)] active:brightness-95", "focus:ring-1 focus:ring-[var(--active)]")}>
                            <FiZap className="h-3 w-3" />
                            <span className="truncate ml-1.5">Update</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className={sharedTooltipContentStyle}>
                          <p>Update Embeddings</p>
                          <p className="text-xs opacity-80">Last: {embeddingsLastUpdate}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
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