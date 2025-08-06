import type { FC } from 'react';
import { AddToChat } from './AddToChat';
import type { SpeechRecognition as SpeechRecognitionInstance, SpeechRecognitionEvent as SpeechRecognitionEventInstance, SpeechRecognitionErrorEvent as SpeechRecognitionErrorEventInstance } from '../types/speech';
import { useEffect, useRef, useState, useCallback, Dispatch, SetStateAction, MouseEvent } from 'react';
import { FaRegStopCircle, FaSearch } from 'react-icons/fa';
import { BsMic, BsSend, BsStopCircle, BsXLg } from "react-icons/bs";
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
    retrieverQuery: string;
    setRetrieverQuery: Dispatch<SetStateAction<string>>;
    onSend: () => void;
    onStopRequest: () => void;
    selectedNotesForContext: Note[];
    setSelectedNotesForContext: Dispatch<SetStateAction<Note[]>>;
}

export const Input: FC<InputProps> = ({
    isLoading,
    message,
    setMessage,
    retrieverQuery,
    setRetrieverQuery,
    onSend,
    onStopRequest,
    selectedNotesForContext,
    setSelectedNotesForContext
}) => {
  const { config } = useConfig();
  const [isListening, setIsListening] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [showNoteSelection, setShowNoteSelection] = useState<boolean>(false);
  const [noteSearchQuery, setNoteSearchQuery] = useState<string>("");
  const [filteredNotes, setFilteredNotes] = useState<Note[]>([]);
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [selectedNoteIndex, setSelectedNoteIndex] = useState<number>(-1);

  // --- 1. ADD STATE & REFS ---
  const [isMultiline, setIsMultiline] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const singleRowHeightRef = useRef<number | null>(null);

  const setMessageRef = useRef<Dispatch<SetStateAction<string>>>(setMessage);
  useEffect(() => {
    setMessageRef.current = setMessage;
  }, [setMessage]);

  // --- 2. CAPTURE BASELINE HEIGHT ---
  useEffect(() => {
    if (inputRef.current && singleRowHeightRef.current === null) {
      singleRowHeightRef.current = inputRef.current.clientHeight;
    }
    if (!retrieverQuery) {
      inputRef.current?.focus();
    }
  }, [config?.chatMode, retrieverQuery]);

  // --- 3. IMPLEMENT THE "ONE-WAY SWITCH" ---
  const handleHeightChange = useCallback((newHeight: number) => {
    if (isMultiline) return; // This breaks the feedback loop.

    if (singleRowHeightRef.current) {
      const isNowMultiline = newHeight > singleRowHeightRef.current + 5;
      if (isNowMultiline) {
        setIsMultiline(true);
      }
    }
  }, [isMultiline]);

  let placeholderText = "Chat (@ for notes, /r for RAG)";
    if (config?.chatMode === 'web') {
    placeholderText = 'Enter your query (/r for RAG)...';
  } else if (config?.chatMode === 'page') {
    placeholderText = 'Ask about this page (/r for RAG)...';
  }

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const handleListen = useCallback(async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        toast.error('Speech recognition is not supported in this browser.', { duration: 2000 });
        return;
    }
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const recognition: SpeechRecognitionInstance = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = (event: SpeechRecognitionEventInstance) => {
        const transcript = Array.from(event.results).map(result => result[0].transcript).join('');
        if (retrieverQuery && !message) {
          setRetrieverQuery(prev => prev + transcript);
        } else {
          setMessageRef.current((prev: string) => prev + transcript);
        }
      };
      recognition.onend = (_event: Event) => {
        setIsListening(false);
        recognitionRef.current = null;
      };
      recognition.onerror = (event: SpeechRecognitionErrorEventInstance) => {
        console.error('Speech recognition error:', event.error);
        let description = 'An unknown error occurred.';
        if (event.error === 'no-speech') description = 'No speech was detected. Please try again.';
        else if (event.error === 'audio-capture') description = 'Audio capture failed. Is the microphone working?';
        else if (event.error === 'not-allowed') description = 'Microphone access was denied or is blocked.';
        else description = `Error: ${event.error}`;
        toast.error(`Speech Error: ${description}`, { duration: 2000 });
        setIsListening(false);
        recognitionRef.current = null;
      };
      if (recognitionRef.current) recognitionRef.current.stop();
      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    } catch (err: any) {
      console.error('Mic access or setup error:', err);
      let description = 'Could not access the microphone.';
      if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) description = 'Please allow microphone access in your browser settings.';
      else if (err.name === 'NotFoundError') description = 'No microphone found. Please ensure one is connected and enabled.';
      toast.error(`Microphone Error: ${description}`, { duration: 2000 });
      setIsListening(false);
    }
  }, [retrieverQuery, message, setRetrieverQuery]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  const isSpeechRecognitionSupported = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  
  const handleSendClick = () => {
    if (isLoading) {
      onStopRequest();
    } else {
      if (message.trim() || retrieverQuery.trim()) {
        onSend();
      }
    }
  };

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showNoteSelection && inputRef.current && !inputRef.current.contains(event.target as Node) && menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowNoteSelection(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside as unknown as EventListener);
    return () => document.removeEventListener('mousedown', handleClickOutside as unknown as EventListener);
  }, [showNoteSelection]);

  const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isLoading) return;
    if (event.key === 'Backspace' && message === "" && retrieverQuery) {
        setRetrieverQuery("");
        return; 
    }
    if (showNoteSelection) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedNoteIndex((prevIndex) => prevIndex < filteredNotes.length - 1 ? prevIndex + 1 : prevIndex);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedNoteIndex((prevIndex) => prevIndex > 0 ? prevIndex - 1 : 0);
      } else if (event.key === 'Enter' && selectedNoteIndex >= 0 && selectedNoteIndex < filteredNotes.length) {
        event.preventDefault();
        handleNoteClick(filteredNotes[selectedNoteIndex]);
      } else if (event.key === 'Escape') {
        setShowNoteSelection(false);
      }
    } else if (event.key === 'Enter' && (message.trim() || retrieverQuery.trim()) && !event.altKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      onSend();
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const currentInput = event.target.value;
    setMessage(currentInput);

    // --- 4. RESET THE STATE ---
    if (currentInput === "") {
      setIsMultiline(false);
    }

    const retrieverPrefix = "/r ";
    if (currentInput.toLowerCase().startsWith(retrieverPrefix)) {
      const query = currentInput.substring(retrieverPrefix.length);
      setRetrieverQuery(query);
      setShowNoteSelection(false);
    } else {
      if (retrieverQuery) { 
        setRetrieverQuery("");
      }
      const activeTitlesInInput: string[] = [];
      const linkRegex = /@\[([^\]]+)\]/g;
      let titleMatch;
      while ((titleMatch = linkRegex.exec(currentInput)) !== null) {
        activeTitlesInInput.push(titleMatch[1]);
      }
      const currentSelectedNotesFromProps = selectedNotesForContext;
      const newSelectedNotesForContext = currentSelectedNotesFromProps.filter(note => activeTitlesInInput.includes(note.title));
      if (newSelectedNotesForContext.length !== currentSelectedNotesFromProps.length) {
        setSelectedNotesForContext(newSelectedNotesForContext);
      }
      const lastAtIndex = currentInput.lastIndexOf("@");
      const isNewQueryAttempt = lastAtIndex !== -1 && (lastAtIndex === currentInput.length - 1 || !currentInput.substring(lastAtIndex + 1).includes("]"));
      if (isNewQueryAttempt && !showNoteSelection) {
          setShowNoteSelection(true);
          getAllNotesFromSystem().then((fetchedNotes) => {
              setAllNotes(fetchedNotes);
              const availableNotesForSelection = fetchedNotes.filter((note) => !activeTitlesInInput.includes(note.title));
              const query = currentInput.substring(lastAtIndex + 1);
              setNoteSearchQuery(query);
              const notesMatchingQuery = availableNotesForSelection.filter((note) => note.title.toLowerCase().includes(query.toLowerCase()));
              setFilteredNotes(notesMatchingQuery);
              setSelectedNoteIndex(notesMatchingQuery.length > 0 ? 0 : -1);
          });
      } else if (showNoteSelection && currentInput.includes("@")) {
          const availableNotesForSelection = allNotes.filter((note) => !activeTitlesInInput.includes(note.title));
          const query = currentInput.substring(currentInput.lastIndexOf("@") + 1);
          setNoteSearchQuery(query);
          const notesMatchingQuery = availableNotesForSelection.filter((note) => note.title.toLowerCase().includes(query.toLowerCase()));
          setFilteredNotes(notesMatchingQuery);
          setSelectedNoteIndex(notesMatchingQuery.length > 0 ? 0 : -1);
      } else if ((!currentInput.includes("@") || !isNewQueryAttempt) && showNoteSelection) {
          setShowNoteSelection(false);
          setNoteSearchQuery("");
          setSelectedNoteIndex(-1);
          setFilteredNotes([]);
      }
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
  
  // --- 5. UPDATE THE JSX (Part 1: Create ActionButtons constant) ---
  const ActionButtons = (
    <div className="flex items-center flex-shrink-0">
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
                className={cn("p-2 rounded-md not-focus", isListening ? "text-red-500 hover:text-red-300 hover:bg-destructive/10" : "text-foreground hover:text-foreground hover:bg-[var(--text)]/10")}
                disabled={isLoading}
              >
                {isListening ? <FaRegStopCircle size={18} /> : <BsMic size={18} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-secondary/50 text-foreground">
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
              className={cn("p-2 rounded-md", !isLoading && "hover:bg-[var(--text)]/10")}
              onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); handleSendClick();}}
              disabled={isLoading || (!message.trim() && !retrieverQuery.trim())}
            >
              {isLoading ? <BsStopCircle className="h-5 w-5 text-foreground" /> : <BsSend className="h-5 w-5 text-foreground" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-secondary/50 text-foreground"><p>{isLoading ? "Stop" : "Send"}</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );

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
      {/* --- 5. UPDATE THE JSX (Part 2: Dynamic Layout) --- */}
      <div className={cn(
        "flex w-full border border-[var(--text)]/20 mb-1 p-1 bg-[var(--input-background)] rounded-xl shadow-md",
        isFocused && "input-breathing",
        isMultiline ? "flex-col" : "flex-row items-center"
      )}>
        <div className={cn("flex w-full items-center", isMultiline && "flex-col")}>
          {/* AddToChat is always visible in the top-left */}
          {!isMultiline && <AddToChat />}
          
          {retrieverQuery && (
            <div className="flex items-center pl-2 pr-1 py-0.5 text-xs bg-blue-500/20 text-blue-700 dark:text-blue-300 rounded-md ml-1 shrink-0 self-start my-1">
              <FaSearch className="mr-1.5 h-3 w-3" />
              <span className="truncate max-w-[100px] md:max-w-[150px] lg:max-w-[200px]" title={retrieverQuery}>{retrieverQuery}</span>
              <Button
                variant="ghost"
                size="xs"
                className="p-0.5 h-auto ml-1 hover:bg-blue-500/30"
                onClick={() => { setRetrieverQuery(""); setMessage(""); inputRef.current?.focus(); }}
                aria-label="Clear retriever query"
              >
                <BsXLg className="h-3 w-3" />
              </Button>
            </div>
          )}

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
            onHeightChange={handleHeightChange} // The magic prop
            className="flex-grow p-1 shadow-none outline-none focus-visible:ring-0 bg-transparent w-full"
            onFocus={() => setIsFocused(true)}
            onBlur={() => {}}
          />
          {!isMultiline && ActionButtons}
        </div>

        {isMultiline && (
          <div className="flex justify-between items-center w-full pt-1">
            <AddToChat />
            {ActionButtons}
          </div>
        )}
      </div>
    </>
  );
};