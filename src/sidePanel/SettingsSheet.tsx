import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { IoMoonOutline, IoSunnyOutline } from 'react-icons/io5';
import { FiX } from 'react-icons/fi';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetOverlay,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { type Config } from "@/src/types/config";
import { themes as appThemes, type Theme as AppTheme } from './Themes';
import { cn } from "@/src/background/util";
import { useUpdateModels } from './hooks/useUpdateModels';
import { personaImages } from './constants';
import AnimatedBackground from './AnimatedBackground';

const SheetThemeButton = ({ theme, updateConfig, size = "h-7 w-7" }: { theme: AppTheme; updateConfig: (newConfig: Partial<Config>) => void; size?: string }) => (
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
  const [inputFocused, setInputFocused] = React.useState(false);
  const { fetchAllModels } = useUpdateModels();
  const sheetContentRef = React.useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownPosition, setDropdownPosition] = React.useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });


  const currentPersona = config?.persona || 'default';
  const personaImageSrc = personaImages[currentPersona] || personaImages.default;
  const sharedTooltipContentStyle = "bg-[var(--active)]/50 text-[var(--text)] border-[var(--text)]";

  const filteredModels =
    config?.models?.filter(
      (model) =>
        model.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        model.host?.toLowerCase()?.includes(searchQuery.toLowerCase())
    ) || [];

  const toggleTheme = () => {
    const isDarkTheme = document.documentElement.classList.contains('dark');
    const nextThemeName = isDarkTheme ? 'paper' : 'dark';
    const nextTheme = appThemes.find((t) => t.name === nextThemeName);
    if (nextTheme) {
      updateConfig({ theme: nextThemeName });
    }
  };

  const isDark = config?.theme === 'dark';
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

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setInputFocused(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (inputFocused && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [inputFocused]);

  useEffect(() => {
    if (!inputFocused) return;
    const handle = () => {
      if (inputRef.current) {
        const rect = inputRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
        });
      }
    };
    window.addEventListener('resize', handle);
    window.addEventListener('scroll', handle, true);
    return () => {
      window.removeEventListener('resize', handle);
      window.removeEventListener('scroll', handle, true);
    };
  }, [inputFocused]);

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
        <div
          className={cn(
            config?.theme === 'dark' ? 'border border-[var(--active)]' : 'border border-[var(--text)]/20',
            "sticky top-0 z-10 p-0"
          )}
        ></div>
          <SheetHeader className="px-4 pt-4 pb-4">
            <div className="flex items-center justify-between mb-2 relative z-10">
               <Tooltip>
                 <TooltipTrigger asChild>
                   <Button variant="ghost" size="sm" aria-label={isDark ? 'Light' : 'Dark'} onClick={toggleTheme} className="text-[var(--text)] rounded-md">
                     {isDark ? <IoSunnyOutline size="20px" /> : <IoMoonOutline size="20px" />}
                   </Button>
                 </TooltipTrigger>
                 <TooltipContent side="bottom" className={sharedTooltipContentStyle}>
                   {isDark ? 'Light' : 'Dark'}
                 </TooltipContent>
               </Tooltip>
               <Tooltip>
                 <TooltipTrigger asChild>
                   <Button variant="ghost" size="sm" aria-label="Close Settings" className="text-[var(--text)] rounded-md relative top-[1px]" onClick={() => onOpenChange(false)}>
                     <FiX size="20px" />
                   </Button>
                 </TooltipTrigger>
                 <TooltipContent side="bottom" className={sharedTooltipContentStyle}> Close Settings </TooltipContent>
               </Tooltip>
             </div>
             <SheetTitle className="text-center font-['Bruno_Ace_SC'] tracking-tight -mt-10 cognito-title-container">
               <a href="https://github.com/3-ark/Cognito" target="_blank" rel="noopener noreferrer"
                  className={cn(
                    "text-xl font-semibold text-[var(--text)] bg-[var(--active)] inline-block px-3 py-1 rounded-md no-underline",
                    "cognito-title-blade-glow"
                  )}>COGNITO <sub className="contrast-200 text-[0.5em]">v{APP_VERSION}</sub>
               </a>
             </SheetTitle>
             <SheetDescription className="text-center font-['Bruno_Ace_SC'] text-[var(--text)] leading-tight mt-2">
               Settings
             </SheetDescription>
          </SheetHeader>
           <div className={cn("flex flex-col h-full overflow-y-auto settings-drawer-body", "no-scrollbar")}>
              <div className={cn("flex flex-col space-y-5 flex-1", sectionPaddingX, "py-4",)}>
                <div>
                  <div className="flex items-center justify-between mt-5 mb-3">
                    <div className="flex items-center space-x-2">
                      <label htmlFor="persona-select" className="text-[var(--text)] opacity-80 font-['Bruno_Ace_SC'] text-lg shrink-0">
                        Persona
                      </label>
                      <Avatar className="h-8 w-8 border border-[var(--active)]">
                        <AvatarImage src={personaImageSrc} alt={currentPersona} />
                        <AvatarFallback>{currentPersona.substring(0, 1).toUpperCase()}</AvatarFallback>
                      </Avatar>
                    </div>
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
                      <SelectContent
                        variant="settingsPanel"
                      >
                        {Object.keys(config?.personas || {}).map((p) => (
                          <SelectItem key={p} value={p} 
                          className={cn("hover:brightness-95 focus:bg-[var(--active)]", 
                          "font-['Space_Mono',_monospace]")}
                          >
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <label htmlFor="model-input" className="block text-[var(--text)] opacity-80 text-lg font-['Bruno_Ace_SC']">Model</label>
                  <div className="relative">
                    <Input
                       id="model-input"
                       ref={inputRef}
                       value={inputFocused ? searchQuery : config?.selectedModel || ''}
                       placeholder={
                         inputFocused
                           ? 'Search models...'
                           : config?.selectedModel || 'Select model...'
                       }
                       onChange={(e) => setSearchQuery(e.target.value)}
                       onFocus={() => {
                         setSearchQuery('');
                         setInputFocused(true);
                         fetchAllModels();
                       }}
                       className={cn(
                         "text-[var(--text)] rounded-xl shadow-md w-full justify-start font-medium h-9 font-['Space_Mono',_monospace]",
                         "focus:border-[var(--active)] focus:ring-1 focus:ring-[var(--active)]",
                         "hover:border-[var(--active)] hover:brightness-95",
                         "mb-2 mt-3",
                         "ring-1 ring-inset ring-[var(--active)]/50",
                       )}
                    />
                    {inputFocused && (
                      <div 
                        className="fixed inset-0 z-50"
                        onClick={() => setInputFocused(false)}
                      >
                        <div 
                          className={cn(
                            "absolute left-0 right-0",
                            "bg-[var(--bg)]",
                            "border border-[var(--active)]/20",
                            "rounded-xl shadow-lg",
                            "max-h-[200px]",
                            "no-scrollbar",
                            "overflow-y-auto"
                          )}
                          style={{
                            top: `${dropdownPosition.top}px`,
                            left: `${dropdownPosition.left}px`,
                            width: `${dropdownPosition.width}px`,
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="py-0.5">
                            {filteredModels.length > 0 ? (
                              filteredModels.map((model) => (
                                <button
                                  key={model.id}
                                  type="button"
                                  className={cn(
                                    "w-full text-left",
                                    "px-4 py-1.5",
                                    "text-[var(--text)] text-sm",
                                    "hover:bg-[var(--active)]/20",
                                    "focus:bg-[var(--active)]/30",
                                    "transition-colors duration-150",
                                    "font-['Space_Mono',_monospace]"
                                  )}
                                  onClick={() => {
                                    updateConfig({ selectedModel: model.id });
                                    setSearchQuery('');
                                    setInputFocused(false);
                                  }}
                                >
                                  <div className="flex items-center">
                                    <span>
                                      {model.host ? `(${model.host}) ` : ''}

                                      {model.id}
                                      {model.context_length && (
                                        <span className="text-xs text-[var(--text)] opacity-50 ml-1">
                                          [ctx: {model.context_length}]
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                </button>
                              ))
                            ) : (
                              <div className="px-4 py-1.5 text-[var(--text)] opacity-50 text-sm">
                                No models found
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
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
              <div className={cn("mt-auto text-center text-[var(--text)] opacity-70 shrink-0 text-xs font-mono pb-4")}>
                  Made with ❤️ by @3-Arc
              </div>
           </div>
        </SheetContent>
    </Sheet>
  );
};