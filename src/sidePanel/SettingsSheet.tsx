import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
 FiArchive, FiClock,FiCpu, FiFileText, FiLink, FiSettings, FiX, 
} from 'react-icons/fi';
import { GoSearch } from 'react-icons/go';
import { LuSpeech } from 'react-icons/lu';
import { PiFileDoc } from "react-icons/pi";
import { VscDebugConsole } from 'react-icons/vsc';
import { AnimatePresence,motion } from 'framer-motion';

import { useRetriever } from './hooks/useRetriever';
import AnimatedBackground from './AnimatedBackground';
import { themes as appThemes } from './Customize';

// Panel components (ModelSettingsPanel, Connect, RagSettingsPanel) are no longer imported here
// as they are routed at the application level.
import { Persona } from './Persona'; 
import SearchResultsView from './SearchResultsView';

import { Button } from "@/components/ui/button";
import { Input } from '@/components/ui/input';
import {
 Sheet, SheetContent, SheetDescription, SheetHeader, SheetOverlay,SheetTitle, 
} from "@/components/ui/sheet";
import {
 Tooltip, TooltipContent, TooltipTrigger, 
} from "@/components/ui/tooltip"; // Keep for close button
import { cn } from "@/src/background/util";
import { type Config } from "@/src/types/config";

declare const APP_VERSION: string; // Assuming APP_VERSION is globally available

