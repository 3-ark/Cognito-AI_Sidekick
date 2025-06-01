import { useState, useEffect } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { LuNotebookPen } from "react-icons/lu";
import { toast } from 'react-hot-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConfig } from './ConfigContext';
import { cn } from '@/src/background/util';

export const NotePopover = () => {
  const { config, updateConfig } = useConfig();
  const [isOpen, setIsOpen] = useState(false);
  const [editableNote, setEditableNote] = useState(config.noteContent || '');

  useEffect(() => {
    if (!isOpen && config.noteContent !== editableNote) {
      setEditableNote(config.noteContent || '');
    }
  }, [config.noteContent, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setEditableNote(config.noteContent || '');
    }
  }, [isOpen, config.noteContent]);

  const handleSaveNote = () => {
    updateConfig({ noteContent: editableNote });
    toast.success('Note saved!');
  };

  const handleClearNote = () => {
    setEditableNote('');
    updateConfig({ noteContent: '' });
    toast('Note cleared');
  };

  const handleToggleUseNote = (checked: boolean) => {
    updateConfig({ useNote: checked });
  };

  return (
    <TooltipProvider delayDuration={500}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "rounded-md not-focus-visible",
                  config.useNote ? "text-[var(--active)] hover:bg-muted/80" : "text-foreground hover:text-foreground hover:bg-[var(--text)]/10"
                )}
                aria-label="Toggle/Edit Note"
              >
                <LuNotebookPen className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-secondary/50 text-foreground">
            <p>Toggle/Edit Note</p>
          </TooltipContent>
        </Tooltip>
      <PopoverContent className="w-80 p-4 bg-[var(--bg)] border-[var(--text)]/10 shadow-lg rounded-md" side="top" align="end" sideOffset={5}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="use-note-switch" className="text-[var(--text)] font-medium cursor-pointer">
              Use Note in Chat
            </Label>
            <Switch
              id="use-note-switch"
              checked={config.useNote || false}
              onCheckedChange={handleToggleUseNote}
            />
          </div>
          <div>
            <Textarea
              id="note-popover-textarea"
              data-slot="textarea-autosize"
              value={editableNote}
              onChange={(e) => setEditableNote(e.target.value)}
              placeholder="Persistent notes for the AI..."
              className="mt-1 min-h-[150px] max-h-[455px] overflow-y-auto bg-[var(--input-bg)] border-[var(--text)]/10 text-[var(--text)] focus-visible:ring-1 focus-visible:ring-[var(--active)]"
              rows={8}
            />
          </div>
          <div className="flex justify-end space-x-2 pt-1">
            <Button
              variant="outline"
              onClick={handleClearNote}
              disabled={!editableNote && !config.noteContent}
              className={cn(
                "border-[var(--border)] text-[var(--text)]",
                "text-xs px-2 py-1 h-auto w-16"
              )}
            >
              Clear
            </Button>
            <Button
              variant="outline"
              onClick={handleSaveNote}
              className={cn(
                "border-[var(--border)] text-[var(--text)]",
                "text-xs px-2 py-1 h-auto",
                "w-16"
              )}
              disabled={editableNote === (config.noteContent || '')}
            >
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
    </TooltipProvider>
  );
};
