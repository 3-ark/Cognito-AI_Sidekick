import React, { useEffect,useRef,useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { BsFiletypeMd } from "react-icons/bs";
import {
 FiChevronLeft, FiSave,FiShare, FiTrash2, FiUpload, FiX, 
} from 'react-icons/fi';
import { GoPlus } from "react-icons/go";
import {
 IoCheckmarkCircleOutline,IoFingerPrint, IoImageOutline, IoPerson, IoTextOutline, 
} from "react-icons/io5"; // Added IoCheckmarkCircleOutline
import { LuEllipsis } from "react-icons/lu";
import { TbJson,TbReload } from "react-icons/tb";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Download,Upload } from 'lucide-react';

import ModelSelector from './components/ModelSelector'; // Import the new component
import { exportData, importData } from "./utils/backupUtils";
import { useConfig } from './ConfigContext';
import { DEFAULT_PERSONA_IMAGES } from './constants';
import { SettingsSheet } from './SettingsSheet';

import {
 Avatar, AvatarFallback, AvatarImage, 
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
 Dialog, DialogContent, DialogDescription, DialogFooter,DialogHeader, DialogTitle, 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
 Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, 
} from "@/components/ui/tooltip";
import { cn } from "@/src/background/util";
import {
ChatMode, ChatStatus,type Config, 
} from "@/src/types/config";

function getStatusText(mode: ChatMode, status: ChatStatus, t: (key: string) => string): string {
  if (status === 'idle') return t('online');

  if (mode === 'chat') {
    if (status === 'typing') return t('typing');

    if (status === 'thinking') return t('thinking');
  }

  if (mode === 'web') {
    if (status === 'searching') return t('searchingWeb');

    if (status === 'thinking') return t('processingSERP');
  }

  if (mode === 'page') {
    if (status === 'reading') return t('readingPage');

    if (status === 'thinking') return t('analyzing');
  }

  if (status === 'done') return t('online');

  return t('online');
}

import type { ReactNode } from 'react'; // Added for Typewriter

// --- Word-by-word typewriter animation (copied from Settings.tsx) ---
const TypewriterLinesWordByWord = ({
 lines, delay = 120, className = "", 
}: { lines: ReactNode[], delay?: number, className?: string }) => {
  const words = lines.flatMap((line, idx) =>
    typeof line === "string"
      ? line.split(" ").map((word, i, arr) => word + (i < arr.length - 1 ? " " : "")).concat(idx < lines.length - 1 ? ["\n"] : [])
      : [line, idx < lines.length - 1 ? "\n" : ""],
  );
  const [visibleWords, setVisibleWords] = useState(0); // Renamed for clarity within this component

  useEffect(() => {
    if (visibleWords < words.length) {
      const timer = setTimeout(() => setVisibleWords(visibleWords + 1), delay);

      return () => clearTimeout(timer);
    }
  }, [visibleWords, words.length, delay]);

  return (
    <div
      className={className}
      style={{
        fontFamily: "'Space Mono', monospace",
        whiteSpace: "pre-wrap",
      }}
    >
      {words.slice(0, visibleWords).map((word, idx) =>
        word === "\n" ? <br key={idx} /> : <span key={idx}>{word}</span>,
      )}
      {visibleWords < words.length && <span className="blinking-cursor">|</span>}
    </div>
  );
}

const updatedGuideLines = [
  "1. Click on your avatar (top left) and then the 'API' button to add your API key or URLs.",
  "2. Select your desired model directly from the header in the main chat interface.",
  <>
    3. Check the user guide{" "}
    <a
      className="underline text-blue-600 dark:text-blue-400 hover:text-blue-800"
      href="https://github.com/3-ark/"
      rel="noopener noreferrer"
      target="_blank"
    >
      here
    </a>
  </>,
  "",
  "Note: You can explore other settings later. Click the fingerprint to dismiss this guide. Enjoy!",
];

interface WelcomeModalProps {
  isOpen: boolean;

  // onClose will be handled by the fingerprint click now, which calls a dismiss function
  // setSettingsMode: (mode: boolean) => void; // No longer navigating to settings directly
  onDismiss: () => void;
}

