import type { FC } from 'react';
import {
 Dispatch, MouseEvent,SetStateAction, useCallback, useEffect, useRef, useState, 
} from 'react';
import { toast } from "react-hot-toast";
import {
 BsMic, BsSend, BsStopCircle, 
} from "react-icons/bs";
import { FaRegStopCircle } from 'react-icons/fa';
import { Loader2, Sparkles } from 'lucide-react';

import { getAllNotesFromSystem } from '../background/noteStorage';
import { Conversation } from '../types/chatTypes';
import { Note } from '../types/noteTypes';
import type {
 SpeechRecognition as SpeechRecognitionInstance, SpeechRecognitionErrorEvent as SpeechRecognitionErrorEventInstance,SpeechRecognitionEvent as SpeechRecognitionEventInstance, 
} from '../types/speech';

import type { RetrieverResult } from './hooks/useRetriever';
import { AddToChat } from './AddToChat';
import { useConfig } from './ConfigContext';
import { NotePopover } from './NotePopover';
import NoteSelectionMenu from './NoteSelectionMenu';

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/src/background/util";

interface InputProps {
    isLoading: boolean;
    isRetrieving: boolean;
    message: string;
    setMessage: Dispatch<SetStateAction<string>>;
    onSend: (messageToSend: string) => void;
    onRetrieve: (query: string) => void;
    onStopRequest: () => void;
    selectedNotesForContext: Note[];
    setSelectedNotesForContext: Dispatch<SetStateAction<Note[]>>;
    setSessionContext: Dispatch<SetStateAction<string>>;
    setTempContext: Dispatch<SetStateAction<string>>;
    conversation: Conversation | null;
    ensureConversation: () => Promise<Conversation>;
}

