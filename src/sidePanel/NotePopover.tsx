import { useState, useEffect } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input'; // Import Input
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

  useEffect(() => {
    if (isOpen) {
      // When popover opens, load content, title draft, and tags draft from config.
      setEditableNote(config.noteContent || '');
      setPopoverTitle(config.popoverTitleDraft || ''); // Load title from config draft
      setPopoverTags(config.popoverTagsDraft || '');   // Load tags string from config draft
    } else {
      // When popover closes (e.g. by clicking outside, not via "Archive" or "Clear" which have their own resets)
      // If the content was changed but not saved with the inline "Save" button, revert it.
      // Title and Tags drafts are cleared to ensure a fresh state next time unless saved.
      // This behavior ensures that if a user types a title/tag, then clicks "Save" (which saves to config),
      // then closes and reopens, they see their saved draft. If they type, then click away, it's cleared.
      if (config.noteContent !== editableNote) { // This check is for the main note content
        // If they typed in popover, didn't hit "Save" (which updates config.noteContent), then closed,
        // this line would revert editableNote to what's in config.noteContent.
        // However, the "Save" button only updates config.noteContent, config.popoverTitleDraft, config.popoverTagsDraft.
        // It does NOT clear the local popoverTitle/popoverTags states.
        // The current design is that closing the popover clears the local popoverTitle/Tags states.
      }
      // Always clear local popover title/tags state when popover is dismissed without explicit save action.
      // Saved drafts will be reloaded from config next time it opens.
      setPopoverTitle('');
      setPopoverTags('');
    }
  }, [isOpen, config]); // Use config object as dependency

  // Note on editableNote in dependency array:
  // The original logic for resetting editableNote when closing was:
  // `if (config.noteContent !== editableNote) { setEditableNote(config.noteContent || ''); }`
  // This implies that if the user types something in editableNote but doesn't hit the "Save"
  // button (which updates config.noteContent), and then closes the popover,
  // editableNote should revert to config.noteContent.
  // If editableNote is in the dependency array of the main isOpen effect,
  // then any typing in editableNote would trigger the effect, which is not desired.
  // The check `config.noteContent !== editableNote` should be sufficient to capture this intent
  // when isOpen becomes false. The state of editableNote at the point of closure is what matters.

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
    updateConfig({
      noteContent: editableNote,       // Existing: saves the main content
      popoverTitleDraft: popoverTitle, // New: saves the current title from popover's state
      popoverTagsDraft: popoverTags,   // New: saves the current tags string from popover's state
    });
    toast.success('Draft saved!'); // Optionally change toast message
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
        const finalPopoverTitle = popoverTitle.trim() || `Note from Popover - ${timestamp}`;
        const parsedTags = popoverTags.trim() === '' ? [] : popoverTags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        await saveNoteInSystem({ title: finalPopoverTitle, content: editableNote, tags: parsedTags });
        toast.success('Snapshot saved to Note System!');
        setEditableNote('');    // Clear content after successful save to system
        setPopoverTitle('');    // Clear title after successful save
        setPopoverTags('');     // Clear tags after successful save
        updateConfig({
          noteContent: '',
          popoverTitleDraft: '',
          popoverTagsDraft: '',
        }); // Also update config for all drafts
      } catch (error) {
        console.error("Error saving note to system from popover:", error);
        toast.error('Failed to save note to system.');
      }
    }
    setIsOpen(false); // Close the popover after saving
  };

  const handleClearNote = () => {
    // Clear local component state
    setEditableNote('');
    setPopoverTitle('');
    setPopoverTags('');

    // Clear draft values from config
    updateConfig({
      noteContent: '',
      popoverTitleDraft: '',
      popoverTagsDraft: '',
    });
    toast('Note cleared'); // Existing toast message
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

  const isContentUnchanged = editableNote === (config.noteContent || '');
  const isTitleUnchanged = popoverTitle === (config.popoverTitleDraft || '');
  const isTagsUnchanged = popoverTags === (config.popoverTagsDraft || '');
  const isSaveDisabled = isContentUnchanged && isTitleUnchanged && isTagsUnchanged;

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
      <PopoverContent className="w-[80vw] p-4 bg-[var(--bg)] border-[var(--text)]/10 shadow-lg rounded-md" side="top" align="end" sideOffset={5}>
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
              <Input
                id="popover-title-input"
                type="text"
                placeholder="Title (optional)"
                value={popoverTitle}
                onChange={(e) => setPopoverTitle(e.target.value)}
                className="mb-2 bg-[var(--input-bg)] border-[var(--text)]/10 text-[var(--text)] focus-visible:ring-1 focus-visible:ring-[var(--active)]"
              />
              <Textarea
                id="note-popover-textarea"
                value={editableNote}
                onChange={(e) => setEditableNote(e.target.value)}
                placeholder="Persistent notes for the AI..."
                className="mt-1 min-h-[30vh] max-h-[70vh] overflow-y-auto bg-[var(--input-bg)] border-[var(--text)]/10 text-[var(--text)] focus-visible:ring-1 focus-visible:ring-[var(--active)] resize-none thin-scrollbar"
              />
            </div>
            <div>
              <Input
                id="popover-tags-input"
                type="text"
                placeholder="Tags (comma-separated)"
                value={popoverTags}
                onChange={(e) => setPopoverTags(e.target.value)}
                className="mt-2 bg-[var(--input-bg)] border-[var(--text)]/10 text-[var(--text)] focus-visible:ring-1 focus-visible:ring-[var(--active)]"
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
                  disabled={isSaveDisabled}
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