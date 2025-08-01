import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
import { Textarea } from '@/components/ui/textarea';


function getStatusText(t: (key: string) => string, mode: ChatMode, status: ChatStatus): string {
  if (status === 'idle') return t('online.message');
  if (mode === 'chat') {
    if (status === 'typing') return t('typing.message');
    if (status === 'thinking') return t('thinking.message');
  }
  if (mode === 'web') {
    if (status === 'searching') return t('searchingWeb.message');
    if (status === 'thinking') return t('processingSERP.message');
  }
  if (mode === 'page') {
    if (status === 'reading') return t('readingPage.message');
    if (status === 'thinking') return t('analyzing.message');
  }
  if (status === 'done') return t('online.message');
  return t('online.message');
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

import { Trans } from 'react-i18next';
// --- Guide content with link ---
const GuideLines = ({ t }: { t: (key: string, options?: any) => string }) => [
  t('guideStep1.message'),
  t('guideStep2.message'),
  t('guideStep3.message'),
  <Trans
    i18nKey="guideStep4.message"
    t={t}
    components={[
      <a
        href="https://github.com/3-ark/Cognito-AI_Sidekick/blob/main/docs/USER_GUIDE.md"
        target="_blank"
        rel="noopener noreferrer"
        className="underline text-blue-600 dark:text-blue-400 hover:text-blue-800"
      />,
    ]}
  />,
  "",
  t('guideHaveFun.message'),
];

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void; // Changed to simple onClose
  setSettingsMode: (mode: boolean) => void;
}

