import React, { useEffect, useRef, useState, ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfig } from './ConfigContext';
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_PERSONA_IMAGES } from './constants';
import { FiSave, FiXCircle } from 'react-icons/fi'; // Added new icons

interface PersonaEditPopoverProps {
  trigger: React.ReactNode;
  personaName?: string; // For editing existing persona
  onSave: (name: string, prompt: string, avatar?: string) => void;
  initialPrompt?: string;
  initialAvatar?: string;
  isEditing?: boolean;
}

export const PersonaEditPopover: React.FC<PersonaEditPopoverProps> = ({
  trigger,
  personaName: initialName,
  onSave,
  initialPrompt = "",
  initialAvatar,
  isEditing = false,
}) => {
  const { config } = useConfig(); // Access config for avatar defaults if needed
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState(initialName || '');
  const [prompt, setPrompt] = useState(initialPrompt);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(initialAvatar || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName || '');
      setPrompt(initialPrompt);
      setAvatarPreview(initialAvatar || (initialName ? config?.personaAvatars?.[initialName] : null) || DEFAULT_PERSONA_IMAGES.default);
      setAvatarFile(null);
    }
  }, [isOpen, initialName, initialPrompt, initialAvatar, config?.personaAvatars]);


  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (event) => setAvatarPreview(event.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!name.trim() || !prompt.trim()) return; // Basic validation

    if (avatarFile) {
      const reader = new FileReader();
      reader.onload = (event) => {
        onSave(name.trim(), prompt, event.target?.result as string);
        setIsOpen(false);
      };
      reader.readAsDataURL(avatarFile);
    } else {
      onSave(name.trim(), prompt, avatarPreview || undefined);
      setIsOpen(false);
    }
  };
  
  const defaultAvatarSrc = initialName 
    ? (config?.personaAvatars?.[initialName] || DEFAULT_PERSONA_IMAGES[initialName] || DEFAULT_PERSONA_IMAGES.default)
    : DEFAULT_PERSONA_IMAGES.default;


  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-100 bg-[var(--bg)] border-[var(--text)]/20 shadow-xl rounded-xl p-4 space-y-4" side="bottom" align="end">
        <div className="space-y-1">
          <h4 className="font-medium leading-none text-[var(--text)]">{isEditing ? "Edit Persona" : "Add New Persona"}</h4>
          <p className="text-sm text-[var(--text)]/70">
            {isEditing ? "Modify the details of this persona." : "Create a new persona for your chats."}
          </p>
        </div>
        
        <div className="flex items-start gap-4">
          {/* Avatar Section */}
          <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
            <div className="w-16 h-16 rounded-full overflow-hidden border border-[var(--text)]/20 bg-[var(--input-background)]">
              <img
                src={avatarPreview || defaultAvatarSrc}
                alt="Avatar Preview"
                className="w-full h-full object-cover"
                onError={(e) => (e.currentTarget.src = DEFAULT_PERSONA_IMAGES.default)}
              />
            </div>
            <Button variant="link" size="xs" className="text-xs text-[var(--link)] hover:text-[var(--active)] p-0 h-auto" onClick={() => fileInputRef.current?.click()}>
              Change
            </Button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
          </div>
      
          {/* Name and Instructions Section */}
          <div className="flex-grow ml-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="persona-popover-name" className="text-xs font-medium text-[var(--text)]/90">Name</Label>
              <Input
                id="persona-popover-name"
                placeholder="Persona Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8 text-sm bg-[var(--input-background)] border-[var(--text)]/20 focus:border-[var(--active)] focus:ring-1 focus:ring-[var(--active)] rounded-md"
                disabled={isEditing && (initialName === 'Ein' || initialName === 'Default')}
              />
            </div>
          </div>
        </div>
        <div>
            <Label htmlFor="persona-popover-prompt" className="text-xs mb-2 font-medium text-[var(--text)]/90">Persona Instruction</Label>
            <div className="rounded-md border bg-[var(--input-background)] border-[var(--text)]/20 thin-scrollbar p-1">
              <Textarea
                  id="persona-popover-prompt"
                  placeholder="You are a helpful assistant..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="text-sm border-none focus-visible:ring-0 max-h-40 min-h-[64px] overflow-y-auto focus-visible:ring-offset-0"
                  autosize={true}
                  onWheel={(e) => {
                  // Prevent the event from bubbling up to parent containers
                    e.stopPropagation();
                  // Manually scroll the textarea
                    e.currentTarget.scrollTop += e.deltaY;
                    }}
              />
            </div>
        </div>

        <div className="flex justify-end space-x-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setIsOpen(false)} className="h-7 px-2 text-xs border-[var(--text)]/20 hover:border-[var(--active)]">
            <FiXCircle className="mr-1 h-3.5 w-3.5" /> Cancel
          </Button>
          <Button variant="default" size="sm" onClick={handleSave} disabled={!name.trim() || !prompt.trim()} className="h-7 px-2 text-xs bg-[var(--active)] hover:bg-[var(--active)]/90 text-[var(--active-foreground)]">
            <FiSave className="mr-1 h-3.5 w-3.5" /> Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};


export const DeletePersonaDialog: React.FC<{
  trigger: React.ReactNode;
  personaName: string;
  onConfirm: () => void;
}> = ({ trigger, personaName, onConfirm }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (personaName === 'Ein' || personaName === 'Default') { // Prevent deletion of default personas
    return null; 
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-[var(--bg)] border-[var(--text)]/20 text-[var(--text)] rounded-xl shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-[var(--text)]">Delete Persona: "{personaName}"</DialogTitle>
          <DialogDescription className="text-[var(--text)]/70 pt-2">
            Are you sure you want to delete the persona "{personaName}"? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-end pt-4">
          <DialogClose asChild>
            <Button type="button" variant="outline" size="sm" className="h-8 border-[var(--text)]/20 hover:border-[var(--active)]">Cancel</Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="h-8"
            onClick={() => {
              onConfirm();
              setIsOpen(false);
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};