import React, { useState, useEffect } from 'react';
import { FiX, FiTrash2, FiShare, FiChevronLeft, FiUpload } from 'react-icons/fi';
import { TbReload, TbJson } from "react-icons/tb";
import { useConfig } from './ConfigContext';
import { cn } from "@/src/background/util";
import { toast } from 'react-hot-toast';
import { Button } from "@/components/ui/button";
import { SettingsSheet } from './SettingsSheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { IoFingerPrint, IoPerson, IoImageOutline, IoTextOutline, IoCheckmarkCircleOutline } from "react-icons/io5"; // Added IoCheckmarkCircleOutline
import { GoPlus } from "react-icons/go";
import { LuEllipsis } from "react-icons/lu"; // Import LuEllipsis
import { BsFiletypeMd } from "react-icons/bs";

import {type Config, Model, ChatMode, ChatStatus } from "@/src/types/config";
import { DEFAULT_PERSONA_IMAGES } from './constants';
import { Changelog } from './components/Changelog/Changelog';
import { ModelSelection } from './ModelSelection';
import { useUpdateModels } from './hooks/useUpdateModels';
import { VscRocket } from "react-icons/vsc";


function getStatusText(mode: ChatMode, status: ChatStatus): string {
  if (status === 'idle') return 'Online';
  if (mode === 'chat') {
    if (status === 'typing') return 'Typing…';
    if (status === 'thinking') return 'Thinking…';
  }
  if (mode === 'web') {
    if (status === 'searching') return 'Searching web…';
    if (status === 'thinking') return 'Processing SERP…';
  }
  if (mode === 'page') {
    if (status === 'reading') return 'Reading page…';
    if (status === 'thinking') return 'Analyzing…';
  }
  if (status === 'done') return 'Online';
  return 'Online';
}

// --- Word-by-word typewriter animation ---
function TypewriterLinesWordByWord({ lines, delay = 120, className = "" }: { lines: React.ReactNode[], delay?: number, className?: string }) {
  const words = lines.flatMap((line, idx) =>
    typeof line === "string"
      ? line.split(" ").map((word, i, arr) => word + (i < arr.length - 1 ? " " : "")).concat(idx < lines.length - 1 ? ["\n"] : [])
      : [line, idx < lines.length - 1 ? "\n" : ""]
  );
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (visibleCount < words.length) {
      const timer = setTimeout(() => setVisibleCount(visibleCount + 1), delay);
      return () => clearTimeout(timer);
    }
  }, [visibleCount, words.length, delay]);

  return (
    <div
      className={className}
      style={{
        fontFamily: "'Space Mono', monospace",
        whiteSpace: "pre-wrap"
      }}
    >
      {words.slice(0, visibleCount).map((word, idx) =>
        word === "\n" ? <br key={idx} /> : <span key={idx}>{word}</span>
      )}
      {visibleCount < words.length && <span className="blinking-cursor">|</span>}
    </div>
  );
}

// --- Guide content with link ---
const guideLines = [
  "1. In Settings, go to 'API Access' to fill in your API keys or URLs.",
  "2. Exit settings, then click the model selector in the header to choose your model. You can set your username in the top right corner.",
  "3. Use the 'Chat Controls' (notebook icon in input bar) to toggle AI memory and tool usage.",
  <>
    4. Check the user guide{" "}
    <a
      href="https://github.com/3-ark/Cognito-AI_Sidekick/blob/main/docs/USER_GUIDE.md"
      target="_blank"
      rel="noopener noreferrer"
      className="underline text-blue-600 dark:text-blue-400 hover:text-blue-800"
    >
      here
    </a>
  </>,
  "",
  "Note: You can adjust other settings later. For the best experience and to avoid this guide, an API setup is recommended even for local models. Have fun!"
];

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void; // Changed to simple onClose
  setSettingsMode: (mode: boolean) => void;
}