const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose, setSettingsMode }) => {
  const { t } = useTranslation();
  const guideLines = GuideLines({ t });
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
          <DialogTitle className="text-lg">{t('quickGuide.message')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('guideIntro.message')}
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
            aria-label={t('gotIt.message')}
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
  const { t } = useTranslation();
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
    toast.success(t('profileUpdated.message'));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        variant="themedPanel"
        className="max-w-xs"
      >
        <DialogHeader className="px-6 py-2">
          <DialogTitle className="text-lg font-semibold text-[var(--text)]">{t('editProfile.message')}</DialogTitle>
          <DialogDescription className="text-sm text-[var(--text)] opacity-80">
            {t('editProfileDesc.message')}
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username" className="text-sm font-medium text-[var(--text)] opacity-90">
              {t('username.message')}
            </Label>
            <Input
              id="username"
              value={currentUserName}
              onChange={(e) => setCurrentUserName(e.target.value)}
              className={cn(
                "focus:border-[var(--active)] focus:ring-1 focus:ring-[var(--active)]",
                "hover:border-[var(--active)] hover:brightness-98",
                "break-words whitespace-pre-wrap",
                "rounded-md border border-[var(--text)]/20 bg-[var(--input-background)]",
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="userprofile" className="text-sm font-medium text-[var(--text)] opacity-90">
              {t('userProfile.message')}
            </Label>
            <Textarea
              id="userprofile"
              value={currentUserProfile}
              minRows={5}
              maxRows={8}
              autosize
              onChange={(e) => setCurrentUserProfile(e.target.value)}              
              className={cn(
                "focus:border-[var(--active)] focus:ring-1 focus:ring-[var(--active)]",
                "hover:border-[var(--active)] hover:brightness-98",
                "border-[var(--text)]/20",
                "bg-[var(--input-background)]",
                "rounded-md",
              )}
            />
          </div>
        </div>
        <DialogFooter className="flex flex-row justify-end space-x-2 px-6 mb-2 py-2">
          <Button
            variant="outline-subtle"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {t('cancel.message')}
          </Button>
          <Button
            variant="outline-subtle"
            className="bg-[var(--active)] text-[var(--text)]"
            size="sm"
            onClick={handleSave}
          >
            {t('save.message')}
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
  const { t } = useTranslation();
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
    ? t('backToChat.message')
    : config?.userName
      ? t('hiSettings.message', { userName: config.userName })
      : t('settings.message');

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
          <h4 className="text-lg font-semibold text-[var(--text)]">{t('confirmDeletion.message')}</h4>
          <p className="text-sm text-[var(--text)] opacity-90">
            {t('confirmDeletionDesc.message')}
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
              {t('cancel.message')}
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
              {t('deleteAll.message')}
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
                  {getStatusText(t, chatMode, chatStatus)}
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
                  {t('settings.message')}
                </p>
              </div>
            )}
            {historyMode && (
              <div className="flex items-center justify-center">
                <p className="font-['Bruno_Ace_SC'] text-lg header-title-glow">
                  {t('chatHistory.message')}
                </p>
              </div>
            )}
            {noteSystemMode && (
              <div className="flex items-center justify-center">
                <p className="font-['Bruno_Ace_SC'] text-lg header-title-glow">
                  {t('noteSystem.message')}
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
                    {t('resetChat.message')}
                  </TooltipContent>
                </Tooltip>

                {/* Share Button with Radix Dropdown Menu */}
                <DropdownMenuPrimitive.Root>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuPrimitive.Trigger asChild>
                        <Button
                          aria-label={t('shareOptions.message')}
                          variant="ghost"
                          size="sm"
                          className="text-[var(--text)] rounded-md"
                        >
                          <FiShare size="18px" />
                        </Button>
                      </DropdownMenuPrimitive.Trigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="bg-[var(--active)]/50 text-[var(--text)] border-[var(--text)]">
                      {t('shareOptions.message')}
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
                        <IoPerson className="h-4 w-4" />
                        <span>{t('yourProfile.message')}</span>
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
                        <VscRocket className="h-4 w-4" />
                        <span>{t('whatsNew.message')}</span>
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
                          <FiChevronLeft className="h-4 w-4" />
                          <span>{t('exportChat.message')}</span>
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
                              className={cn(dropdownItemClasses, "gap-2", "hover:bg-[var(--active)]/30 focus:bg-[var(--active)]/30 cursor-pointer")}
                              onSelect={downloadMarkdown}
                            >
                              <BsFiletypeMd className="h-4 w-4" />
                              <span>.md</span>
                            </DropdownMenuPrimitive.Item>
                            <DropdownMenuPrimitive.Item
                              className={cn(dropdownItemClasses, "gap-2", "hover:bg-[var(--active)]/30 focus:bg-[var(--active)]/30 cursor-pointer")}
                              onSelect={downloadText}
                            >
                              <IoTextOutline className="h-4 w-4" />
                              <span>.txt</span>
                            </DropdownMenuPrimitive.Item>
                            <DropdownMenuPrimitive.Item
                              className={cn(dropdownItemClasses, "gap-2", "hover:bg-[var(--active)]/30 focus:bg-[var(--active)]/30 cursor-pointer")}
                              onSelect={downloadJson}
                            >
                              <TbJson className="h-4 w-4" />
                              <span>.json</span>
                            </DropdownMenuPrimitive.Item>
                            <DropdownMenuPrimitive.Item
                              className={cn(dropdownItemClasses, "gap-2", "hover:bg-[var(--active)]/30 focus:bg-[var(--active)]/30 cursor-pointer")}
                              onSelect={downloadImage}
                            >
                              <IoImageOutline className="h-4 w-4" />
                              <span>.png</span>
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
                    aria-label={t('deleteAllHistory.message')}
                    variant="ghost"
                    size="sm"
                    className="text-[var(--text)] rounded-md"
                    onClick={handleDeleteAllWithConfirmation}
                  >
                    <FiTrash2 size="18px" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-[var(--active)]/50 text-[var(--text)] border-[var(--text)]">
                  {t('deleteAll.message')}
                </TooltipContent>
              </Tooltip>
            )}
            {noteSystemMode && (
              <DropdownMenuPrimitive.Root>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuPrimitive.Trigger asChild>
                      <Button
                        aria-label={t('noteOptions.message')}
                        variant="ghost"
                        size="sm"
                        className="text-[var(--text)] rounded-md"
                      >
                        <LuEllipsis size="18px" />
                      </Button>
                    </DropdownMenuPrimitive.Trigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-[var(--active)]/50 text-[var(--text)] border-[var(--text)]">
                    {t('noteOptions.message')}
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
                        <GoPlus className="h-4 w-4" />
                        <span>{t('createNote.message')}</span>
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
                        <FiUpload className="h-4 w-4" />
                        <span>{t('importNote.message')}</span>
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
                        <IoCheckmarkCircleOutline className="h-4 w-4" />
                        <span>{t('selectNotes.message')}</span>
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