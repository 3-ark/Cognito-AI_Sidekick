import {
 Dispatch, SetStateAction,useRef, 
} from "react";
import { toast } from "react-hot-toast";
import { Plus } from 'lucide-react';

import { Note } from "../types/noteTypes";

import { importFiles, ImportResult } from "./utils/noteImporter";
import { useConfig } from './ConfigContext';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/src/background/util";
import { CHAT_MODE_OPTIONS, ChatMode } from '@/src/types/config';

const ACCEPTED_FILE_TYPES = ".md,.txt,.pdf,.json,.csv,.html,.htm,.tsv,.jsonl,.zip,.epub";

import { Conversation } from '../types/chatTypes';

interface AddToChatProps {
  setMessage: Dispatch<SetStateAction<string>>;
  setSelectedNotesForContext: Dispatch<SetStateAction<Note[]>>;
  setSessionContext: Dispatch<SetStateAction<string>>;
  setTempContext: Dispatch<SetStateAction<string>>;
  conversation: Conversation | null;
  ensureConversation: () => Promise<Conversation>;
}

export const AddToChat = ({
 setSessionContext, setTempContext, conversation, ensureConversation, 
}: AddToChatProps) => {
  const { config, updateConfig } = useConfig();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentModeInConfig = config?.chatMode;

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) {
      return;
    }

    const files = Array.from(event.target.files);
    const importResults: ImportResult[] = await importFiles(files);

    let newContext = "";

    importResults.forEach(result => {
      if (result.success && result.note) {
        newContext += `Title: ${result.note.title || 'Untitled'}\nContent:\n${result.note.content}\n\n`;
        toast.success(`File "${result.fileName}" added to context.`);
      } else {
        toast.error(`Failed to import "${result.fileName}": ${result.error}`);
      }
    });

    if (newContext) {
      if (conversation && !conversation.id.startsWith('temp-')) {
        const contextKey = `session_context_${conversation.id}`;

        chrome.storage.local.get(contextKey, data => {
          const existingContext = data[contextKey] || "";
          const updatedContext = existingContext + newContext;

          chrome.storage.local.set({ [contextKey]: updatedContext }, () => {
            setSessionContext(updatedContext);
          });
        });
      } else {
        setTempContext(prev => prev + newContext);
      }
    }

    if(fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleModeChange = (selectedValue: string) => {
    if (selectedValue === 'file') {
      fileInputRef.current?.click();

      // Do not change the chat mode, just open file dialog.
      // The select's value will reset to the current mode because we are not updating the config.
      return;
    }

    const mode = selectedValue as ChatMode;

    updateConfig({
      chatMode: mode === "chat" ? undefined : mode,
    });
  };

  const selectValue = currentModeInConfig || "chat";

  return (
    <TooltipProvider delayDuration={500}>
      <input
        ref={fileInputRef}
        accept={ACCEPTED_FILE_TYPES}
        style={{ display: 'none' }}
        type="file"
        multiple
        onChange={handleFileChange}
      />
      <Select value={selectValue} onValueChange={handleModeChange}>
        <Tooltip>
          <TooltipTrigger asChild>
            <SelectTrigger
              aria-label="Switch Chat Mode"
              className={cn(
                "border-none shadow-none bg-transparent",
                "hover:bg-[var(--text)]/10",
                "hover:rounded-full",
                "text-foreground",
                "px-2 h-9 w-fit",
                "gap-0",
                "not-focus-visible",
                "[&>svg]:hidden",
              )}
            >
              <span>
                <Plus className="text-[var(--text)]" size={20} />
              </span>
            </SelectTrigger>
          </TooltipTrigger>
          <TooltipContent
            className="bg-secondary/50 text-foreground"
            side="top"
          >
            <p>Switch Chat Mode (Ctrl+M)</p>
          </TooltipContent>
        </Tooltip>

        <SelectContent
          align="end"
          className={cn(
            "bg-[var(--bg)] text-[var(--text)] border border-[var(--text)]/20 font-semibold rounded-md shadow-lg",
            "min-w-[80px] z-50",
          )}
          sideOffset={5}
        >
          {CHAT_MODE_OPTIONS.map(option => (
            <SelectItem
              key={option.value}
              className={cn(
                "text-[var(--text)]",
                "hover:brightness-95 focus:bg-[var(--active)] focus:text-[var(--active-foreground)]",
              )}
              value={option.value}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </TooltipProvider>
  );
}