// New Dot Theme Selector Component
const DotThemeSelector: React.FC<{
  config: Config; // Added config prop
  updateConfig: (newConfig: Partial<Config>) => void;
}> = ({ config, updateConfig }) => { // Added config to props
  // Filter themes to show, excluding 'custom' and the current custom theme's name if it exists
  const themesToShow = appThemes.filter(t => 
    t.name !== 'custom' && 
    (!config.customTheme || t.name !== config.customTheme.name),
  );

  return (
    <div className="flex items-center justify-center space-x-3 py-3"> {/* Increased space-x and py */}
      {themesToShow.map(theme => (
        <Tooltip key={theme.name}>
          <TooltipTrigger asChild>
            <button
              aria-label={`Set ${theme.name} theme`}
              className={cn(
                "h-4 w-4 rounded-full border border-(--text)/50 transition-all duration-150 ease-in-out", // Increased size to h-4 w-4
                "focus-visible:ring-1 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-(--bg)",
                config.theme === theme.name ? 'scale-125 shadow-md' : 'hover:scale-110 opacity-70 hover:opacity-100', // Use config.theme
              )}
              style={{ backgroundColor: config.theme === theme.name ? theme.active : theme.bg }} // Use config.theme
              onClick={() => updateConfig({ theme: theme.name })}
            />
          </TooltipTrigger>
          <TooltipContent className="bg-(--active)/50 text-(--text) border-(--text)" side="bottom">
            <p className="capitalize">{theme.name}</p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
};

export interface SettingsSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  config: Config;
  updateConfig: (newConfig: Partial<Config>) => void;
  setSettingsMode: (mode: boolean) => void; // For legacy settings
  setHistoryMode: (mode: boolean) => void;
  setNoteSystemMode: (mode: boolean) => void;
  setModelSettingsPageMode: (mode: boolean) => void;
  setApiSettingsPageMode: (mode: boolean) => void;
  setRagSettingsPageMode: (mode: boolean) => void;
  setCustomizePageMode: (mode: boolean) => void;
  setWebSearchPageMode: (mode: boolean) => void;
  setPageSettingsPageMode: (mode: boolean) => void;
}

export const SettingsSheet: React.FC<SettingsSheetProps> = ({
  isOpen,
  onOpenChange,
  config,
  updateConfig,
  setSettingsMode,
  setHistoryMode,
  setNoteSystemMode,
  setModelSettingsPageMode,
  setApiSettingsPageMode,
  setRagSettingsPageMode,   
  setCustomizePageMode,
  setWebSearchPageMode,
  setPageSettingsPageMode,
}) => {
  const { t } = useTranslation();
  const sheetContentRef = React.useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = React.useState<'settings' | 'memory'>('memory');
  const {
 retrieverResults, isRetrieving, retrieve, clearRetrieverResults, 
} = useRetriever();
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = React.useState('');

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [searchQuery]);

  React.useEffect(() => {
    if (debouncedSearchQuery.length > 2) {
      retrieve(debouncedSearchQuery);
    } else {
      clearRetrieverResults();
    }
  }, [debouncedSearchQuery, retrieve, clearRetrieverResults]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleResultClick = (result: any) => {
    console.log('Search result clicked:', result);

    // Future implementation: open note or chat
  };

  const sharedTooltipContentStyle = "bg-(--active)/50 text-(--text) border-(--text)";

  // Navigation handlers now close the sheet and set app-level page modes
  const navigateToPage = (setter: (mode: boolean) => void) => {
    setter(true);
    onOpenChange(false);
  };
  
  // Button class for grid items (Model, API, RAG, Notes, History)
  const gridButtonClass = cn(
    "flex flex-col items-center justify-center p-2 h-20", 
    "text-(--text) rounded-xl shadow-md",
    "bg-[var(--input-background)]", 
    "border border-(--text)/20",
    "hover:border-(--active) hover:brightness-110 active:brightness-95",
    "focus:ring-1 focus:ring-(--active)",
    "text-xs font-['Space_Mono',_monospace] break-words whitespace-normal text-center leading-tight", // Allow text wrapping
  );

  // The sheet now has only one static layout.
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetOverlay />
      <SheetContent
        ref={sheetContentRef}
        className={cn(
          "p-0 border-r-0",
          "w-[22.857rem] sm:w-[27.143rem]", 
          "flex flex-col h-full max-h-screen",
          "[&>button]:hidden", 
          "settings-drawer-content",
          "bg-(--bg)", 
        )}
        side="left"
        style={{ height: '100dvh' }}
        variant="themedPanel"
        onOpenAutoFocus={e => { e.preventDefault(); sheetContentRef.current?.focus({ preventScroll: true }); }}
      >
        <AnimatedBackground />
        {/* Scrollable area for main content */}
        <div className={cn("flex-1 overflow-y-auto p-3 space-y-8 no-scrollbar")}> {/* Increased space-y TO 8 for more separation due to labels */}
          
          {/* Search Bar */}
          <div className="relative mt-4">
            <Input
              className="w-full shadow-sm rounded-xl text-(--text) font-['Space_Mono',_monospace] pl-10"
              placeholder={t('Search from your chat & note...')}
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
            />
            <GoSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[var(--text-muted)]" />
          </div>

          {isRetrieving && <div className="text-center">Searching...</div>}
          {retrieverResults && retrieverResults.results.length > 0 && (
            <SearchResultsView results={retrieverResults.results} onResultClick={handleResultClick} />
          )}

          <DotThemeSelector config={config} updateConfig={updateConfig} />

          {/* Tab Buttons */}
          <div className="flex justify-center">
            <Button
              className={cn(
                "flex-1 font-['Bruno_Ace_SC',_sans-serif] uppercase py-2 rounded-none", // Added rounded-none
                "focus-visible:ring-1 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-0", // Adjusted focus ring
                activeTab === 'settings'
                  ? "text-[var(--link)] border-b-2 border-[var(--link)]"
                  : "text-(--text)/70 hover:text-(--text) border-b border-(--text)/20 hover:border-(--active)",
              )}
              variant="ghost" // Changed variant to ghost to remove default button styling
              onClick={() => setActiveTab('settings')}
            >
              {t('Settings')}
            </Button>
            <Button
              className={cn(
                "flex-1 font-['Bruno_Ace_SC',_sans-serif] uppercase py-2 rounded-none", // Added rounded-none
                "focus-visible:ring-1 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-0", // Adjusted focus ring
                activeTab === 'memory'
                  ? "text-[var(--link)] border-b-2 border-[var(--link)]"
                  : "text-(--text)/70 hover:text-(--text) border-b border-(--text)/20 hover:border-(--active)",
              )}
              variant="ghost" // Changed variant to ghost
              onClick={() => setActiveTab('memory')}
            >
              {t('Memory')}
            </Button>
          </div>

          {/* Persona Section */}
          <div className="relative"> 
            {/* Changed p-0 to p-2 to match other group containers for consistent shadow and internal spacing */}
            <div className="p-2">
              <Persona />
            </div>
          </div>

          {/* Tab Content Area */}
          <AnimatePresence mode="wait">
            {activeTab === 'settings' && (
              <motion.div
                key="settings"
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                initial={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.2 }}
              >
                {/* Settings Section */}
                <div className="relative">
                  <div className="p-2">
                    <div className="grid grid-cols-3 gap-2">
                      <Button className={gridButtonClass} variant="outline" onClick={() => navigateToPage(setModelSettingsPageMode)}>
                        <FiCpu className="text-2xl mb-0.5" />{t('Model')}
                      </Button>
                      <Button className={gridButtonClass} variant="outline" onClick={() => navigateToPage(setApiSettingsPageMode)}>
                        <FiLink className="text-2xl mb-0.5" />{t('API')}
                      </Button>
                      <Button className={gridButtonClass} variant="outline" onClick={() => navigateToPage(setCustomizePageMode)}>
                        <FiSettings className="text-2xl mb-0.5" />{t('Customize')}
                      </Button>
                      <Button className={gridButtonClass} variant="outline" onClick={() => navigateToPage(setWebSearchPageMode)}>
                        <GoSearch className="text-2xl mb-0.5" />{t('Web Search')}
                      </Button>
                      <Button className={gridButtonClass} variant="outline" onClick={() => navigateToPage(setPageSettingsPageMode)}>
                        <FiFileText className="text-2xl mb-0.5" />{t('Page')}
                      </Button>
                      <Button className={gridButtonClass} variant="outline" onClick={() => navigateToPage(setSettingsMode)}>
                        <LuSpeech className="text-2xl mb-0.5" />{t('Speech')}
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'memory' && (
              <motion.div
                key="memory"
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                initial={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.2 }}
              >
                {/* Memory Section */}
                <div className="relative">
                  <div className="p-2">
                    <div className="grid grid-cols-3 gap-2">
                      <Button className={gridButtonClass} variant="outline" onClick={() => navigateToPage(setHistoryMode)}>
                        <FiClock className="text-2xl mb-0.5" />{t('History')}
                      </Button>
                      <Button className={gridButtonClass} variant="outline" onClick={() => navigateToPage(setNoteSystemMode)}>
                        <FiFileText className="text-2xl mb-0.5" />{t('Notes')}
                      </Button>
                      <Button className={gridButtonClass} variant="outline" onClick={() => navigateToPage(setRagSettingsPageMode)}>
                        <FiArchive className="text-2xl mb-0.5" />{t('RAG')}
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {/* Header - Adjusted to match draft */}
        <SheetHeader> {/* Added border-t for visual separation */}
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center space-x-2">
              <SheetTitle>
                <div className="flex items-center text-xs font-mono w-fit overflow-hidden rounded-full">
                  <span className="bg-(--active) text-(--text) pl-2 pr-1.5">Cognito</span>
                  <span className="bg-[var(--link)] text-white pl-1.5 pr-2">{APP_VERSION}</span>
                </div>
              </SheetTitle>
            </div>
            <div className="flex items-center space-x-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="Report bugs"
                    className="text-(--text) size:4 rounded-xl"
                    variant="ghost"
                    onClick={() => window.open("https://github.com/3-ark/Cognito-AI_Sidekick/issues/new", '_blank')}
                  >
                    <VscDebugConsole className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className={sharedTooltipContentStyle} side="top">Report Bugs</TooltipContent> {/* Changed side to top */}
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="Documents"
                    className="text-(--text) size:4 rounded-xl"
                    variant="ghost"
                    onClick={() => window.open("https://example.com/docs", '_blank')}
                  >
                    <PiFileDoc className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className={sharedTooltipContentStyle} side="top">Documents</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button aria-label="Close Settings" className="text-(--text) size:4 rounded-xl" variant="ghost" onClick={() => onOpenChange(false)}>
                    <FiX />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className={sharedTooltipContentStyle} side="top">Close Settings</TooltipContent> {/* Changed side to top */}
              </Tooltip>
            </div>
          </div>
          <SheetDescription className="sr-only">Settings panel for Cognito extension</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  );
};