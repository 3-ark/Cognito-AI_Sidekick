import { useState, useRef, ChangeEvent } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { DEFAULT_PERSONA_IMAGES } from './constants';
import { useConfig } from './ConfigContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const AvatarUpload = ({ personaName }: { personaName: string }) => {
  const { config, updateConfig } = useConfig();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const currentAvatar = config.personaAvatars?.[personaName] || DEFAULT_PERSONA_IMAGES[personaName] || DEFAULT_PERSONA_IMAGES.default;

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const avatarUrl = event.target?.result as string;
      updateConfig({
        personaAvatars: {
          ...config.personaAvatars,
          [personaName]: avatarUrl
        }
      });
      setIsPopoverOpen(false);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    const newAvatars = { ...config.personaAvatars };
    delete newAvatars[personaName];
    updateConfig({ personaAvatars: newAvatars });
    setIsPopoverOpen(false);
  };

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="p-0 rounded-full w-8 h-8 overflow-hidden border border-[var(--text)]/20"
              >
                <img
                  src={currentAvatar}
                  alt={personaName}
                  className="w-full h-full object-cover"
                />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-secondary/50 text-foreground">
            <p>Change avatar</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent
        className="w-64 p-4 bg-[var(--bg)] border border-[var(--text)]/20"
        align="start"
      >
        <div className="flex flex-col gap-3">
          <div className="text-sm font-medium text-[var(--text)]">Change Avatar</div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
          <Button
            variant="active-bordered"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            Upload Image
          </Button>
          {config.personaAvatars?.[personaName] && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRemoveAvatar}
            >
              Remove Custom Avatar
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};