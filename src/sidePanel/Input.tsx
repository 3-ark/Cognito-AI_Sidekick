import type { FC } from 'react';
import { AddToChat } from './AddToChat';
import type { SpeechRecognition as SpeechRecognitionInstance, SpeechRecognitionEvent as SpeechRecognitionEventInstance, SpeechRecognitionErrorEvent as SpeechRecognitionErrorEventInstance } from '../types/speech';
import { useEffect, useRef, useState, useCallback, Dispatch, SetStateAction, MouseEvent } from 'react';
import { FaRegStopCircle } from 'react-icons/fa';
import { BsMic, BsSend, BsStopCircle } from "react-icons/bs";
import { Note } from '../types/noteTypes';
import { getAllNotesFromSystem } from '../background/noteStorage';
import NoteSelectionMenu from './NoteSelectionMenu';
import { useConfig } from './ConfigContext';
import { Button } from "@/components/ui/button";
import { toast } from "react-hot-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/src/background/util";
import { NotePopover } from './NotePopover';

interface InputProps {
    isLoading: boolean;
    message: string;
    setMessage: Dispatch<SetStateAction<string>>; 
    onSend: () => void;
    onStopRequest: () => void;
    selectedNotesForContext: Note[];
    setSelectedNotesForContext: Dispatch<SetStateAction<Note[]>>;
}