const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose, setSettingsMode }) => {
  const handleGotIt = () => {
    chrome.storage.local.set({ hasSeenWelcomeGuide: true });
    onClose();
    setSettingsMode(true); // Navigate to settings
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}> {/* Call onClose when dialog tries to close */}
      <DialogContent
        variant="themedPanel"
        className={cn(
          "[&>button]:hidden", // Hide default close button if any
          "flex flex-col items-center justify-center" // Center content
        )}
        style={{
          width: '22rem', // Adjusted width for content
          minHeight: '18rem', // Adjusted height for content
          borderRadius: '1.875rem',
          boxShadow: '0.9375rem 0.9375rem 1.875rem rgb(25, 25, 25), 0 0 1.875rem rgb(60, 60, 60)'
        }}
        onInteractOutside={(e) => e.preventDefault()} // Prevent closing on outside click
      >
        <DialogHeader className="text-center font-['Bruno_Ace_SC'] p-2 header-title-glow mt-4">
          <DialogTitle className="text-lg">Quick Guide</DialogTitle>
          <DialogDescription className="sr-only">
            A quick introduction to get you started with Cognito.
          </DialogDescription>
        </DialogHeader>
        <div className="p-4 text-left w-full max-w-md">
          <TypewriterLinesWordByWord
            lines={guideLines}
            delay={50} // Faster typing
            className="text-sm text-[var(--text)] mt-2"
          />
        </div>
        <DialogFooter className="mt-auto p-4">
          <Button
            variant="ghost"
            className="fingerprint-pulse-btn"
            onClick={handleGotIt}
            aria-label="Got it, proceed to settings"
          >
            <IoFingerPrint size="3rem" color="var(--active)" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface EditProfileDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  config: Config;
  updateConfig: (newConfig: Partial<Config>) => void;
}

