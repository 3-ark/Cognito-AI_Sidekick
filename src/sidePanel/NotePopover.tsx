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
      // When popover opens, reset to current global note content (or empty)
      // and clear title/tags for a fresh input experience.
      setEditableNote(config.noteContent || '');
      setPopoverTitle('');
      setPopoverTags('');
    } else {
      // When popover closes (without saving, as save handles its own reset and closes)
      // Reset editableNote if it was changed AND not saved to config via "Save" button for quick notes.
      // Title and Tags are reset to ensure they are clear next time.
      if (config.noteContent !== editableNote) {
        setEditableNote(config.noteContent || '');
      }
      setPopoverTitle('');
      setPopoverTags('');
    }
  }, [isOpen, config.noteContent]); // editableNote removed from deps, see note below

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
        const finalPopoverTitle = popoverTitle.trim() || `Note from Popover - ${timestamp}`;
        const parsedTags = popoverTags.trim() === '' ? [] : popoverTags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        await saveNoteInSystem({ title: finalPopoverTitle, content: editableNote, tags: parsedTags });
        toast.success('Snapshot saved to Note System!');
        setEditableNote('');    // Clear content after successful save to system
        setPopoverTitle('');    // Clear title after successful save
        setPopoverTags('');     // Clear tags after successful save
        updateConfig({ noteContent: '' }); // Also update config as editableNote is cleared
      } catch (error) {
        console.error("Error saving note to system from popover:", error);
        toast.error('Failed to save note to system.');
      }
    }
    setIsOpen(false); // Close the popover after saving
  };

  const handleClearNote = () => {
    setEditableNote('');
    setPopoverTitle(''); // Reset title input
    setPopoverTags(''); // Reset tags input
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