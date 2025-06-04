import { useState, useEffect } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { LuNotebookPen, LuSpeech } from "react-icons/lu";
import { toast } from 'react-hot-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { IoArchiveOutline } from "react-icons/io5";
import { useConfig } from './ConfigContext';
import { cn } from '@/src/background/util';
import { speakMessage, stopSpeech } from '@/src/background/ttsUtils';
import { saveNoteInSystem } from '../background/noteStorage';

export const NotePopover = () => {
  const { config, updateConfig } = useConfig();
  const [isOpen, setIsOpen] = useState(false);
  const [editableNote, setEditableNote] = useState(config.noteContent || '');
  const [isSpeakingNote, setIsSpeakingNote] = useState(false);

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

  useEffect(() => {
    if (!isOpen && isSpeakingNote) {
      stopSpeech();
      setIsSpeakingNote(false);
    }
    if (isOpen && isSpeakingNote && editableNote.trim() === '') {
      stopSpeech();
      setIsSpeakingNote(false);
    }
  }, [isOpen, isSpeakingNote, editableNote]);

  const handleSaveNote = () => {
    updateConfig({ noteContent: editableNote });
    toast.success('Note saved!');
  };

  const handleSaveNoteToFile = async () => {
    chrome.runtime.sendMessage({
      type: 'SAVE_NOTE_TO_FILE',
      payload: { content: editableNote },
    });
    toast.success('Note saved to file!');
    // Also save to the note system as a new note
    if (editableNote.trim()) {
      try {
        const timestamp = new Date().toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const noteTitle = `Note from Popover - ${timestamp}`;
        await saveNoteInSystem({ title: noteTitle, content: editableNote });
        toast.success('Snapshot saved to Note System!');
      } catch (error) {
        console.error("Error saving note to system from popover:", error);
        toast.error('Failed to save note to system.');
      }
    }
    setIsOpen(false); // Close the popover after saving
  };

  const handleClearNote = () => {
    setEditableNote('');
    updateConfig({ noteContent: '' });
    toast('Note cleared');
  };

  const handleToggleUseNote = (checked: boolean) => {
    updateConfig({ useNote: checked });
  };

  const handleReadNote = () => {
    if (!editableNote.trim()) return;

    if (isSpeakingNote) {
      stopSpeech();
      setIsSpeakingNote(false);
    } else {
      stopSpeech();
      setIsSpeakingNote(true);
      speakMessage(editableNote, config?.tts?.selectedVoice, config?.tts?.rate, {
        onEnd: () => {
          setIsSpeakingNote(false);
        },
      });
    }
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
                <LuNotebookPen />
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
            <div className="flex justify-between items-center pt-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "p-1.5 rounded-md",
                      "text-[var(--text)] hover:bg-[var(--text)]/10",
                      "focus-visible:ring-1 focus-visible:ring-[var(--active)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg)]"
                    )}
                    onClick={handleReadNote}
                    disabled={!editableNote.trim()}
                    aria-label={isSpeakingNote ? "Stop reading note" : "Read note aloud"}
                  >
                    <LuSpeech className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-secondary/50 text-foreground">
                  <p>{isSpeakingNote ? "Stop Reading" : "Read Aloud"}</p>
                </TooltipContent>
              </Tooltip>

              <div className="flex space-x-2">
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
                    "text-xs px-2 py-1 h-auto w-16"
                    )}
                  disabled={editableNote === (config.noteContent || '')}
                >
                  Save
                </Button>
                 <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      onClick={handleSaveNoteToFile}
                      disabled={!editableNote}
                      className={cn(
                        "text-xs px-2 py-1 h-auto w-10",
                        editableNote ? "enabled" : "disabled"
                      )}
                    >
                      <IoArchiveOutline size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-secondary/50 text-foreground">Save to File</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
      </PopoverContent>
    </Popover>
    </TooltipProvider>
  );
};