export const Input: FC<InputProps> = ({ 
    isLoading, 
    message, 
    setMessage, 
    onSend, 
    onStopRequest,
    selectedNotesForContext,
    setSelectedNotesForContext
}) => {
  const { config } = useConfig();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [isListening, setIsListening] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [showNoteSelection, setShowNoteSelection] = useState<boolean>(false);
  const [noteSearchQuery, setNoteSearchQuery] = useState<string>("");
  const [filteredNotes, setFilteredNotes] = useState<Note[]>([]);
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [selectedNoteIndex, setSelectedNoteIndex] = useState<number>(-1);

  const setMessageRef = useRef<Dispatch<SetStateAction<string>>>(setMessage);
  useEffect(() => {
    setMessageRef.current = setMessage;
  }, [setMessage]);

  useEffect(() => {
    ref.current?.focus();
  }, [message, config?.chatMode]);

  let placeholderText = "Chat (or @ for notes)";
  if (config?.chatMode === 'web') {
    placeholderText = 'Enter your query...';
  } else if (config?.chatMode === 'page') {
    placeholderText = 'Ask about this page...';
  }

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const handleListen = useCallback(async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        toast.error(
          'Speech recognition is not supported in this browser.',
          { duration: 3000 } 
        );
        return;
    }

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });

      const recognition: SpeechRecognitionInstance = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event: SpeechRecognitionEventInstance) => {
        const transcript = Array.from(event.results)
          .map(result => result[0].transcript)
          .join('');
        setMessageRef.current((prev: string) => prev + transcript);
      };

      recognition.onend = (_event: Event) => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognition.onerror = (event: SpeechRecognitionErrorEventInstance) => {
        console.error('Speech recognition error:', event.error);
        let description = 'An unknown error occurred.';
        if (event.error === 'no-speech') {
            description = 'No speech was detected. Please try again.';
        } else if (event.error === 'audio-capture') {
            description = 'Audio capture failed. Is the microphone working?';
        } else if (event.error === 'not-allowed') {
            description = 'Microphone access was denied or is blocked.';
        } else {
            description = `Error: ${event.error}`;
        }
        toast.error(
          `Speech Error: ${description}`,
          { duration: 3000 }
        );
        setIsListening(false);
        recognitionRef.current = null;
      };

      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }

      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);

    } catch (err: any) {
      console.error('Mic access or setup error:', err);
      let description = 'Could not access the microphone.';
      if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) {
          description = 'Please allow microphone access in your browser settings.';
      } else if (err.name === 'NotFoundError') {
          description = 'No microphone found. Please ensure one is connected and enabled.';
      }
      toast.error(
        `Microphone Error: ${description}`,
        { duration: 3000 }
      );
      setIsListening(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  const isSpeechRecognitionSupported = typeof window !== 'undefined' &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);
  
    const handleSendClick = () => {
    if (isLoading) {
      onStopRequest();
    } else {
      if (message.trim()) {
        onSend();
      }
    }
  };

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showNoteSelection &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setShowNoteSelection(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside as unknown as EventListener);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside as unknown as EventListener);
    };
  }, [showNoteSelection]);

  const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isLoading) return;

    if (showNoteSelection) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedNoteIndex((prevIndex) =>
          prevIndex < filteredNotes.length - 1 ? prevIndex + 1 : prevIndex
        );
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedNoteIndex((prevIndex) =>
          prevIndex > 0 ? prevIndex - 1 : 0
        );
      } else if (event.key === 'Enter' && selectedNoteIndex >= 0 && selectedNoteIndex < filteredNotes.length) {
        event.preventDefault();
        handleNoteClick(filteredNotes[selectedNoteIndex]);
      } else if (event.key === 'Escape') {
        setShowNoteSelection(false);
      }
    } else if (event.key === 'Enter' && message.trim() && !event.altKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      onSend();
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const currentMessage = event.target.value;
    setMessage(currentMessage);

    const activeTitlesInInput: string[] = [];
    const linkRegex = /@\[([^\]]+)\]/g;
    let titleMatch;
    while ((titleMatch = linkRegex.exec(currentMessage)) !== null) {
      activeTitlesInInput.push(titleMatch[1]);
    }

    const currentSelectedNotesFromProps = selectedNotesForContext;
    const newSelectedNotesForContext = currentSelectedNotesFromProps.filter(note => 
      activeTitlesInInput.includes(note.title)
    );

    if (newSelectedNotesForContext.length !== currentSelectedNotesFromProps.length) {
      setSelectedNotesForContext(newSelectedNotesForContext);
    }

    const lastAtIndex = currentMessage.lastIndexOf("@");
    const isNewQueryAttempt = lastAtIndex !== -1 && (lastAtIndex === currentMessage.length - 1 || !currentMessage.substring(lastAtIndex + 1).includes("]"));


    if (isNewQueryAttempt && !showNoteSelection) {
        setShowNoteSelection(true);
        getAllNotesFromSystem().then((fetchedNotes) => {
            setAllNotes(fetchedNotes);
            const availableNotesForSelection = fetchedNotes.filter(
                (note) => !activeTitlesInInput.includes(note.title)
            );
            
            const query = currentMessage.substring(lastAtIndex + 1);
            setNoteSearchQuery(query);

            const notesMatchingQuery = availableNotesForSelection.filter((note) =>
                note.title.toLowerCase().includes(query.toLowerCase())
            );
            setFilteredNotes(notesMatchingQuery);
            setSelectedNoteIndex(notesMatchingQuery.length > 0 ? 0 : -1);
        });
    } else if (showNoteSelection && currentMessage.includes("@")) {
        const availableNotesForSelection = allNotes.filter(
            (note) => !activeTitlesInInput.includes(note.title)
        );

        const query = currentMessage.substring(currentMessage.lastIndexOf("@") + 1);
        setNoteSearchQuery(query);

        const notesMatchingQuery = availableNotesForSelection.filter((note) =>
            note.title.toLowerCase().includes(query.toLowerCase())
        );
        setFilteredNotes(notesMatchingQuery);
        setSelectedNoteIndex(notesMatchingQuery.length > 0 ? 0 : -1);
    } else if ((!currentMessage.includes("@") || !isNewQueryAttempt) && showNoteSelection) {
        setShowNoteSelection(false);
        setNoteSearchQuery("");
        setSelectedNoteIndex(-1);
        setFilteredNotes([]);
    }
  };

  const handleNoteClick = (note: Note) => {
    setMessage(prevMessage => `${prevMessage.substring(0, prevMessage.lastIndexOf("@"))}@[${note.title}]`);
    
    setSelectedNotesForContext(prevNotes => [...prevNotes, note]);
    
    setShowNoteSelection(false);
    setNoteSearchQuery("");
    setFilteredNotes([]); 
    setSelectedNoteIndex(-1);
    inputRef.current?.focus(); 
  };

  return (
    <>
      <div ref={menuRef}>
        <NoteSelectionMenu
          notes={filteredNotes}
          onSelectNote={handleNoteClick}
          isOpen={showNoteSelection}
          selectedIndex={selectedNoteIndex}
        />
      </div>
      <div className={cn(
        "flex w-full border border-[var(--active)]/50 items-center mb-1 gap-0 p-0 bg-[var(--card,var(--bg-secondary))] rounded-lg shadow-md",
        isFocused && "input-breathing"
      )}>
        <AddToChat />
        <Textarea
          autosize
          ref={inputRef}
          minRows={1}
          maxRows={8}
          autoComplete="off"
          id="user-input"
          placeholder={placeholderText}
          value={message}
          autoFocus
          onChange={handleInputChange}
          onKeyDown={handleTextareaKeyDown}
          className="flex-grow !bg-transparent p-1 border-none shadow-none outline-none focus-visible:ring-0"
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
          }}
        />
        {isSpeechRecognitionSupported && (
          <TooltipProvider delayDuration={500}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={(e) => {
                e.stopPropagation();
                if (isListening && recognitionRef.current) {
                   recognitionRef.current.stop();
                   setIsListening(false);
                } else if (!isListening) {
                   handleListen();
                }
              }}
              aria-label={isListening ? "Stop" : "Recording"}
              variant="ghost"
              size="sm"
                className={cn(
                  "p-2 mr-1 rounded-md",
                  "not-focus",
                  isListening ? "text-red-500 hover:text-red-300 hover:bg-destructive/10" : "text-foreground hover:text-foreground hover:bg-[var(--text)]/10",
                )}
              disabled={isLoading}
            >
                {isListening ? <FaRegStopCircle size={18} /> : <BsMic size={18} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="bg-secondary/50 text-foreground"
          >
            <p>{isListening ? "Stop" : "Recording"}</p>
          </TooltipContent>
        </Tooltip>
        </TooltipProvider>
      )}
      <NotePopover />
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="Send"
              variant="ghost"
              size="sm"
              className={cn(
                "p-2 ml-1 rounded-md",
                !isLoading && "hover:bg-[var(--text)]/10"
              )}
              onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); handleSendClick();}}
              disabled={!isLoading && !message.trim()}
            >
              {isLoading ? (
                <BsStopCircle className="h-5 w-5 text-foreground" />
              ) : (
                <BsSend className="h-5 w-5 text-foreground" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-secondary/50 text-foreground"><p>{isLoading ? "Stop" : "Send"}</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
      </div>
    </>
  );
};