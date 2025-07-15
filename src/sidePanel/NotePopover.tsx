import { useState, useEffect, useRef } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
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
  const [popoverTags, setPopoverTags] = useState('');
  const [popoverTitle, setPopoverTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false); // Loading state for save operation
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen) {
      setEditableNote(config.noteContent || '');
      setPopoverTitle(config.popoverTitleDraft || '');
      setPopoverTags(config.popoverTagsDraft || '');
    }
  }, [isOpen, config.noteContent, config.popoverTitleDraft, config.popoverTagsDraft]);

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

  // Auto-save effect
  useEffect(() => {
    if (!isOpen) { // If popover is closed, clear any pending save and do nothing.
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
      return;
    }

    // Clear any existing timeout to reset the debounce timer
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      // Only update if there's an actual change compared to the current config
      if (editableNote !== (config.noteContent || '') ||
          popoverTitle !== (config.popoverTitleDraft || '') ||
          popoverTags !== (config.popoverTagsDraft || '')) {
        updateConfig({
          noteContent: editableNote,
          popoverTitleDraft: popoverTitle,
          popoverTagsDraft: popoverTags,
        });
      }
    }, 500); // 500ms debounce delay

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [isOpen, editableNote, popoverTitle, popoverTags, config.noteContent, config.popoverTitleDraft, config.popoverTagsDraft, updateConfig]);

  const handleSaveNoteToFile = async () => {
    if (!editableNote.trim() && !popoverTitle.trim() && !popoverTags.trim()) {
      toast.error('Cannot save an empty note.');
      return;
    }

    // This message seems related to a different functionality (downloading a file perhaps)
    // and not directly to saving to the internal note system.
    // It's kept for now but might need clarification if it's causing confusion.
    // chrome.runtime.sendMessage({
    //   type: 'SAVE_NOTE_TO_FILE',
    //   payload: { content: editableNote },
    // });
    // Removed optimistic toast: toast.success('Note saved to file!');

    if (editableNote.trim() || popoverTitle.trim() || popoverTags.trim()) {
      setIsSaving(true);
      const toastId = toast.loading('Archiving memory to Note System...');
      try {
        const timestamp = new Date().toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const finalPopoverTitle = popoverTitle.trim() || `Note from Popover - ${timestamp}`;
        const parsedTags = popoverTags.trim() === '' ? [] : popoverTags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);

        // Send a message to the background script to save and index the note
        chrome.runtime.sendMessage(
          {
            type: 'SAVE_NOTE_REQUEST',
            payload: {
              title: finalPopoverTitle,
              content: editableNote,
              tags: parsedTags,
            },
          },
          (response) => {
            setIsSaving(false);
            if (response && response.success) {
              toast.success('Memory archived to Note System!', { id: toastId });
              setEditableNote('');
              setPopoverTitle('');
              setPopoverTags('');
              updateConfig({
                noteContent: '',
                popoverTitleDraft: '',
                popoverTagsDraft: '',
              });
              setIsOpen(false); // Close popover on successful save
            } else {
              console.error("Error response from background script SAVE_NOTE_REQUEST:", response?.error);
              toast.error(response?.error || 'Failed to archive memory to Note System.', { id: toastId });
            }
          }
        );
      } catch (error) { // Catch unexpected errors during the message sending process itself (less likely)
        setIsSaving(false);
        console.error("Error sending SAVE_NOTE_REQUEST message from popover:", error);
        toast.error(`An unexpected client-side error occurred: ${error instanceof Error ? error.message : String(error)}`, { id: toastId });
      }
    } else {
      // If there's no content for system save (e.g., all fields are empty)
      // This case should ideally be prevented by the `isArchiveDisabled` check,
      // but as a fallback, we can just close the popover or do nothing.
      setIsOpen(false); 
    }
  };

  const handleClearNote = () => {
    setEditableNote('');
    setPopoverTitle('');
    setPopoverTags('');
    updateConfig({
      noteContent: '',
      popoverTitleDraft: '',
      popoverTagsDraft: '',
    });
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

  const isArchiveDisabled =
    !popoverTitle.trim() &&
    !editableNote.trim() &&
    !popoverTags.trim();

  const isLocalContentPresent =
    !!popoverTitle.trim() ||
    !!editableNote.trim() ||
    !!popoverTags.trim();

  const isConfigDraftPresent =
    !!(config.popoverTitleDraft && config.popoverTitleDraft.trim()) ||
    !!(config.noteContent && config.noteContent.trim()) ||
    !!(config.popoverTagsDraft && config.popoverTagsDraft.trim());

  const isClearDisabled = !isLocalContentPresent && !isConfigDraftPresent;

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
                aria-label="Chat Controls"
              >
                <LuNotebookPen />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-secondary/50 text-foreground">
            <p>Chat Controls</p>
          </TooltipContent>
        </Tooltip>
      <PopoverContent className="w-[80vw] p-4 bg-[var(--bg)] border-[var(--text)]/20 shadow-lg rounded-md" side="top" align="end" sideOffset={5}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="use-note-switch" className="text-[var(--text)] font-medium cursor-pointer">
                Use Memory
              </Label>
              <Switch
                id="use-note-switch"
                checked={config.useNote || false}
                onCheckedChange={handleToggleUseNote}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="use-tools-switch" className="text-[var(--text)] font-medium cursor-pointer">
                Use Tools
              </Label>
              <Switch
                id="use-tools-switch"
                checked={config.useTools === undefined ? true : config.useTools} // Default to true if undefined
                onCheckedChange={(checked) => updateConfig({ useTools: checked })}
              />
            </div>

            <div>
              <Input
                id="popover-title-input"
                type="text"
                placeholder="Title (optional)"
                value={popoverTitle}
                onChange={(e) => setPopoverTitle(e.target.value)}
                className="bg-[var(--input-background)] border-[var(--text)]/20 text-[var(--text)] focus-visible:ring-1 focus-visible:ring-[var(--active)]"
              />
            </div>
            <div>  
              <Textarea
                id="note-popover-textarea"
                value={editableNote}
                onChange={(e) => setEditableNote(e.target.value)}
                placeholder="Persistent notes for the AI..."
                className="mt-2 min-h-[25vh] max-h-[55vh] overflow-y-auto bg-[var(--input-background)] border-[var(--text)]/20 text-[var(--text)] focus-visible:ring-1 focus-visible:ring-[var(--active)] resize-none thin-scrollbar"
              />
            </div>
            <div>
              <Input
                id="popover-tags-input"
                type="text"
                placeholder="Tags (comma-separated)"
                value={popoverTags}
                onChange={(e) => setPopoverTags(e.target.value)}
                className="mt-2 bg-[var(--input-background)] border-[var(--text)]/20 text-[var(--text)] focus-visible:ring-1 focus-visible:ring-[var(--active)]"
              />
            </div>
            <div className="flex justify-between items-center">
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
                  disabled={isClearDisabled}
                  className={cn(
                    "border-[var(--border)] text-[var(--text)]",
                    "text-xs px-2 py-1 h-auto w-16"
                  )}
                >
                  Clear
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      onClick={handleSaveNoteToFile}
                      disabled={isArchiveDisabled || isSaving}
                      className={cn(
                        "text-xs px-2 py-1 h-auto w-10"
                      )}
                    >
                      {isSaving ? "..." : <IoArchiveOutline size={16} />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-secondary/50 text-foreground">
                    {isSaving ? "Archiving..." : "Archive memory to notes & Clear"}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
      </PopoverContent>
    </Popover>
  </TooltipProvider>
  );
};