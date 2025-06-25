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

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: (open: boolean) => void;
  setSettingsMode: (mode: boolean) => void;
}
const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose, setSettingsMode}) => (
  <Dialog open={isOpen} onOpenChange={onClose}>
    <DialogContent
      variant="themedPanel"
      className={cn( 
          "[&>button]:hidden"
      )}
      style={{ 
        width: '13.75rem', 
        height: '6.875rem',
        borderRadius: '1.875rem',
        boxShadow: '0.9375rem 0.9375rem 1.875rem rgb(25, 25, 25), 0 0 1.875rem rgb(60, 60, 60)'
      }}
      onInteractOutside={(e) => e.preventDefault()}
    >
      <DialogHeader className="text-center font-['Bruno_Ace_SC'] p-2 header-title-glow">
        <DialogTitle className="text-base">Welcome</DialogTitle>
      </DialogHeader>
      <DialogDescription asChild>
        <div className="p-4 text-center">
          <p className="text-[var(--text)] header-title-glow font-['Bruno_Ace_SC'] mb-2 -mt-7">
            The game is afoot!<br />
          </p>
          <div className="flex justify-center">

                <Button
                  variant="ghost"
                  className="fingerprint-pulse-btn"
                  onClick={() => setSettingsMode(true)}
                  aria-label="Connect to your models"
                >
                  <IoFingerPrint size="3rem" color="var(--active)" />
                </Button>
          </div>
        </div>
      </DialogDescription>
    </DialogContent>
  </Dialog> 
);

const Badge = ({ children }: { children: React.ReactNode }) => (
  <div
    className={cn(
      "inline-block whitespace-nowrap overflow-hidden text-ellipsis w-full max-w-xs",
      "bg-transparent text-[var(--text)]",
      "rounded-md py-0.5",
      "font-['poppins',_sans-serif] text-md text-center font-medium",
    )}
  >
    {children}
  </div>
);

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
  const [isEditProfileDialogOpen, setIsEditProfileDialogOpen] = useState(false);
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
          "border border-[var(--active)]/50",
          "sticky top-0 z-10 p-0",
        )}
      >
        <div className="flex items-center h-auto py-0.5 px-2">
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
          <div className="flex-grow flex justify-center items-center overflow-hidden px-1">
            {visibleTitle && (
              <p className="text-sm font-semibold text-[var(--text)] whitespace-nowrap overflow-hidden text-ellipsis text-center">
                {chatTitle}
              </p>
            )}
            {!visibleTitle && !historyMode && !settingsMode && !noteSystemMode && (
              <Badge>
                  {config?.selectedModel || 'No Model Selected'}
              </Badge>
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
                        {/* Placeholder for an appropriate icon, e.g., a checkmark or list icon */}
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

        {(!config?.models || config.models.length === 0) && !settingsMode && !historyMode && !noteSystemMode && (
           <WelcomeModal isOpen={true} setSettingsMode={setSettingsMode} onClose={() => {}} />
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
      </div>
    </TooltipProvider>
  );
};