const EditProfileDialog: React.FC<EditProfileDialogProps> = ({
  isOpen,
  onOpenChange,
  config,
  updateConfig,
}) => {
  const [currentUserName, setCurrentUserName] = useState(config?.userName || '');
  const [currentUserProfile, setCurrentUserProfile] = useState(config?.userProfile || '');

  useEffect(() => {
    if (isOpen) {
      setCurrentUserName(config?.userName || '');
      setCurrentUserProfile(config?.userProfile || '');
    }
  }, [isOpen, config?.userName, config?.userProfile]);

  const handleSave = () => {
    updateConfig({ userName: currentUserName, userProfile: currentUserProfile });
    onOpenChange(false);
    toast.success("Profile updated!");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        variant="themedPanel"
        className="max-w-xs"
      >
        <DialogHeader className="px-6 py-4 border-b border-[var(--text)]/10">
          <DialogTitle className="text-lg font-semibold text-[var(--text)]">Edit Profile</DialogTitle>
          <DialogDescription className="text-sm text-[var(--text)] opacity-80">
            Set your display name and profile information. (For chat and export purposes)
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username" className="text-sm font-medium text-[var(--text)] opacity-90">
              Username
            </Label>
            <Input
              id="username"
              value={currentUserName}
              onChange={(e) => setCurrentUserName(e.target.value)}
              className={cn(
                "focus:border-[var(--active)] focus:ring-1 focus:ring-[var(--active)]",
                "hover:border-[var(--active)] hover:brightness-98",
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="userprofile" className="text-sm font-medium text-[var(--text)] opacity-90">
              User Profile
            </Label>
            <Input
              id="userprofile"
              value={currentUserProfile}
              onChange={(e) => setCurrentUserProfile(e.target.value)}              
              className={cn(
                "focus:border-[var(--active)] focus:ring-1 focus:ring-[var(--active)]",
                "hover:border-[var(--active)] hover:brightness-98",
              )}
            />
          </div>
        </div>
        <DialogFooter className="px-6 py-4 border-t border-[var(--text)]/10">
          <Button
            variant="outline-subtle" // Use new variant
            size="sm" // Standardize size
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="active-bordered" // Use new variant
            size="sm" // Standardize size
            onClick={handleSave}
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface HeaderProps {
  chatTitle?: string | null;
  settingsMode: boolean;
  setSettingsMode: (mode: boolean) => void;
  historyMode: boolean;
  setHistoryMode: (mode: boolean) => void;
  noteSystemMode: boolean;
  setNoteSystemMode: (mode: boolean) => void;
  deleteAll: () => void | Promise<void>;
  reset: () => void;
  downloadImage: () => void;
  downloadJson: () => void;
  downloadText: () => void;
  downloadMarkdown: () => void;
  chatMode: ChatMode;
  chatStatus: ChatStatus;
  onAddNewNoteRequest?: () => void;
  onImportNoteRequest?: () => void;
  onSelectNotesRequest?: () => void; // New prop for selecting notes
}

export const Header: React.FC<HeaderProps> = ({
  chatTitle,
  settingsMode,
  setSettingsMode,
  historyMode,
  setHistoryMode,
  noteSystemMode,
  setNoteSystemMode,
  deleteAll,
  reset,
  downloadImage,
  downloadJson,
  downloadText,
  downloadMarkdown,
  chatMode,
  chatStatus,
  onAddNewNoteRequest,
  onImportNoteRequest,
  onSelectNotesRequest, // Destructure new prop
}) => {
  const { config, updateConfig } = useConfig();
  const { fetchAllModels } = useUpdateModels();
  const [isEditProfileDialogOpen, setIsEditProfileDialogOpen] = useState(false);
  const [isChangelogOpen, setChangelogOpen] = useState(false);
  const [showWelcomeModalState, setShowWelcomeModalState] = useState(false); // Renamed to avoid conflict

useEffect(() => {
  // Check for welcome guide
  chrome.storage.local.get('hasSeenWelcomeGuide', (result) => {
    if (!result.hasSeenWelcomeGuide) {
      setShowWelcomeModalState(true);
    }
  });
}, []);

const handleWelcomeModalClose = () => {
  setShowWelcomeModalState(false);
  // The flag `hasSeenWelcomeGuide` is set inside the WelcomeModal's handleGotIt by clicking the fingerprint button
};

useEffect(() => {
  // Check for changelog
  const lastVersionStored = localStorage.getItem('lastVersion');
  const currentVersion = APP_VERSION as string;

  if (lastVersionStored !== currentVersion) {
    // New version detected or first time running with this version tracking
    localStorage.removeItem('changelogDismissed'); // Ensure changelog shows if version changed or if this flag was somehow set
    setChangelogOpen(true);
    localStorage.setItem('lastVersion', currentVersion);
  }
  // Note: The 'changelogDismissed' flag is typically handled by the Changelog component itself if it offers a "don't show again for this version" feature.
  // Here, we ensure it's shown if the version is new.
}, []);

const handleChangelogClose = () => {
  setChangelogOpen(false);
};

  const currentPersona = config?.persona || 'default';
  const currentPersonaAvatar = config?.personaAvatars?.[currentPersona] || DEFAULT_PERSONA_IMAGES[currentPersona] || DEFAULT_PERSONA_IMAGES.default;

  const visibleTitle = chatTitle && !settingsMode && !historyMode && !noteSystemMode;
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const handleSheetOpenChange = (open: boolean) => {setIsSheetOpen(open);}

  const showBackButton = settingsMode || historyMode || noteSystemMode;

  const handleLeftButtonClick = () => {
    if (showBackButton) {
      setSettingsMode(false);
      setHistoryMode(false);
      setNoteSystemMode(false); // Ensure note system mode is also reset
    } else {
      setIsSheetOpen(true);
    }
  };

  const leftButtonLabel = showBackButton 
    ? 'Back to Chat' 
    : config?.userName 
      ? `Hi ${config.userName}, settings?`
      : 'Settings';

  const handleDeleteAllWithConfirmation = () => {
    toast.custom(
      (t) => (
        <div
          className={cn(
            "bg-[var(--bg)] text-[var(--text)] border border-[var(--text)]",
            "p-4 rounded-lg shadow-xl max-w-sm w-full",
            "flex flex-col space-y-3"
          )}
        >
          <h4 className="text-lg font-semibold text-[var(--text)]">Confirm Deletion</h4>
          <p className="text-sm text-[var(--text)] opacity-90">
            Are you sure you want to delete all chat history? This action cannot be undone.
          </p>
          <div className="flex justify-end space-x-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "bg-transparent text-[var(--text)] border-[var(--text)]",
                "hover:bg-[var(--active)]/30 focus:ring-1 focus:ring-[var(--active)]"
              )}
              onClick={() => toast.dismiss(t.id)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className={cn(
                "focus:ring-1 focus:ring-red-400 focus:ring-offset-1 focus:ring-offset-[var(--bg)]"
              )}
              onClick={async () => {
                try {
                  if (typeof deleteAll === 'function') {
                    await deleteAll();
                  } else {
                    console.error("Header: deleteAll prop is not a function or undefined.", deleteAll);
                    toast.error("Failed to delete history: Operation not available.");
                  }
                } catch (error) {
                  console.error("Error during deleteAll execution from header:", error);
                  toast.error("An error occurred while deleting history.");
                } finally {
                  toast.dismiss(t.id);
                }
              }}
            >
              Delete All
            </Button>
          </div>
        </div>
      ),
      {
        duration: Infinity,
        position: 'top-center',
      }
    );
  };

  const sideContainerWidthClass = "w-24";
  const rightSideContainerWidthClass = sideContainerWidthClass;
  const dropdownContentClasses = "z-50 min-w-[6rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2";
  const dropdownItemClasses = "flex cursor-default select-none items-center rounded-sm px-2 py-1 text-sm outline-none transition-colors focus:bg-accent focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50";
  const dropdownSubTriggerClasses = "flex cursor-default select-none items-center rounded-sm px-2 py-1 text-sm outline-none focus:bg-accent data-[state=open]:bg-accent";
  const dropdownSeparatorClasses = "-mx-1 my-1 h-px bg-muted";

  return (
    <TooltipProvider delayDuration={500}>
      <div 
        className={cn(
          "sticky top-0 z-10 px-2",
        )}
      >
        <div className="flex items-center h-auto">
          {/* Left Button Area */}
          <div className={cn("flex justify-start items-center min-h-10", sideContainerWidthClass)}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={leftButtonLabel}
                  variant="ghost"
                  size={showBackButton ? "sm" : undefined}
                  className={cn(
                    "text-[var(--text)] rounded-md p-0 h-8 w-8 flex items-center justify-center"
                  )}
                  onClick={handleLeftButtonClick}
                >
                  {showBackButton ? (
                    <FiX size="22px" />
                  ) : (
                    <Avatar className="h-8 w-8 border border-[var(--active)]">
                      <AvatarImage src={currentPersonaAvatar} alt={currentPersona} />
                      <AvatarFallback>{currentPersona.substring(0, 1).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-[var(--active)]/50 text-[var(--text)] border-[var(--text)]">
                {leftButtonLabel}
              </TooltipContent>
            </Tooltip>
            {!showBackButton && (
              <div className="flex flex-col justify-center ml-1">
                <span className="text-[0.8125rem] font-medium text-[var(--text)] leading-tight">
                  {currentPersona === 'default' ? 'Jet' : currentPersona}
                </span>
                <span className="text-[0.625rem] text-muted-foreground font-semibold leading-tight flex items-center pt-0.5">
                  {chatStatus === 'idle' && (
                    <span className="h-1.5 w-1.5 bg-green-600 rounded-full mr-1"></span>
                  )}
                  {getStatusText(chatMode, chatStatus)}
                </span>
              </div>
            )}
          </div>

          {/* Middle Content Area */}
          <div className="flex-grow flex flex-col justify-center items-center overflow-hidden"> {/* Removed py-1 */}
            {!historyMode && !settingsMode && !noteSystemMode && (
              <div className="w-full max-w-xs"> {/* Removed px-1 */}
                <ModelSelection
                  config={config}
                  updateConfig={updateConfig}
                  fetchAllModels={fetchAllModels}
                />
              </div>
            )}
            {visibleTitle && (
              <p className="text-xs text-[var(--text)] opacity-70 whitespace-nowrap overflow-hidden text-ellipsis text-center mt-0.5"> {/* Small, muted, margin-top */}
                {chatTitle}
              </p>
            )}
            {settingsMode && (
              <div className="flex items-center justify-center">
                <p className="relative top-0 text-lg font-['Bruno_Ace_SC'] header-title-glow">
                  Configuration
                </p>
              </div>
            )}
            {historyMode && (
              <div className="flex items-center justify-center">
                <p className="font-['Bruno_Ace_SC'] text-lg header-title-glow">
                  Chat History
                </p>
              </div>
            )}
            {noteSystemMode && (
              <div className="flex items-center justify-center">
                <p className="font-['Bruno_Ace_SC'] text-lg header-title-glow">
                  Note System
                </p>
              </div>
            )}
          </div>

          {/* Right Button Area */}
          <div className={cn("flex justify-end items-center min-h-10", rightSideContainerWidthClass)}>
            {!settingsMode && !historyMode && !noteSystemMode && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label="Reset Chat"
                      variant="ghost"
                      size="sm"
                      className="text-[var(--text)] hover:bg-black/10 dark:hover:bg-white/10 rounded-md group"
                      onClick={reset}
                    >
                      <TbReload 
                        size="18px" 
                        className="transition-transform duration-300 rotate-0 group-hover:rotate-180 text-[var(--text)]" 
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-[var(--active)]/50 text-[var(--text)] border-[var(--text)]">
                    Reset Chat
                  </TooltipContent>
                </Tooltip>

                {/* Share Button with Radix Dropdown Menu */}
                <DropdownMenuPrimitive.Root>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuPrimitive.Trigger asChild>
                        <Button
                          aria-label="Share Options"
                          variant="ghost"
                          size="sm"
                          className="text-[var(--text)] rounded-md"
                        >
                          <FiShare size="18px" />
                        </Button>
                      </DropdownMenuPrimitive.Trigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="bg-[var(--active)]/50 text-[var(--text)] border-[var(--text)]">
                      Share Options
                    </TooltipContent>
                  </Tooltip>
                  <DropdownMenuPrimitive.Portal>
                    <DropdownMenuPrimitive.Content
                      className={cn(
                        dropdownContentClasses,
                        "bg-[var(--bg)] text-[var(--text)] border-[var(--text)]/20 shadow-xl"
                      )}
                      sideOffset={5}
                      align="end"
                    >
                      <DropdownMenuPrimitive.Item
                        className={cn(
                          dropdownItemClasses,
                          "gap-2",
                          "hover:bg-[var(--active)]/30 focus:bg-[var(--active)]/30 cursor-pointer"
                        )}
                        onSelect={() => setIsEditProfileDialogOpen(true)}
                      >
                        <IoPerson  className="mr-auto h-4 w-4" />
                        Your Profile
                      </DropdownMenuPrimitive.Item>
                      <DropdownMenuPrimitive.Separator
                        className={cn(
                          dropdownSeparatorClasses,
                          "bg-[var(--text)]/10"
                        )}
                      />
                      <DropdownMenuPrimitive.Item
                        className={cn(
                          dropdownItemClasses,
                          "gap-2",
                          "hover:bg-[var(--active)]/30 focus:bg-[var(--active)]/30 cursor-pointer"
                        )}
                        onSelect={() => setChangelogOpen(true)}
                      >
                        <VscRocket className="mr-auto h-4 w-4" />
                        What's New
                      </DropdownMenuPrimitive.Item>
                      <DropdownMenuPrimitive.Separator
                        className={cn(
                          dropdownSeparatorClasses,
                          "bg-[var(--text)]/10"
                        )}
                      />
                      <DropdownMenuPrimitive.Sub>
                        <DropdownMenuPrimitive.SubTrigger
                          className={cn(
                            dropdownSubTriggerClasses,
                            "gap-2",
                            "hover:bg-[var(--active)]/30 focus:bg-[var(--active)]/30 cursor-pointer"
                          )}
                        >
                        <FiChevronLeft className="mr-auto h-4 w-4" />
                          Export Chat
                        </DropdownMenuPrimitive.SubTrigger>
                        <DropdownMenuPrimitive.Portal>
                          <DropdownMenuPrimitive.SubContent
                            className={cn(
                              dropdownContentClasses,
                              "bg-[var(--bg)] text-[var(--text)] border-[var(--text)]/20 shadow-lg"
                            )}
                            sideOffset={2}
                            alignOffset={-5}
                          >
                            <DropdownMenuPrimitive.Item
                              className={cn(dropdownItemClasses, "hover:bg-[var(--active)]/30 focus:bg-[var(--active)]/30 cursor-pointer")}
                              onSelect={downloadMarkdown}
                            >
                            <BsFiletypeMd className="mr-auto h-4 w-4" />
                              .md
                            </DropdownMenuPrimitive.Item>
                            <DropdownMenuPrimitive.Item
                              className={cn(dropdownItemClasses, "hover:bg-[var(--active)]/30 focus:bg-[var(--active)]/30 cursor-pointer")}
                              onSelect={downloadText}
                            >
                            <IoTextOutline className="mr-auto h-4 w-4" />
                              .txt
                            </DropdownMenuPrimitive.Item>
                            <DropdownMenuPrimitive.Item
                              className={cn(dropdownItemClasses, "hover:bg-[var(--active)]/30 focus:bg-[var(--active)]/30 cursor-pointer")}
                              onSelect={downloadJson}
                            >
                            <TbJson className="mr-auto h-4 w-4" />
                              .json
                            </DropdownMenuPrimitive.Item>
                            <DropdownMenuPrimitive.Item
                              className={cn(dropdownItemClasses, "hover:bg-[var(--active)]/30 focus:bg-[var(--active)]/30 cursor-pointer")}
                              onSelect={downloadImage}
                            >
                            <IoImageOutline className="mr-auto h-4 w-4" />
                              .png
                            </DropdownMenuPrimitive.Item>
                          </DropdownMenuPrimitive.SubContent>
                        </DropdownMenuPrimitive.Portal>
                      </DropdownMenuPrimitive.Sub>
                    </DropdownMenuPrimitive.Content>
                  </DropdownMenuPrimitive.Portal>
                </DropdownMenuPrimitive.Root>
              </>
            )}
            {historyMode && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="Delete All History"
                    variant="ghost"
                    size="sm"
                    className="text-[var(--text)] rounded-md"
                    onClick={handleDeleteAllWithConfirmation}
                  >
                    <FiTrash2 size="18px" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-[var(--active)]/50 text-[var(--text)] border-[var(--text)]">
                  Delete All
                </TooltipContent>
              </Tooltip>
            )}
            {noteSystemMode && (
              <DropdownMenuPrimitive.Root>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuPrimitive.Trigger asChild>
                      <Button
                        aria-label="Note Options"
                        variant="ghost"
                        size="sm"
                        className="text-[var(--text)] rounded-md"
                      >
                        <LuEllipsis size="18px" /> 
                      </Button>
                    </DropdownMenuPrimitive.Trigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-[var(--active)]/50 text-[var(--text)] border-[var(--text)]">
                    Note Options
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuPrimitive.Portal>
                  <DropdownMenuPrimitive.Content
                    className={cn(
                      dropdownContentClasses,
                      "bg-[var(--bg)] text-[var(--text)] border-[var(--text)]/20 shadow-xl"
                    )}
                    sideOffset={5}
                    align="end"
                  >
                    {onAddNewNoteRequest && (
                      <DropdownMenuPrimitive.Item
                        className={cn(
                          dropdownItemClasses, 
                          "gap-2",
                          "hover:bg-[var(--active)]/30 focus:bg-[var(--active)]/30 cursor-pointer"
                        )}
                        onSelect={onAddNewNoteRequest}
                      >
                        <GoPlus className="mr-auto h-4 w-4" />
                        Create Note
                      </DropdownMenuPrimitive.Item>
                    )}
                    {onImportNoteRequest && (
                      <DropdownMenuPrimitive.Item
                        className={cn(
                          dropdownItemClasses,
                          "gap-2",
                          "hover:bg-[var(--active)]/30 focus:bg-[var(--active)]/30 cursor-pointer"
                        )}
                        onSelect={onImportNoteRequest}
                      >
                        <FiUpload className="mr-auto h-4 w-4" />
                        Import Note
                      </DropdownMenuPrimitive.Item>
                    )}
                    {onSelectNotesRequest && (
                      <DropdownMenuPrimitive.Item
                        className={cn(
                          dropdownItemClasses,
                          "gap-2",
                          "hover:bg-[var(--active)]/30 focus:bg-[var(--active)]/30 cursor-pointer"
                        )}
                        onSelect={onSelectNotesRequest}
                      >
                        <IoCheckmarkCircleOutline className="mr-auto h-4 w-4" /> 
                        Select Notes
                      </DropdownMenuPrimitive.Item>
                    )}
                  </DropdownMenuPrimitive.Content>
                </DropdownMenuPrimitive.Portal>
              </DropdownMenuPrimitive.Root>
            )}
          </div>
        </div>

        {showWelcomeModalState && !settingsMode && !historyMode && !noteSystemMode && (
           <WelcomeModal 
             isOpen={showWelcomeModalState} 
             setSettingsMode={setSettingsMode} 
             onClose={handleWelcomeModalClose} 
           />
        )}

        <SettingsSheet
          isOpen={isSheetOpen}
          onOpenChange={handleSheetOpenChange}
          config={config}
          updateConfig={updateConfig}
          setSettingsMode={setSettingsMode}
          setHistoryMode={setHistoryMode}
          setNoteSystemMode={setNoteSystemMode}
        />

        <EditProfileDialog
          isOpen={isEditProfileDialogOpen}
          onOpenChange={setIsEditProfileDialogOpen}
          config={config}
          updateConfig={updateConfig}
        />

        <Changelog
          isOpen={isChangelogOpen}
          onClose={handleChangelogClose}
        />
      </div>
    </TooltipProvider>
  );
};