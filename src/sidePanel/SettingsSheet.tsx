import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { FiX, FiBookOpen, FiSearch } from 'react-icons/fi';
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetOverlay } from "@/components/ui/sheet"; // SheetHeader removed as it's not used
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { HybridRankedChunk } from '@/src/background/retrieverUtils'; // Only import the type
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

  useEffect(() => {
    const performSearch = async () => {
      if (searchQuery.trim().length < 3) { // Only search if query is 3+ chars
        setSearchResults([]);
        setSearchError(null);
        return;
      }
      setIsLoadingSearch(true);
      setSearchError(null);
      chrome.runtime.sendMessage(
        {
          type: 'PERFORM_SETTINGS_SEARCH',
          payload: { query: searchQuery },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error("Error sending PERFORM_SETTINGS_SEARCH message:", chrome.runtime.lastError.message);
            setSearchError("Error communicating with background script.");
            setSearchResults([]);
            setIsLoadingSearch(false);
            return;
          }
          if (response.success) {
            setSearchResults(response.results);
          } else {
            console.error("Search failed:", response.error);
            setSearchError(response.error || "Failed to fetch search results.");
            setSearchResults([]);
          }
          setIsLoadingSearch(false);
        }
      );
    };

    const debounceTimeout = setTimeout(() => {
      performSearch();
    }, 500); // Debounce search by 500ms

    return () => clearTimeout(debounceTimeout);
  }, [searchQuery]); // Removed config from dependencies as it's managed by background

  const sectionPaddingX = 'px-6';

  const handleConfigClick = () => {
    setSettingsMode(true);
    onOpenChange(false);
  };

  const handleHistoryClick = () => {
    setHistoryMode(true);
    onOpenChange(false);
  };

  const handleNoteSystemClick = () => {
    setNoteSystemMode(true);
    onOpenChange(false);
  };

  const presetThemesForSheet = appThemes.filter(t => t.name !== 'custom' && t.name !== config?.customTheme?.name);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
        <SheetOverlay />
        <SheetContent
           variant="themedPanel"
           side="left"
           className={cn(
             "p-0 border-r-0",
             "w-[22.857rem] sm:w-[27.143rem]",
             "flex flex-col h-full max-h-screen",
             "[&>button]:hidden",
             "settings-drawer-content",
             "overflow-y-auto"
            )}
            style={{ height: '100dvh' }}
            ref={sheetContentRef}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              sheetContentRef.current?.focus({ preventScroll: true });
            }}
        >
        <AnimatedBackground />
           <div className={cn("flex flex-col flex-1 overflow-y-auto settings-drawer-body", "no-scrollbar")}> {/* Adjusted flex-1 to ensure content area takes up space */}
              <div className={cn("flex flex-col space-y-5 flex-1", sectionPaddingX, "py-4")}>
                {/* Search Bar */}
                <div className="relative mt-5">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text)] opacity-50" />
                  <Input
                    type="text"
                    placeholder="Search your notes and chat history..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={cn(
                      "pl-10 pr-4 py-2 w-full rounded-md border border-[var(--text)]/20 bg-[var(--bg)]/50 text-[var(--text)] placeholder:text-[var(--text)]/50",
                      "focus:ring-1 focus:ring-[var(--active)] focus:border-[var(--active)]"
                    )}
                  />
                </div>

                {/* Search Results */}
                {isLoadingSearch && <div className="text-center text-[var(--text)] opacity-70">Searching...</div>}
                {searchError && <div className="text-center text-red-500">{searchError}</div>}
                {searchResults.length > 0 && (
                  <ScrollArea className="h-[200px] rounded-md border border-[var(--text)]/20 p-2 bg-[var(--bg)]/30">
                    <div className="space-y-2">
                      {searchResults.map((result) => (
                        <div key={result.chunkId} className="p-2 rounded-md bg-[var(--bg)]/50 border border-[var(--text)]/10">
                          <div className="text-xs text-[var(--text)] opacity-70">
                            {result.parentType === 'note' ? 'Note' : 'Chat'} - Score: {result.hybridScore.toFixed(2)}
                          </div>
                          <div className="font-medium text-sm text-[var(--text)] truncate" title={result.parentTitle}>
                            {result.parentTitle}
                          </div>
                          <p className="text-xs text-[var(--text)] opacity-80 line-clamp-2" title={result.chunkText}>
                            {result.chunkText}
                          </p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}

                <div>
                  <div className="flex items-center justify-between mt-5 mb-3">
                      <label htmlFor="persona-select" className="text-[var(--text)] opacity-80 font-['Bruno_Ace_SC'] text-lg shrink-0">
                        Persona
                      </label>
                    <div className="flex items-center space-x-1.5">
                      {presetThemesForSheet.map(theme => (
                        <SheetThemeButton
                          key={theme.name}
                          theme={theme}
                          updateConfig={updateConfig}
                        />
                      ))}
                    </div>
                  </div>
                    <div className="w-full">
                    <Select
                      value={currentPersona}
                      onValueChange={(value) => updateConfig({ persona: value })}
                    >
                      <SelectTrigger
                        id="persona-select"
                        variant="settingsPanel"
                        className="w-full font-['Space_Mono',_monospace] data-[placeholder]:text-muted-foreground"
                      >
                        <SelectValue placeholder="Select Persona..." />
                      </SelectTrigger>
                      <SelectContent variant="settingsPanel">
                         {Object.keys(config?.personas || {}).map((p) => {
                            const personaAvatar = config?.personaAvatars?.[p] || DEFAULT_PERSONA_IMAGES[p] || DEFAULT_PERSONA_IMAGES.default;
                            return (
                         <SelectItem 
                            key={p} 
                            value={p} 
                            className={cn(
                               "hover:brightness-95 focus:bg-[var(--active)]", 
                                "font-['Space_Mono',_monospace]",
                               "flex items-center gap-2"
                                      )}
                        >
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
                  </div>
                </div>

                 <div className="space-y-3">
                    <Button
                      size="default" onClick={handleConfigClick}
                      variant="outline"
                      className={cn(
                        "text-[var(--text)] rounded-xl shadow-md w-full justify-start font-medium h-9",
                        "bg-[rgba(255,250,240,0.4)] dark:bg-[rgba(255,255,255,0.1)]",
                        "border-[var(--text)]/10",
                        "font-['Space_Mono',_monospace]",
                        "hover:border-[var(--active)] hover:brightness-98 active:bg-[var(--active)] active:brightness-95",
                        "focus:ring-1 focus:ring-[var(--active)]",
                        "mb-4",
                      )}
                    >
                      Configuration
                    </Button>
                    <Button
                       variant="outline"
                       size="default" onClick={handleHistoryClick}
                       className={cn(
                        "text-[var(--text)] rounded-xl shadow-md w-full justify-start font-medium h-9",
                        "bg-[rgba(255,250,240,0.4)] dark:bg-[rgba(255,255,255,0.1)]",
                        "border-[var(--text)]/10",
                        "font-['Space_Mono',_monospace]",
                        "hover:border-[var(--active)] hover:brightness-98 active:bg-[var(--active)] active:brightness-95",
                        "focus:ring-1 focus:ring-[var(--active)]",
                        "mb-4 mt-3",
                       )}
                    >
                      Chat History
                    </Button>
                    <Button
                       variant="outline"
                       size="default" onClick={handleNoteSystemClick}
                       className={cn(
                        "text-[var(--text)] rounded-xl shadow-md w-full justify-start font-medium h-9",
                        "bg-[rgba(255,250,240,0.4)] dark:bg-[rgba(255,255,255,0.1)]",
                        "border-[var(--text)]/10",
                        "font-['Space_Mono',_monospace]",
                        "hover:border-[var(--active)] hover:brightness-98 active:bg-[var(--active)] active:brightness-95",
                        "focus:ring-1 focus:ring-[var(--active)]",
                        "mb-4 mt-3",
                       )}
                    >
                      Note System
                    </Button>
                 </div>
              </div>
              {/* Footer div removed */}
           </div>
            {/* New Footer Section */}
            <div className={cn(
                "sticky bottom-0 z-10 p-3", // p-3 provides padding around the footer content
                "flex items-center justify-between"
            )}>
                {/* Pill Tag */}
                <div className="flex rounded-sm overflow-hidden shadow-md">
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
         </SheetContent>
     </Sheet>
  );
};