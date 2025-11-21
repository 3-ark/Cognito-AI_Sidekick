import {
 useEffect, useRef,useState, 
} from 'react';
import { toast } from 'react-hot-toast';
import { IoArchiveOutline } from "react-icons/io5";
import { LuNotebookPen, LuSpeech } from "react-icons/lu";

import ChannelNames from '../types/ChannelNames'; // Import ChannelNames

import { useConfig } from './ConfigContext';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
 Popover, PopoverContent,PopoverTrigger, 
} from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
 Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, 
} from '@/components/ui/tooltip';
import {
  speakMessage,
  speakMessageOpenAI,
  stopSpeech,
  stopSpeechOpenAI,
} from '@/src/background/ttsUtils';
import { cn } from '@/src/background/util';

export const NotePopover = () => {
  const { config, updateConfig } = useConfig();
  const [isOpen, setIsOpen] = useState(false);
  const [editableNote, setEditableNote] = useState(config.noteContent || '');
  const [isSpeakingNote, setIsSpeakingNote] = useState(false);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen) {
      setEditableNote(config.noteContent || '');
    }
  }, [isOpen, config.noteContent]);

  useEffect(() => {
    if (!isOpen && isSpeakingNote) {
      if (config.tts?.provider === 'openai') {
        stopSpeechOpenAI();
      } else {
        stopSpeech();
      }
      setIsSpeakingNote(false);
    }

    if (isOpen && isSpeakingNote && editableNote.trim() === '') {
      if (config.tts?.provider === 'openai') {
        stopSpeechOpenAI();
      } else {
        stopSpeech();
      }
      setIsSpeakingNote(false);
    }
  }, [isOpen, isSpeakingNote, editableNote, config.tts?.provider]);

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
      if (editableNote !== (config.noteContent || '')) {
        updateConfig({
          noteContent: editableNote,
        });
      }
    }, 500); // 500ms debounce delay

    // Cleanup function to clear the timeout if the component unmounts or isOpen changes
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [isOpen, editableNote, config.noteContent, updateConfig]);

  const handleSaveNoteToFile = async () => {
    if (editableNote.trim()) {
      const noteToSave = {
        title: "user's memory",
        description: "A memory saved by the user from the popover.",
        content: editableNote,
        tags: ["memory", "user"],
      };

      chrome.runtime.sendMessage(
        {
          type: ChannelNames.SAVE_NOTE_REQUEST,
          payload: noteToSave,
        },
        response => {
          if (chrome.runtime.lastError) {
            console.error("Error saving note from popover (runtime.lastError):", chrome.runtime.lastError.message);
            toast.error(`Failed to save note: ${chrome.runtime.lastError.message}`);

            return;
          }

          if (response && response.success && response.note) {
            toast.success('Snapshot saved to Note System!');
            setEditableNote('');
            updateConfig({
              noteContent: '',
            });
          } else {
            console.error("Error saving note from popover (response):", response?.error);
            toast.error(`Failed to save note: ${response?.error || 'Unknown error'}`);
          }
        },
      );
    }

    setIsOpen(false);
  };

  const handleClearNote = () => {
    setEditableNote('');
    updateConfig({
      noteContent: '',
    });
    toast('Note cleared');
  };

  const handleToggleUseNote = (checked: boolean) => {
    updateConfig({ useNote: checked });
  };

  const handleReadNote = () => {
    if (!editableNote.trim()) return;

    if (isSpeakingNote) {
      if (config.tts?.provider === 'openai') {
        stopSpeechOpenAI();
      } else {
        stopSpeech();
      }
      setIsSpeakingNote(false);
    } else {
      setIsSpeakingNote(true);
      const onEndCallback = () => setIsSpeakingNote(false);

      if (config.tts?.provider === 'openai') {
        if (config.openAiApiKey) {
          speakMessageOpenAI(
            editableNote,
            config.openAiApiKey,
            config.tts.selectedVoice,
            config.tts.model,
            config.tts.endpoint,
            { onEnd: onEndCallback },
          );
        } else {
          console.error('OpenAI API key not found');
          setIsSpeakingNote(false);
        }
      } else {
        speakMessage(editableNote, config?.tts?.selectedVoice, config?.tts?.rate, {
          onEnd: onEndCallback,
        });
      }
    }
  };

  const isArchiveDisabled = !editableNote.trim();
  const isLocalContentPresent = !!editableNote.trim();
  const isConfigDraftPresent = !!(config.noteContent && config.noteContent.trim());
  const isClearDisabled = !isLocalContentPresent && !isConfigDraftPresent;

  return (
    <TooltipProvider delayDuration={500}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                aria-label="Toggle/Edit Memory"
                className={cn(
                  "rounded-md not-focus-visible",
                  config.useNote ? "text-[var(--active)] hover:bg-muted/80" : "text-foreground hover:text-foreground hover:bg-[var(--text)]/10",
                )}
                size="sm"
                variant="ghost"
              >
                <LuNotebookPen />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent className="bg-secondary/50 text-foreground" side="top">
            <p>Toggle/Edit Memory</p>
          </TooltipContent>
        </Tooltip>
      <PopoverContent align="end" className="w-[80vw] p-4 bg-[var(--bg)] border-[var(--text)]/20 shadow-lg rounded-md" side="top" sideOffset={5}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-[var(--text)] font-medium cursor-pointer" htmlFor="use-note-switch">
                Use Memory
              </Label>
              <Switch
                checked={config.useNote || false}
                id="use-note-switch"
                onCheckedChange={handleToggleUseNote}
              />
            </div>
            <div>  
              <Textarea
                className="mt-2 min-h-[25vh] max-h-[60vh] overflow-y-auto bg-[var(--input-background)] border-[var(--text)]/20 text-[var(--text)] focus-visible:ring-1 focus-visible:ring-[var(--active)] resize-none thin-scrollbar"
                id="note-popover-textarea"
                placeholder="Persistent notes for the AI..."
                value={editableNote}
                onChange={e => setEditableNote(e.target.value)}
              />
            </div>
            <div className="flex justify-between items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={isSpeakingNote ? "Stop reading note" : "Read note aloud"}
                    className={cn(
                      "p-1.5 rounded-md",
                      "text-[var(--text)] hover:bg-[var(--text)]/10",
                      "focus-visible:ring-1 focus-visible:ring-[var(--active)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg)]",
                    )}
                    disabled={!editableNote.trim()}
                    size="sm"
                    variant="ghost"
                    onClick={handleReadNote}
                  >
                    <LuSpeech className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-secondary/50 text-foreground" side="top">
                  <p>{isSpeakingNote ? "Stop Reading" : "Read Aloud"}</p>
                </TooltipContent>
              </Tooltip>

              <div className="flex space-x-2">
                <Button
                  className={cn(
                    "text-xs px-2 py-1 h-auto w-16",
                  )}
                  disabled={isClearDisabled}
                  variant="outline-subtle"
                  onClick={handleClearNote}
                >
                  Clear
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className={cn(
                        "text-xs px-2 py-1 h-auto w-10",
                      )}
                      disabled={isArchiveDisabled}
                      variant="save"
                      onClick={handleSaveNoteToFile}
                    >
                      <IoArchiveOutline size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-secondary/50 text-foreground" side="top">Archive Memory to Notes & Clear</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
      </PopoverContent>
    </Popover>
  </TooltipProvider>
  );
};
