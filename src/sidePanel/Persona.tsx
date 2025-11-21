import React, {
 ChangeEvent,useEffect, useRef, useState, 
} from 'react';
import {
 FiEdit2, FiPlus, FiSave, FiTrash2, FiX, 
} from 'react-icons/fi'; // Added for new icons

import { useConfig } from './ConfigContext';
import { DEFAULT_PERSONA_IMAGES } from './constants';

import {
 Avatar, AvatarFallback, AvatarImage, 
} from "@/components/ui/avatar"; // Added for select items
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
 Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/src/background/util";

// Props for the main Persona component when used directly in SettingsSheet
export interface PersonaProps {

  // No specific props needed from SettingsSheet for now, uses useConfig
}

const PersonaModal = ({
  isOpen,
  onOpenChange,
  personaPrompt,
  currentPersonaName, // Name of persona being edited, or undefined if new/saveAs from blank
  personas,
  updateConfig,
  onModalClose,
  mode,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  personaPrompt: string;
  currentPersonaName?: string; // Provided when editing an existing persona
  personas: Record<string, string>;
  updateConfig: (config: any) => void;
  onModalClose: () => void;
  mode: 'create' | 'edit';
}) => {
  const { config } = useConfig();
  const [name, setName] = useState('');

  // State for the prompt *within the modal*
  const [modalPersonaPrompt, setModalPersonaPrompt] = useState(personaPrompt);
  const [isEditingModalPrompt, setIsEditingModalPrompt] = useState(false); // To enable Save button for prompt changes
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setModalPersonaPrompt(personaPrompt);
      setIsEditingModalPrompt(false);
      setAvatarFile(null);

      if (mode === 'edit' && currentPersonaName) {
        setName(currentPersonaName);
        setAvatarPreview(config.personaAvatars?.[currentPersonaName] || DEFAULT_PERSONA_IMAGES[currentPersonaName] || DEFAULT_PERSONA_IMAGES.default);
      } else {
        setName('');
        setAvatarPreview(null);
      }
    }
  }, [isOpen, personaPrompt, currentPersonaName, mode, config.personaAvatars]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;
    
    setAvatarFile(file);
    const reader = new FileReader();

    reader.onload = event => {
      setAvatarPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    const finalName = (mode === 'edit' && currentPersonaName) ? currentPersonaName : name.trim();

    if (!finalName) return;

    const newPersonas = { ...personas, [finalName]: modalPersonaPrompt };
    const newConfigUpdate: any = {
      personas: newPersonas,
      persona: finalName, // Set the newly created/edited/saved-as persona as active
    };

    const currentAvatars = config.personaAvatars || {};
    const newAvatar = avatarPreview; // Could be from file, or pre-filled from original

    if (avatarFile) { // New avatar explicitly selected
      const reader = new FileReader();

      reader.onload = event => {
        newConfigUpdate.personaAvatars = { ...currentAvatars, [finalName]: event.target?.result as string };
        updateConfig(newConfigUpdate);
      };
      reader.readAsDataURL(avatarFile);
    } else if (newAvatar) { // Avatar preview exists (either pre-filled or default)
      newConfigUpdate.personaAvatars = { ...currentAvatars, [finalName]: newAvatar };
      updateConfig(newConfigUpdate);
    } else { // No avatar
      // If an old avatar existed for this name and we are not providing a new one, we might want to remove it.
      // This is more relevant if editing and removing an avatar. For now, just update personas.
      const tempAvatars = { ...currentAvatars };

      if (!newAvatar && tempAvatars[finalName]) { // if no new avatar but one existed
          delete tempAvatars[finalName]; // remove old avatar if not re-selected
          newConfigUpdate.personaAvatars = tempAvatars;
      }

      updateConfig(newConfigUpdate);
    }

    onModalClose();
  };
  
  const modalTitle = mode === 'edit' ? "Edit Persona" : "Create New Persona";
  const effectiveName = (mode === 'edit' && !isEditingModalPrompt) ? currentPersonaName : name;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("bg-[var(--bg)] text-[var(--text)]")} // Adjusted width
        onCloseAutoFocus={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{modalTitle}</DialogTitle>
        </DialogHeader>
        <DialogDescription className="text-[var(--text)]/80 pt-2">
        "{effectiveName || 'New Persona'}" will be created with the provided instructions and avatar.
        </DialogDescription>
        <div className="grid gap-4 py-4">
          {/* Avatar and Name Input */}
          <div className="flex items-start gap-4">
            <div className="flex flex-col items-center gap-2">
              <div className="w-20 h-20 rounded-full overflow-hidden bg-[var(--input-background)] border border-[var(--text)]/20">
                {avatarPreview ? (
                  <img alt="Preview" className="w-full h-full object-cover" src={avatarPreview} />
                ) : (
                  <img alt="Default" className="w-full h-full object-cover" src={DEFAULT_PERSONA_IMAGES.default} />
                )}
              </div>
              <Button size="persona" variant="outline-subtle" onClick={() => fileInputRef.current?.click()}>
                {avatarPreview ? 'Change' : 'Select'} Avatar
              </Button>
              <input ref={fileInputRef} accept="image/*" className="hidden" type="file" onChange={handleFileChange} />
            </div>
            <div className="flex-1 space-y-2">
              <Label className="text-sm font-medium text-[var(--text)] opacity-90" htmlFor="persona-name-modal">
                Persona Name
              </Label>
              <Input
                className={cn(
                  "bg-[var(--input-background)] rounded-xl border-[var(--text)]/20 text-[var(--text)] focus:border-[var(--active)]",
                )}
                id="persona-name-modal"
                placeholder="Enter persona name"
                value={name} // 'name' state is for the input field
                onChange={e => setName(e.target.value)}
              />
            </div>
          </div>
          {/* Persona Instructions Textarea */}
          <div>
            <Label className="text-sm font-medium text-[var(--text)] opacity-90 mb-1 block" htmlFor="persona-prompt-modal">
              Persona Instructions
            </Label>
            <Textarea
              className={cn(
                "min-h-[80px] px-3 py-2 text-sm ring-offset-[var(--bg)] placeholder:text-[var(--muted-foreground)] rounded-xl",
                "text-[var(--text)]",
                "overflow-y-auto",
                "break-words whitespace-pre-wrap",
              )}
              id="persona-prompt-modal"
              maxRows={8}
              minRows={3}
              placeholder="Define the persona's characteristics and instructions here..."
              value={modalPersonaPrompt}
              autosize
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                setModalPersonaPrompt(e.target.value);
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <div className="flex justify-end space-x-2">
            <Button size="persona" type="button" variant="outline-subtle" onClick={onModalClose}>
              <FiX />
              Cancel
            </Button>
            <Button 
              disabled={ mode !== 'edit' && !name.trim() } // For create, name must be present. For edit, can save prompt change without name change. 
              size="persona"
              type="button" 
              variant="save"
              onClick={handleSave}
            >
              <FiSave />
              {mode === 'edit' ? 'Save' : 'Create'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const DeleteModal = ({
  isOpen, onOpenChange, persona, personas, updateConfig, onModalClose,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  persona: string;
  personas: Record<string, string>;
  updateConfig: (config: any) => void;
  onModalClose: () => void;
}) => {
  const { config } = useConfig(); // Access config to update personaAvatars

  const handleDelete = () => {
    const newPersonas = { ...personas };

    delete newPersonas[persona];

    const newPersonaAvatars = { ...(config.personaAvatars || {}) };

    if (newPersonaAvatars[persona]) {
      delete newPersonaAvatars[persona];
    }

    const remainingPersonas = Object.keys(newPersonas);
    const nextActivePersona = remainingPersonas.length > 0 ? remainingPersonas[0] : (config.personas?.Ein ? 'Ein' : 'default');

    updateConfig({
      personas: newPersonas,
      personaAvatars: newPersonaAvatars,
      persona: nextActivePersona,
    });
    onModalClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-[var(--bg)] border border-[var(--text)]/20 text-[var(--text)]">
        <DialogHeader>
          <DialogTitle>Delete "{persona}"</DialogTitle>
          <DialogDescription className="text-[var(--text)]/80 pt-2">
            Are you sure you want to delete this persona? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-end pt-4">
           <Button size="sm" type="button" variant="outline-subtle" onClick={onModalClose}>Cancel</Button>
          <Button size="sm" type="button" variant="destructive-outline" onClick={handleDelete}>Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Main component for direct integration in SettingsSheet.tsx
export const Persona: React.FC<PersonaProps> = () => {
  const { config, updateConfig } = useConfig();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');

  // Store the prompt of the currently selected persona to pass to the modal for editing
  const [currentPromptForModal, setCurrentPromptForModal] = useState(''); 
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const personas = config?.personas || { Ein: "You are Ein, a helpful AI assistant." };
  const currentPersonaName = config?.persona || (Object.keys(personas)[0] || 'Ein'); // Default to first persona or 'Ein'

  useEffect(() => {
    // Update the prompt for the modal whenever the current persona or its prompt changes
    setCurrentPromptForModal(personas[currentPersonaName] || '');
  }, [currentPersonaName, personas]);

  const handlePersonaSelectChange = (newPersonaName: string) => {
    updateConfig({ persona: newPersonaName });
  };
  
  const handleOpenModal = (
    mode: 'create' | 'edit',
    personaNameToEdit?: string, // This is the original name for 'edit'
  ) => {
    setModalMode(mode);

    if (mode === 'edit' && personaNameToEdit) {
      setCurrentPromptForModal(personas[personaNameToEdit] || '');
    } else { // 'create'
      setCurrentPromptForModal(''); // Blank prompt for new persona
    }

    setIsModalOpen(true);
  };
  
  const iconButtonClass = "p-1.5 h-7 text-xs"; // Adjusted for icon buttons

  return (
      <div className="flex items-center rounded-xl justify-between gap-4">
        {/* Persona Select Dropdown */}
        <div className="flex-grow text-sm font-medium text-[var(--text)] opacity-90 whitespace-nowrap">
          <Select
              value={currentPersonaName}
              onValueChange={handlePersonaSelectChange}
          >
              <SelectTrigger
              className="w-full data-[placeholder]:text-muted-foreground bg-[var(--input-background)] border-[var(--text)]/20 hover:border-[var(--active)] h-8 text-sm"
              variant="settings"
              >
              <div className="flex items-center">
                  <Avatar className="mr-2 h-5 w-5">
                      <AvatarImage alt={currentPersonaName} src={config?.personaAvatars?.[currentPersonaName] || DEFAULT_PERSONA_IMAGES[currentPersonaName] || DEFAULT_PERSONA_IMAGES.default} />
                      <AvatarFallback>{currentPersonaName.substring(0,1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="truncate">{currentPersonaName}</span>
              </div>
              </SelectTrigger>
              <SelectContent 
              className="bg-[var(--popover)] border-[var(--text)]/20 text-[var(--text)]"
              variant="settingsPanel"
              >
              {Object.keys(personas).map(p => (
                  <SelectItem
                  key={p}
className="hover:bg-[var(--active)]/20 focus:bg-[var(--active)]/30 text-sm"
                  focusVariant="activeTheme"
                  value={p}
                  > 
                  <Avatar className="mr-2 h-5 w-5 inline-block">
                      <AvatarImage alt={p} src={config?.personaAvatars?.[p] || DEFAULT_PERSONA_IMAGES[p] || DEFAULT_PERSONA_IMAGES.default} />
                      <AvatarFallback>{p.substring(0,1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  {p}
                  </SelectItem>
              ))}
              </SelectContent>
          </Select>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center flex-1 space-x-2 justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                  className={cn(iconButtonClass, "text-[var(--text)]/80 hover:text-[var(--active)] hover:border-[var(--active)]/50")}
                  size="sm"
                  variant="ghost"
                  onClick={() => handleOpenModal('edit', currentPersonaName)}
              >
                  <FiEdit2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="bg-[var(--active)]/50 text-[var(--text)] border-[var(--text)]" side="bottom">
              <p>Edit Persona</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
            <Button
                className={cn(iconButtonClass, "text-[var(--text)]/80 hover:text-[var(--active)] hover:border-[var(--active)]/50")}
                size="sm"
                variant="ghost"
                onClick={() => handleOpenModal('create')}
            >
                <FiPlus />
            </Button>
            </TooltipTrigger>
            <TooltipContent className="bg-[var(--active)]/50 text-[var(--text)] border-[var(--text)]" side="bottom">
              <p>New Persona</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
            <Button
                className={cn(iconButtonClass, "text-[var(--error)] hover:text-[var(--error)]/80 hover:border-[var(--error)]/50")}
                disabled={(currentPersonaName === 'Ein' && Object.keys(personas).length <= 1) || Object.keys(personas).length === 0}
                size="sm"
                variant="ghost"
                onClick={() => setIsDeleteModalOpen(true)}
            >
                <FiTrash2 />
            </Button>
            </TooltipTrigger>
            <TooltipContent className="bg-[var(--active)]/50 text-[var(--text)] border-[var(--text)]" side="bottom">
              <p>Delete Persona</p>
            </TooltipContent>
          </Tooltip>
      </div>
      
      <PersonaModal
        currentPersonaName={ (modalMode === 'edit') ? currentPersonaName : undefined }
        isOpen={isModalOpen}
        mode={modalMode}
        personaPrompt={currentPromptForModal}
        personas={personas}
        updateConfig={updateConfig}
        onModalClose={() => setIsModalOpen(false)}
        onOpenChange={setIsModalOpen}
      />
      <DeleteModal
        isOpen={isDeleteModalOpen}
        persona={currentPersonaName}
        personas={personas}
        updateConfig={updateConfig}
        onModalClose={() => setIsDeleteModalOpen(false)}
        onOpenChange={setIsDeleteModalOpen}
      />
    </div>
  );
};
