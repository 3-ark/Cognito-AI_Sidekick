import type { FC } from 'react';
import { AddToChat } from './AddToChat';
import type { SpeechRecognition as SpeechRecognitionInstance, SpeechRecognitionEvent as SpeechRecognitionEventInstance, SpeechRecognitionErrorEvent as SpeechRecognitionErrorEventInstance } from '../types/speech';
import { useEffect, useRef, useState, useCallback, Dispatch, SetStateAction, MouseEvent } from 'react';
import { FaRegStopCircle } from 'react-icons/fa';
import { BsMic, BsSend, BsStopCircle } from "react-icons/bs";
import { Loader2 } from 'lucide-react';
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
}

export const Input: FC<InputProps> = ({ isLoading, message, setMessage, onSend, onStopRequest }) => {
  const { config } = useConfig();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [isListening, setIsListening] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const setMessageRef = useRef<Dispatch<SetStateAction<string>>>(setMessage);
  useEffect(() => {
    setMessageRef.current = setMessage;
  }, [setMessage]);

  useEffect(() => {
    ref.current?.focus();
  }, [message, config?.chatMode]);

  let placeholderText = 'Type a message...';
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

  const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isLoading) return;
    if (event.key === 'Enter' && message.trim() && !event.altKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      onSend();
    }
  };

  return (
    <div className={cn(
      "flex w-full border border-[var(--active)]/50 items-center mb-1 gap-0 p-0 bg-[var(--card,var(--bg-secondary))] rounded-lg shadow-md",
      isFocused && "input-breathing"
    )}>
      <AddToChat /> 
      <Textarea
        autosize
        ref={ref}
        minRows={1}
        maxRows={8}
        autoComplete="off"
        id="user-input"
        placeholder={placeholderText}
        value={message}
        autoFocus
        onChange={event => setMessage(event.target.value)}
        onKeyDown={handleTextareaKeyDown}
        className="flex-grow !bg-transparent p-1 border-none shadow-none outline-none focus-visible:ring-0"
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
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
  );
};