export const Input: FC<InputProps> = ({ 
    isLoading, 
    isRetrieving,
    message, 
    setMessage, 
    onSend, 
    onRetrieve,
    onStopRequest,
    selectedNotesForContext,
    setSelectedNotesForContext,
    setSessionContext,
    setTempContext,
    conversation,
    ensureConversation,
}) => {
  const { config } = useConfig();
  const [isListening, setIsListening] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [showNoteSelection, setShowNoteSelection] = useState<boolean>(false);
  const [noteSearchQuery, setNoteSearchQuery] = useState<string>("");
  const [filteredNotes, setFilteredNotes] = useState<Note[]>([]);
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [selectedNoteIndex, setSelectedNoteIndex] = useState<number>(-1);
  const [isRetrieverModeActive, setIsRetrieverModeActive] = useState<boolean>(false);
  const [isAnalysisModeActive, setIsAnalysisModeActive] = useState<boolean>(false);
  const [isMultiline, setIsMultiline] = useState(false);
  const [isNotePage, setIsNotePage] = useState(false);
  const [isAiEditingNote, setIsAiEditingNote] = useState(false);

  useEffect(() => {
    const listener = (message: any) => {
      if (message.type === 'AI_EDIT_COMPLETE') {
        setIsAiEditingNote(false);
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  useEffect(() => {
    const checkIsNotePage = async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

        if (tabs.length > 0 && tabs[0].url?.includes('note.html')) {
          setIsNotePage(true);
        } else {
          setIsNotePage(false);
        }
      } catch (e) {
        console.error("Could not query tabs", e)
        setIsNotePage(false);
      }
    };

    const onTabUpdated = (tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => {
      if (tab.active && changeInfo.url) {
        setIsNotePage(changeInfo.url.includes('note.html'));
      }
    };

    const onTabActivated = (activeInfo: chrome.tabs.OnActivatedInfo) => {
      chrome.tabs.get(activeInfo.tabId, tab => {
        if (tab?.url) {
          setIsNotePage(tab.url.includes('note.html'));
        } else {
          setIsNotePage(false);
        }
      });
    };

    checkIsNotePage();
    chrome.tabs.onUpdated.addListener(onTabUpdated);
    chrome.tabs.onActivated.addListener(onTabActivated);

    return () => {
      chrome.tabs.onUpdated.removeListener(onTabUpdated);
      chrome.tabs.onActivated.removeListener(onTabActivated);
    };
  }, []);

  const setMessageRef = useRef<Dispatch<SetStateAction<string>>>(setMessage);

  useEffect(() => {
    setMessageRef.current = setMessage;
  }, [setMessage]);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const singleRowHeightRef = useRef<number | null>(null);

  useEffect(() => {
    if (inputRef.current && singleRowHeightRef.current === null) {
      singleRowHeightRef.current = inputRef.current.clientHeight;
    }

    inputRef.current?.focus();
  }, [config?.chatMode]);

  // --- THE CORE FIX: This is now a "one-way switch" to prevent loops ---
  const handleHeightChange = useCallback((newHeight: number) => {
    // If we are already in multiline mode, do nothing. This breaks the loop.
    if (isMultiline) return;

    if (singleRowHeightRef.current) {
      const isNowMultiline = newHeight > singleRowHeightRef.current + 5;

      if (isNowMultiline) {
        setIsMultiline(true);
      }
    }
  }, [isMultiline]); // The dependency is correct.

  useEffect(() => {
    if (message === "") {
      setIsMultiline(false);
      setIsRetrieverModeActive(false);
      setIsAnalysisModeActive(false);
    }
  }, [message]);

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const currentMessage = event.target.value;

    setMessage(currentMessage);

    const retrieverPrefix = "/r ";
    const analysisPrefix = "/a";

    if (currentMessage.toLowerCase().startsWith(retrieverPrefix)) {
      setIsRetrieverModeActive(true);
      setIsAnalysisModeActive(false);
      setShowNoteSelection(false); 
    } else if (currentMessage.toLowerCase().startsWith(analysisPrefix)) {
      setIsRetrieverModeActive(false);
      setIsAnalysisModeActive(true);
      setShowNoteSelection(false);
    } else if (currentMessage.startsWith("/")) {
        setIsRetrieverModeActive(false);
        setIsAnalysisModeActive(false);
        setShowNoteSelection(false);
    } else {
      setIsRetrieverModeActive(false);
      setIsAnalysisModeActive(false);
    }

    if (!isRetrieverModeActive && !isAnalysisModeActive) {
      const lastAtIndex = currentMessage.lastIndexOf("@");
      const isNewNoteQueryAttempt = lastAtIndex !== -1 && !currentMessage.substring(lastAtIndex + 1).includes(" ");

      if (isNewNoteQueryAttempt && !showNoteSelection) {
          setShowNoteSelection(true);
          getAllNotesFromSystem().then(fetchedNotes => {
              setAllNotes(fetchedNotes);
              const query = currentMessage.substring(lastAtIndex + 1);

              setNoteSearchQuery(query);
              const notesMatchingQuery = fetchedNotes.filter(note =>
                  note.title.toLowerCase().includes(query.toLowerCase()),
              );

              setFilteredNotes(notesMatchingQuery);
              setSelectedNoteIndex(notesMatchingQuery.length > 0 ? 0 : -1);
          });
      } else if (showNoteSelection && currentMessage.includes("@")) {
          const query = currentMessage.substring(currentMessage.lastIndexOf("@") + 1);

          setNoteSearchQuery(query);
          const notesMatchingQuery = allNotes.filter(note =>
              note.title.toLowerCase().includes(query.toLowerCase()),
          );

          setFilteredNotes(notesMatchingQuery);
          setSelectedNoteIndex(notesMatchingQuery.length > 0 ? 0 : -1);
      } else if (!isNewNoteQueryAttempt && showNoteSelection) {
          setShowNoteSelection(false);
          setNoteSearchQuery("");
          setSelectedNoteIndex(-1);
          setFilteredNotes([]);
      }
    } else {
        if (showNoteSelection) {
            setShowNoteSelection(false);
            setNoteSearchQuery("");
            setSelectedNoteIndex(-1);
            setFilteredNotes([]);
        }
    }
  };

  // ... (No changes to any other functions or the ActionButtons constant)
  let placeholderText = "@ for notes, /r for RAG, /a for html";

  if (isRetrieverModeActive) {
    placeholderText = isRetrieving ? "Retrieving results..." : "Search with /r <your query>";
  } else if (isAnalysisModeActive) {
    placeholderText = "Type /a and press Enter to analyze the page";
  } else if (config?.chatMode === 'web') {
    placeholderText = 'Enter your query...';
  } else if (config?.chatMode === 'page') {
    placeholderText = 'Ask about this page...';
  }

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalTranscriptRef = useRef<string>('');

  const handleListen = useCallback(async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error('Speech recognition is not supported in this browser.', { duration: 2000 });

      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }

      return;
    }

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const recognition: SpeechRecognitionInstance = new SpeechRecognition();

      recognition.lang = config.asr?.language || 'en';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: SpeechRecognitionEventInstance) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        const stopWord = config.asr?.stopWord?.toLowerCase().trim();
        if (stopWord && finalTranscript.toLowerCase().includes(stopWord)) {
          finalTranscriptRef.current += finalTranscript.replace(new RegExp(stopWord, 'i'), '').trim();
          setMessageRef.current(finalTranscriptRef.current);
          recognition.stop();
          return;
        }

        if (stopWord && interimTranscript.toLowerCase().includes(stopWord)) {
          finalTranscriptRef.current += interimTranscript.replace(new RegExp(stopWord, 'i'), '').trim();
          setMessageRef.current(finalTranscriptRef.current);
          recognition.stop();
          return;
        }

        finalTranscriptRef.current += finalTranscript;
        setMessageRef.current(finalTranscriptRef.current + interimTranscript);
      };

      recognition.onend = () => {
        setIsListening(false);
        finalTranscriptRef.current = '';
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

        toast.error(`Speech Error: ${description}`, { duration: 2000 });
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err: any) {
      console.error('Mic access or setup error:', err);
      let description = 'Could not access the microphone.';

      if (err.name === 'NotAllowedError' || err.message?.includes('Permission denied')) {
        description = 'Please allow microphone access in your browser settings.';
      } else if (err.name === 'NotFoundError') {
        description = 'No microphone found. Please ensure one is connected and enabled.';
      }

      toast.error(`Microphone Error: ${description}`, { duration: 2000 });
      setIsListening(false);
    }
  }, [isListening]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const isSpeechRecognitionSupported = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  
  const handleAnalyzeClick = async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length > 0 && tabs[0].id) {
        const tabId = tabs[0].id;
        chrome.tabs.sendMessage(tabId, { type: 'ANALYZE_PAGE' }, response => {
          if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError.message);
            toast.error("Analysis failed: Could not connect to the page.");
            return;
          }
          if (response.success) {
            chrome.storage.local.set({ analysisReport: response.report }, () => {
              chrome.tabs.create({ url: chrome.runtime.getURL('analysis.html') });
            });
          } else {
            toast.error(`Analysis failed: ${response.error}`);
          }
        });
      }
    } catch (error) {
      console.error('Error analyzing page:', error);
      toast.error("An error occurred while trying to analyze the page.");
    }
    setMessage("");
  };

  const handleSendClick = () => {
    if (isLoading || isRetrieving) {
      onStopRequest();
    } else {
      const trimmedMessage = message.trim();

      if (trimmedMessage) {
        if (isRetrieverModeActive) {
          const query = trimmedMessage.substring(trimmedMessage.toLowerCase().indexOf("/r ") + 3).trim();

          if (query) {
            onRetrieve(query);
          }
        } else if (isAnalysisModeActive) {
          handleAnalyzeClick();
        } else {
          onSend(trimmedMessage);
        }

        inputRef.current?.focus();
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
    if (isLoading || isRetrieving) {
        if (event.key === 'Enter') event.preventDefault();

        return;
    }

    if (showNoteSelection) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedNoteIndex(prevIndex => prevIndex < filteredNotes.length - 1 ? prevIndex + 1 : prevIndex);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedNoteIndex(prevIndex => prevIndex > 0 ? prevIndex - 1 : 0);
      } else if (event.key === 'Enter' && selectedNoteIndex >= 0 && selectedNoteIndex < filteredNotes.length) {
        event.preventDefault();
        handleNoteClick(filteredNotes[selectedNoteIndex]);
      } else if (event.key === 'Escape') {
        setShowNoteSelection(false);
      }
    } else if (event.key === 'Enter' && !event.altKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      handleSendClick();
    }
  };

  const handleNoteClick = async (note: Note) => {
    const newContext = `Title: ${note.title}\nContent:\n${note.content}\n\n`;

    if (conversation && !conversation.id.startsWith('temp-')) {
      const contextKey = `session_context_${conversation.id}`;

      chrome.storage.local.get(contextKey, data => {
        const existingContext = data[contextKey] || "";
        const updatedContext = existingContext + newContext;

        chrome.storage.local.set({ [contextKey]: updatedContext }, () => {
          setSessionContext(updatedContext);
          toast.success(`Note "${note.title}" added to context.`);
        });
      });
    } else {
      setTempContext(prev => prev + newContext);
      toast.success(`Note "${note.title}" added to temporary context.`);
    }

    setMessage(prevMessage => prevMessage.substring(0, prevMessage.lastIndexOf("@")));
    setShowNoteSelection(false);
    setNoteSearchQuery("");
    setFilteredNotes([]); 
    setSelectedNoteIndex(-1);
    inputRef.current?.focus(); 
  };

  const handleAiEditClick = async () => {
    const prompt = message.trim();

    if (!prompt) {
      toast.error("Please enter an edit instruction in the input bar.");

      return;
    }

    setIsAiEditingNote(true);

    try {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const currentTab = tabs[0];

      if (currentTab && currentTab.id) {
        chrome.runtime.sendMessage({
          type: 'TRIGGER_AI_EDIT_WITH_PROMPT',
          payload: {
            tabId: currentTab.id,
            prompt: prompt,
          },
        });
        setMessage(""); // Clear the input field
      } else {
        setIsAiEditingNote(false); // Reset if no tab found
      }
    } catch (e) {
      console.error("Could not trigger AI Edit:", e);
      toast.error("Could not trigger AI Edit.");
      setIsAiEditingNote(false);
    }
  };

  const ActionButtons = (
    <div className="flex items-center">
      {isSpeechRecognitionSupported && (
        <TooltipProvider delayDuration={500}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={isListening ? "Stop" : "Recording"}
                className={cn(
                  "p-2 rounded-md",
                  "not-focus",
                  isListening ? "text-red-500 hover:text-red-300 hover:bg-destructive/10" : "text-foreground hover:text-foreground hover:bg-[var(--text)]/10",
                )}
                disabled={isLoading || isRetrieving}
                size="sm"
                variant="ghost"
                onClick={e => {
                  e.stopPropagation();
                  handleListen();
                }}
              >
                {isListening ? <FaRegStopCircle size={18} /> : <BsMic size={18} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="bg-secondary/50 text-foreground" side="top">
              <p>{isListening ? "Stop" : "Recording"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <NotePopover />
      {isNotePage && (
        <TooltipProvider delayDuration={500}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="AI Edit"
                className="p-2 rounded-md text-foreground hover:text-foreground hover:bg-[var(--text)]/10"
                disabled={isLoading || isRetrieving || isAiEditingNote}
                size="sm"
                variant="ghost"
                onClick={handleAiEditClick}
              >
                {isAiEditingNote ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="bg-secondary/50 text-foreground" side="top">
              <p>AI Edit</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="Send"
              className={cn(
                "p-2 rounded-md",
                !isLoading && !isRetrieving && "hover:bg-[var(--text)]/10",
              )}
              disabled={ (isLoading || isRetrieving) || (!isLoading && !isRetrieving && !message.trim())}
              size="sm"
              variant="ghost"
              onClick={(e: MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); handleSendClick();}}
            >
              {isLoading || isRetrieving ? (
                <BsStopCircle className="h-5 w-5 text-foreground" />
              ) : (
                <BsSend className="h-5 w-s text-foreground" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="bg-secondary/50 text-foreground" side="top"><p>{isLoading || isRetrieving ? "Stop" : "Send"}</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );

  return (
    <>
      <div ref={menuRef}>
        <NoteSelectionMenu
          isOpen={showNoteSelection}
          notes={filteredNotes}
          selectedIndex={selectedNoteIndex}
          onSelectNote={handleNoteClick}
        />
      </div>
      <div className={cn(
        "flex w-full border border-[var(--active)]/50 mb-1 p-1 bg-[var(--input-background)] shadow-md",
        isFocused && "input-breathing",
        isMultiline ? "flex-col rounded-xl" : "flex-row items-center rounded-full",
      )}>
        <div className={cn("flex w-full items-center")}>
          {!isMultiline && <div className="flex-shrink-0"><AddToChat conversation={conversation} ensureConversation={ensureConversation} setMessage={setMessage} setSelectedNotesForContext={setSelectedNotesForContext} setSessionContext={setSessionContext} setTempContext={setTempContext} /></div>}
          
          <Textarea
            ref={inputRef}
            autoComplete="off"
            className={cn(
              "p-1 border-none shadow-none outline-none focus-visible:ring-0 bg-transparent",
              "flex-grow w-full",
            )}
            id="user-input"
            maxRows={8}
            minRows={1}
            placeholder={placeholderText}
            value={message}
            autoFocus
            autosize
            onBlur={() => {}}
            onChange={handleInputChange}
            onFocus={() => setIsFocused(true)}
            onHeightChange={handleHeightChange}
            onKeyDown={handleTextareaKeyDown}
          />

          {!isMultiline && <div className="flex-shrink-0">{ActionButtons}</div>}
        </div>

        {isMultiline && (
          <div className="flex justify-between items-center w-full pt-1">
            <div className="flex-shrink-0"><AddToChat conversation={conversation} ensureConversation={ensureConversation} setMessage={setMessage} setSelectedNotesForContext={setSelectedNotesForContext} setSessionContext={setSessionContext} setTempContext={setTempContext} /></div>
            <div className="flex-shrink-0">{ActionButtons}</div>
          </div>
        )}
      </div>
    </>
  );
};