const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onDismiss }) => {
  const { t } = useTranslation();

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) onDismiss(); }}> {/* Call onDismiss if dialog is closed by other means */}
      <DialogContent
        className={cn(
          "[&>button]:hidden", // Keep if relevant for close button styling
          "w-[95%] max-w-sm", // Use a responsive width that doesn't touch edges and has a max width
        )}
        variant="themedPanel" // Keep existing variant if it works
        onInteractOutside={e => e.preventDefault()} // Keep to prevent accidental close
      >
        <DialogHeader className="text-center font-['Bruno_Ace_SC'] p-3 pt-4 header-title-glow">
          <DialogTitle className="text-xl">{t('quickGuide')}</DialogTitle>
        </DialogHeader>
        <DialogDescription asChild>
          <div className="p-4 text-left text-sm"> {/* Changed text-center to text-left */}
            <TypewriterLinesWordByWord
              className="text-(--text) mt-1 mb-3"
              delay={50}
              lines={updatedGuideLines}
            />
            <div className="flex justify-center mt-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={t('gotIt')}
                    className="fingerprint-pulse-btn" // Keep existing class if it provides good styling
                    variant="ghost"
                    onClick={onDismiss} // Call onDismiss when fingerprint is clicked
                  >
                    <IoFingerPrint color="var(--active)" size="3rem" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-(--active)/50 text-(--text) border-(--text)" side="bottom">
                  {t('gotItDismiss')}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </DialogDescription>
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

  const { t } = useTranslation();
  const handleSave = () => {
    updateConfig({ userName: currentUserName, userProfile: currentUserProfile });
    onOpenChange(false);
    toast.success(t("profileUpdated"));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className='w-[95%] max-w-sm'
        variant="themedPanel"
      >
        <DialogHeader className="p-4">
          <DialogTitle className="text-lg font-semibold text-(--text)">{t('editProfile')}</DialogTitle>
          <DialogDescription className="text-sm text-(--text) opacity-80">
            {t('setDisplayName')}
          </DialogDescription>
        </DialogHeader>
        <div className="px-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-(--text) opacity-90" htmlFor="username">
              {t('username')}
            </Label>
            <Input
              className={cn(
                "focus:border-(--active) focus:ring-1 focus:ring-(--active)",
                "hover:border-(--active) hover:brightness-98",
              )}
              id="username"
              value={currentUserName}
              onChange={e => setCurrentUserName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium text-(--text) opacity-90" htmlFor="userprofile">
              {t('userProfile')}
            </Label>
            <Textarea
              className={cn(
                "focus:border-(--active) focus:ring-1 focus:ring-(--active)",
                "hover:border-(--active) hover:brightness-98",
                "overflow-y-auto",
                "rounded-md",
                "border border-(--text)/20 dark:border-0",
                "whitespace-pre-wrap",
                "px-3 py-2",
                "wrap-break-word",
                "bg-(--input-background) placeholder:text-muted-foreground",
              )}
              id="userprofile"
              maxRows={8}
              minRows={5}
              value={currentUserProfile}
              autosize
              onChange={e => setCurrentUserProfile(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <div className="flex justify-end p-4 space-x-2">
            <Button size="persona" type="button" variant="outline-subtle" onClick={() => onOpenChange(false)}>
              <FiX />
              {t('cancel')}
            </Button>
            <Button
              size="persona"
              type="button"
              variant="save"
              onClick={handleSave}
            >
              <FiSave />
              {t('save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const EditableTitle = ({ title, onTitleChange }: { title: string, onTitleChange: (newTitle: string) => void }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentTitle, setCurrentTitle] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCurrentTitle(title);
  }, [title]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    if (currentTitle.trim() === '') {
        setCurrentTitle(title); // revert if empty
    } else if (currentTitle !== title) {
        onTitleChange(currentTitle);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      inputRef.current?.blur();
    }
    if (e.key === 'Escape') {
        setCurrentTitle(title);
        setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        type="text"
        value={currentTitle}
        onChange={(e) => setCurrentTitle(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="text-xs text-center bg-transparent border-0 focus:ring-0 h-auto p-0 m-0 w-full"
        style={{ boxShadow: 'none' }}
      />
    );
  }

  return (
    <p
      className="text-xs text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis text-center w-full cursor-pointer"
      onClick={() => setIsEditing(true)}
    >
      {title}
    </p>
  );
};

interface HeaderProps {
  chatTitle?: string | null;
  onTitleChange: (newTitle: string) => void;
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
  onSelectNotesRequest?: () => void; 

  // New page mode states and setters
  modelSettingsPageMode?: boolean; // Optional as Header doesn't directly use it but passes it
  setModelSettingsPageMode: (mode: boolean) => void;
  apiSettingsPageMode?: boolean;
  setApiSettingsPageMode: (mode: boolean) => void;
  ragSettingsPageMode?: boolean;
  setRagSettingsPageMode: (mode: boolean) => void;
  customizePageMode?: boolean;
  setCustomizePageMode: (mode: boolean) => void;
  webSearchPageMode?: boolean;
  setWebSearchPageMode: (mode: boolean) => void;
  pageSettingsPageMode?: boolean;
  setPageSettingsPageMode: (mode: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({
  chatTitle,
  onTitleChange,
  settingsMode,
  setSettingsMode,
  historyMode,
  setHistoryMode,
  noteSystemMode,
  setNoteSystemMode,

  // Destructure new props
  modelSettingsPageMode, 
  setModelSettingsPageMode,
  apiSettingsPageMode,
  setApiSettingsPageMode,
  ragSettingsPageMode,
  setRagSettingsPageMode,
  customizePageMode,
  setCustomizePageMode,
  webSearchPageMode,
  setWebSearchPageMode,
  pageSettingsPageMode,
  setPageSettingsPageMode,
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
  const { t } = useTranslation();
  const { config, updateConfig } = useConfig();
  const [isEditProfileDialogOpen, setIsEditProfileDialogOpen] = useState(false);
  const currentPersona = config?.persona || 'default';
  const currentPersonaAvatar = config?.personaAvatars?.[currentPersona] || DEFAULT_PERSONA_IMAGES[currentPersona] || DEFAULT_PERSONA_IMAGES.default;

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const handleSheetOpenChange = (open: boolean) => { setIsSheetOpen(open); };

  // State for the welcome guide modal
  const [showWelcomeGuide, setShowWelcomeGuide] = useState(false);

  const handleDismissWelcomeGuide = () => {
    setShowWelcomeGuide(false);
    chrome.storage.local.set({ hasSeenWelcomeGuide: true }, () => {
      console.log('[Cognito] Welcome guide dismissed and flag set.');
    });
  };

  // Determine if any full-page mode is active (including new ones)
  // This needs to be defined *before* the useEffect that uses it.
  const isAnyPageModeActive = settingsMode || historyMode || noteSystemMode || modelSettingsPageMode || apiSettingsPageMode || ragSettingsPageMode || customizePageMode || webSearchPageMode || pageSettingsPageMode;

  // Revised useEffect for showing the guide
  useEffect(() => {
    chrome.storage.local.get(['hasSeenWelcomeGuide'], result => {
      if (!result.hasSeenWelcomeGuide) {
        // If not seen, always show it, regardless of API keys or page modes for the *very first* view.
        // The dismissal is permanent.
        setShowWelcomeGuide(true);
      }
    });
  }, []); // Empty dependency array: check only once on component mount.

  const handleLeftButtonClick = () => {
    if (isAnyPageModeActive) {
      setSettingsMode(false);
      setHistoryMode(false);
      setNoteSystemMode(false);
      setModelSettingsPageMode(false);
      setApiSettingsPageMode(false);
      setRagSettingsPageMode(false);
      setCustomizePageMode(false);
      setWebSearchPageMode(false);
      setPageSettingsPageMode(false);
    } else {
      setIsSheetOpen(true);
    }
  };
  
  let pageTitle = '';

  if (settingsMode) pageTitle = t('speech');
  else if (historyMode) pageTitle = t('chatHistory');
  else if (noteSystemMode) pageTitle = t('noteSystem');
  else if (modelSettingsPageMode) pageTitle = t('modelSettings');
  else if (apiSettingsPageMode) pageTitle = t('apiSettings');
  else if (ragSettingsPageMode) pageTitle = t('ragSettings');
  else if (customizePageMode) pageTitle = t('customize');
  else if (webSearchPageMode) pageTitle = t('searchingWeb');
  else if (pageSettingsPageMode) pageTitle = t('page');

  const leftButtonLabel = isAnyPageModeActive
    ? t('backToChat')
    : config?.userName
      ? t('hiSettings', { userName: config.userName })
      : t('settings');

  const handleDeleteAllWithConfirmation = () => {
    toast.custom(
      ts => (
        <div
          className={cn(
            "bg-(--bg) text-(--text) border border-(--text)/20",
            "p-4 rounded-xl shadow-xl max-w-sm w-full",
            "flex flex-col space-y-3",
          )}
        >
          <h4 className="text-lg font-semibold text-(--text)">{t('confirmDeletion')}</h4>
          <p className="text-sm text-(--text) opacity-90">
            {t('confirmDeletionDesc')}
          </p>
          <div className="flex justify-end space-x-3 pt-2">
            <Button
              className={cn(
                "bg-transparent text-(--text) border-(--text)",
                "hover:bg-(--active)/30 focus:ring-1 focus:ring-(--active)",
                )}
              size="sm"
              variant="outline"
              onClick={() => toast.dismiss(ts.id)}
            >
              {t('cancel')}
            </Button>
            <Button
              className={cn(
                "focus:ring-1 focus:ring-red-400 focus:ring-offset-1 focus:ring-offset-(--bg)",
                )}
              size="sm"
              variant="destructive"
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
                  toast.dismiss(ts.id);
                }
              }}
            >
              {t('deleteAll')}
            </Button>
          </div>
        </div>
        ),
      {
        duration: Infinity,
        position: 'top-center',
      },
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
          "sticky top-0 z-10 p-0",
        )}
      >
        <div className="flex items-center h-auto px-2">
          {/* Left Button Area */}
          <div className={cn("flex justify-start items-center min-h-10", sideContainerWidthClass)}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={leftButtonLabel}
                  className={cn(
                    "text-(--text) rounded-md p-0 h-8 w-8 flex items-center justify-center",
                  )}
                  size={isAnyPageModeActive ? "sm" : undefined} // Use isAnyPageModeActive
                  variant="ghost"
                  onClick={handleLeftButtonClick}
                >
                  {isAnyPageModeActive ? ( // Use isAnyPageModeActive
                    <FiX size="22px" /> // This is the "Back to Chat" button
                  ) : (

                    // This is the button to open SettingsSheet
                    <Avatar className="h-8 w-8 border border-(--active)">
                      <AvatarImage alt={currentPersona} src={currentPersonaAvatar} />
                      <AvatarFallback>{currentPersona.substring(0, 1).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-(--active)/50 text-(--text) border-(--text)" side="bottom">
                {leftButtonLabel}
              </TooltipContent>
            </Tooltip>
            {!isAnyPageModeActive && ( // Show Persona name and status only if not in a page mode
              <div className="flex flex-col justify-center ml-1">
                <span className="text-[0.8125rem] font-medium text-(--text) leading-tight">
                  {currentPersona === 'default' ? 'Jet' : currentPersona}
                </span>
                <span className="text-[0.625rem] text-muted-foreground font-semibold leading-tight flex items-center pt-0.5">
                  {chatStatus === 'idle' && (
                    <span className="h-1.5 w-1.5 bg-green-600 rounded-full mr-1"></span>
                  )}
                  {getStatusText(chatMode, chatStatus, t)}
                </span>
              </div>
            )}
          </div>

          {/* Middle Content Area - Title Display Logic */}
          <div className="grow flex flex-col justify-center items-center overflow-hidden px-1 py-1">
            {!isAnyPageModeActive ? (
              <>
                <div className="w-full max-w-xs">
                  <ModelSelector config={config} updateConfig={updateConfig} />
                </div>
                {chatTitle && (
                  <EditableTitle onTitleChange={onTitleChange} title={chatTitle} />
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="relative top-0 text-lg font-['Bruno_Ace_SC'] header-title-glow">
                  {pageTitle} {/* Display dynamic page title */}
                </p>
              </div>
            )}
          </div>

          {/* Right Button Area - Conditional rendering based on page mode */}
          <div className={cn("flex justify-end items-center min-h-10", rightSideContainerWidthClass)}>
            {!isAnyPageModeActive && ( // Show these only if not in a page mode
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label="Reset Chat"
                      className="text-(--text) hover:bg-black/10 dark:hover:bg-white/10 rounded-md group"
                      size="sm"
                      variant="ghost"
                      onClick={reset}
                    >
                      <TbReload 
                        className="transition-transform duration-300 rotate-0 group-hover:rotate-180 text-(--text)" 
                        size="18px" 
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-(--active)/50 text-(--text) border-(--text)" side="bottom">
                    {t('resetChat')}
                  </TooltipContent>
                </Tooltip>

                {/* Share Button with Radix Dropdown Menu */}
                <DropdownMenuPrimitive.Root>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuPrimitive.Trigger asChild>
                        <Button
                          aria-label={t('shareOptions')}
                          className="text-(--text) rounded-md"
                          size="sm"
                          variant="ghost"
                        >
                          <FiShare size="18px" />
                        </Button>
                      </DropdownMenuPrimitive.Trigger>
                    </TooltipTrigger>
                    <TooltipContent className="bg-(--active)/50 text-(--text) border-(--text)" side="bottom">
                      {t('shareOptions')}
                    </TooltipContent>
                  </Tooltip>
                  <DropdownMenuPrimitive.Portal>
                    <DropdownMenuPrimitive.Content
                      align="start"
                      className={cn(
                        dropdownContentClasses,
                        "bg-(--bg) text-(--text) border-(--text)/20 shadow-xl",
                      )}
                      sideOffset={5}
                    >
                      <DropdownMenuPrimitive.Item
                        className={cn(
                          dropdownItemClasses,
                          "gap-2",
                          "hover:bg-(--active)/30 focus:bg-(--active)/30 cursor-pointer",
                        )}
                        onSelect={() => setIsEditProfileDialogOpen(true)}
                      >
                        <IoPerson  className="mr-2 h-4 w-4" />
                        {t('yourProfile')}
                      </DropdownMenuPrimitive.Item>
                      <DropdownMenuPrimitive.Separator
                        className={cn(
                          dropdownSeparatorClasses,
                          "bg-(--text)/10",
                        )}
                      />
                      <DropdownMenuPrimitive.Sub>
                        <DropdownMenuPrimitive.SubTrigger
                          className={cn(
                            dropdownSubTriggerClasses,
                            "gap-2",
                            "hover:bg-(--active)/30 focus:bg-(--active)/30 cursor-pointer",
                          )}
                        >
                        <FiChevronLeft className="mr-2 h-4 w-4" />
                          {t('exportChat')}
                        </DropdownMenuPrimitive.SubTrigger>
                        <DropdownMenuPrimitive.Portal>
                          <DropdownMenuPrimitive.SubContent
                            alignOffset={-5}
                            className={cn(
                              dropdownContentClasses,
                              "bg-(--bg) text-(--text) border-(--text)/20 shadow-lg",
                            )}
                            sideOffset={2}
                          >
                            <DropdownMenuPrimitive.Item
                              className={cn(dropdownItemClasses, "hover:bg-(--active)/30 focus:bg-(--active)/30 cursor-pointer")}
                              onSelect={downloadMarkdown}
                            >
                             <BsFiletypeMd className="mr-2 h-4 w-4" />
                              .md
                            </DropdownMenuPrimitive.Item>
                            <DropdownMenuPrimitive.Item
                              className={cn(dropdownItemClasses, "hover:bg-(--active)/30 focus:bg-(--active)/30 cursor-pointer")}
                              onSelect={downloadText}
                            >
                             <IoTextOutline className="mr-2 h-4 w-4" />
                              .txt
                            </DropdownMenuPrimitive.Item>
                            <DropdownMenuPrimitive.Item
                              className={cn(dropdownItemClasses, "hover:bg-(--active)/30 focus:bg-(--active)/30 cursor-pointer")}
                              onSelect={downloadJson}
                            >
                             <TbJson className="mr-2 h-4 w-4" />
                              .json
                            </DropdownMenuPrimitive.Item>
                            <DropdownMenuPrimitive.Item
                              className={cn(dropdownItemClasses, "hover:bg-(--active)/30 focus:bg-(--active)/30 cursor-pointer")}
                              onSelect={downloadImage}
                            >
                             <IoImageOutline className="mr-2 h-4 w-4" />
                              .png
                            </DropdownMenuPrimitive.Item>
                          </DropdownMenuPrimitive.SubContent>
                        </DropdownMenuPrimitive.Portal>
                      </DropdownMenuPrimitive.Sub>
                      <DropdownMenuPrimitive.Separator
                        className={cn(
                          dropdownSeparatorClasses,
                          "bg-(--text)/10",
                        )}
                      />
                      <DropdownMenuPrimitive.Sub>
                        <DropdownMenuPrimitive.SubTrigger
                          className={cn(
                            dropdownSubTriggerClasses,
                            "gap-2",
                            "hover:bg-(--active)/30 focus:bg-(--active)/30 cursor-pointer",
                          )}
                        >
                        <FiChevronLeft className="mr-2 h-4 w-4" />
                          Backup
                        </DropdownMenuPrimitive.SubTrigger>
                        <DropdownMenuPrimitive.Portal>
                          <DropdownMenuPrimitive.SubContent
                            alignOffset={-5}
                            className={cn(
                              dropdownContentClasses,
                              "bg-(--bg) text-(--text) border-(--text)/20 shadow-lg",
                            )}
                            sideOffset={2}
                          >
                            <DropdownMenuPrimitive.Item
                              className={cn(dropdownItemClasses, "hover:bg-(--active)/30 focus:bg-(--active)/30 cursor-pointer")}
                              onSelect={exportData}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Export Data
                            </DropdownMenuPrimitive.Item>
                            <DropdownMenuPrimitive.Item
                              className={cn(dropdownItemClasses, "hover:bg-(--active)/30 focus:bg-(--active)/30 cursor-pointer")}
                              onSelect={importData}
                            >
                              <Upload className="mr-2 h-4 w-4" />
                              Import Data
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
                    aria-label={t("deleteAllHistory")}
                    className="text-(--text) rounded-md"
                    size="sm"
                    variant="ghost"
                    onClick={handleDeleteAllWithConfirmation}
                  >
                    <FiTrash2 size="18px" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-(--active)/50 text-(--text) border-(--text)" side="bottom">
                  {t('deleteAll')}
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
                        className="text-(--text) rounded-md"
                        size="sm"
                        variant="ghost"
                      >
                        <LuEllipsis size="18px" /> 
                      </Button>
                    </DropdownMenuPrimitive.Trigger>
                  </TooltipTrigger>
                  <TooltipContent className="bg-(--active)/50 text-(--text) border-(--text)" side="bottom">
                    {t('noteOptions')}
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuPrimitive.Portal>
                  <DropdownMenuPrimitive.Content
                    align="start"
                    className={cn(
                      dropdownContentClasses,
                      "bg-(--bg) text-(--text) border-(--text)/20 shadow-xl",
                    )}
                    sideOffset={5}
                  >
                    {onAddNewNoteRequest && (
                      <DropdownMenuPrimitive.Item
                        className={cn(
                          dropdownItemClasses, 
                          "gap-2",
                          "hover:bg-(--active)/30 focus:bg-(--active)/30 cursor-pointer",
                        )}
                        onSelect={onAddNewNoteRequest}
                      >
                        <GoPlus className="mr-2 h-4 w-4" />
                        {t('createNote')}
                      </DropdownMenuPrimitive.Item>
                    )}
                    {onImportNoteRequest && (
                      <DropdownMenuPrimitive.Item
                        className={cn(
                          dropdownItemClasses,
                          "gap-2",
                          "hover:bg-(--active)/30 focus:bg-(--active)/30 cursor-pointer",
                        )}
                        onSelect={onImportNoteRequest}
                      >
                        <FiUpload className="mr-2 h-4 w-4" />
                        {t('importNote')}
                      </DropdownMenuPrimitive.Item>
                    )}
                    {onSelectNotesRequest && (
                      <DropdownMenuPrimitive.Item
                        className={cn(
                          dropdownItemClasses,
                          "gap-2",
                          "hover:bg-(--active)/30 focus:bg-(--active)/30 cursor-pointer",
                        )}
                        onSelect={onSelectNotesRequest}
                      >
                        <IoCheckmarkCircleOutline className="mr-2 h-4 w-4" /> 
                        {t('selectNotes')}
                      </DropdownMenuPrimitive.Item>
                    )}
                  </DropdownMenuPrimitive.Content>
                </DropdownMenuPrimitive.Portal>
              </DropdownMenuPrimitive.Root>
            )}
          </div>
        </div>

        {/* WelcomeModal is now controlled by showWelcomeGuide state and uses onDismiss */}
        {showWelcomeGuide && !isAnyPageModeActive && (
          <WelcomeModal isOpen={showWelcomeGuide} onDismiss={handleDismissWelcomeGuide} />
        )}

        <SettingsSheet
          config={config}
          isOpen={isSheetOpen}
          setApiSettingsPageMode={setApiSettingsPageMode}
          setCustomizePageMode={setCustomizePageMode}
          setHistoryMode={setHistoryMode}
          setRagSettingsPageMode={setRagSettingsPageMode}
          setSettingsMode={setSettingsMode}
          setWebSearchPageMode={setWebSearchPageMode}
          setPageSettingsPageMode={setPageSettingsPageMode}
          updateConfig={updateConfig}
          onOpenChange={handleSheetOpenChange}
          setNoteSystemMode={setNoteSystemMode}
          // Pass new page mode setters to SettingsSheet
          setModelSettingsPageMode={setModelSettingsPageMode}
        />

        <EditProfileDialog
          config={config}
          isOpen={isEditProfileDialogOpen}
          updateConfig={updateConfig}
          onOpenChange={setIsEditProfileDialogOpen}
        />
      </div>
    </TooltipProvider>
  );
};