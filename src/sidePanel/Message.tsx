import '../content/index.css';
import type { FC } from 'react';
import { useState, useEffect } from 'react';
import Markdown from 'react-markdown';
import { FiCheck, FiX } from 'react-icons/fi';
import { Textarea } from "@/components/ui/textarea";

import { Button } from "@/components/ui/button";
import { cn } from "@/src/background/util";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import remarkGfm from 'remark-gfm';
import remarkSupersub from 'remark-supersub';

import { useConfig } from './ConfigContext';
import { markdownComponents, Pre } from '@/components/MarkdownComponents';
import type { MessageTurn } from './ChatHistory';

const ThinkingBlock = ({ content }: { content: string }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-2">
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
        <CollapsibleTrigger asChild>
          <Button
            variant="outline" 
            size="sm"
            className={cn(
              "mb-1", 
              "border-foreground text-foreground hover:text-accent-foreground" 
            )}
          >
            {isOpen ? 'Hide Thoughts' : 'Show Thoughts'}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div
            className={cn(
              "p-3 rounded-md border border-dashed",
              "bg-muted",
              "border-muted-foreground",
              "text-muted-foreground" 
            )}
          >
            <div className="markdown-body">
              <Markdown
                remarkPlugins={[[remarkGfm, { singleTilde: false }], remarkSupersub]}
                components={messageMarkdownComponents}
              >
                {content}
              </Markdown>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

const ToolCallBlock = ({ toolCalls }: { toolCalls: MessageTurn['tool_calls'] }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!toolCalls || toolCalls.length === 0) {
    return null;
  }

  const formatArguments = (argsString: string) => {
    try {
      return JSON.stringify(JSON.parse(argsString), null, 2);
    } catch (e) {
      return argsString;
    }
  };

  return (
    <div className="mt-2 mb-1">
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
        <CollapsibleTrigger asChild>
          <Button
            variant="outline"
            size="xs"
            className="mb-1 w-auto px-2.5 border-foreground/30 text-foreground/70 hover:text-accent-foreground text-xs font-normal"
          >
            {isOpen ? 'Hide Tool Call Details' : `Show Tool Call Details (${toolCalls.length})`}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-2 mt-1 rounded-md border border-dashed bg-muted border-gray-400/50 dark:border-gray-600/50 text-muted-foreground text-xs">
            {toolCalls.map((toolCall, index) => (
              <div key={toolCall.id || `tool_call_${index}`} className="mb-2 last:mb-0">
                <p className="font-semibold text-foreground">Tool: {toolCall.function.name}</p>
                <p className="mt-0.5 mb-0.5 font-medium">Arguments:</p>
                <pre className="whitespace-pre-wrap bg-black/5 dark:bg-white/5 p-1.5 rounded text-xs text-foreground/90 overflow-x-auto">
                  <code>{formatArguments(toolCall.function.arguments)}</code>
                </pre>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

const messageMarkdownComponents = {
  ...markdownComponents,
  pre: (props: React.ComponentPropsWithoutRef<typeof Pre>) => <Pre {...props} buttonVariant="copy-button" />,
}

interface MessageProps {
  turn: MessageTurn;
  index: number;
  isEditing: boolean;
  editText: string;
  onStartEdit: (index: number, currentContent: string) => void;
  onSetEditText: (text: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}

export const EditableMessage: FC<MessageProps> = ({
  turn, index, isEditing, editText, onStartEdit, onSetEditText, onSaveEdit, onCancelEdit
}) => {
  const { config } = useConfig();

  const showToolCallBlock = turn.role === 'assistant' && turn.tool_calls && turn.tool_calls.length > 0 && !isEditing;

  let shouldRenderRawContentAsMain = true;
  if (showToolCallBlock) {
    const trimmedRawContent = (turn.rawContent || '').trim();
    if (trimmedRawContent === '') {
      shouldRenderRawContentAsMain = false;
    } else if (
      (trimmedRawContent.startsWith('{') && trimmedRawContent.endsWith('}')) ||
      (trimmedRawContent.startsWith('[') && trimmedRawContent.endsWith(']'))
    ) {
      try {
        JSON.parse(trimmedRawContent);
        shouldRenderRawContentAsMain = false;
      } catch (e) {
        shouldRenderRawContentAsMain = true;
      }
    } else {
      shouldRenderRawContentAsMain = true;
    }
  }

  const contentToRender = shouldRenderRawContentAsMain ? (turn.rawContent || '') : '';
  const parts = contentToRender.split(/(<think>[\s\S]*?<\/think>)/g).filter(part => part && part.trim() !== '');
  const thinkRegex = /<think>([\s\S]*?)<\/think>/;

  useEffect(() => {
    if (!isEditing) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCancelEdit();
      } else if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.metaKey) {
        if (editText.trim()) {
          event.preventDefault();
          event.stopPropagation();
          onSaveEdit();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true); // Use capture phase to potentially override other listeners
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isEditing, onCancelEdit, onSaveEdit, editText]);

  return (
    <div
      className={cn(
        "text-base my-1",
        isEditing ? 'editing' : '',
        config?.paperTexture && turn.role !== 'tool' ? 'chat-message-bubble' : '',
        (config && typeof config.fontSize === 'number' && config.fontSize <= 15 ? 'font-semibold' : ''),

        turn.role === 'tool'
        ? 'tool-turn-message'
        : [
            "border rounded-2xl w-[calc(100%-2rem)] mx-1 pb-1 pl-4 pr-4 pt-1 shadow-lg text-left relative",
            turn.role === 'assistant' ? 'bg-accent border-[var(--text)]/20' : 'bg-primary/10 border-[var(--text)]/20',
            'chatMessage'
          ]
      )}
      onDoubleClick={() => {
        if (!isEditing) {
          onStartEdit(index, turn.rawContent);
        }
      }}
    >
      {isEditing ? (
        <div className="flex flex-col space-y-2 items-stretch w-full p-1">
          <Textarea
            autosize 
            value={editText}
            onChange={(e) => onSetEditText(e.target.value)}
            placeholder="Edit your message..."
            className={cn(
              "w-full rounded-md border bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground",
              "border-input",
              "text-foreground",
              "hover:border-primary focus-visible:border-primary focus-visible:ring-0",
              "min-h-[60px]"
            )}
            minRows={3}
            autoFocus
          />
          <div className="flex font-mono justify-end space-x-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onSaveEdit}
              title="Save changes"
            >
              <FiCheck className="h-4 w-4 mr-1" /> Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onCancelEdit}
              title="Discard changes"
            >
              <FiX className="h-4 w-4 mr-1" /> Exit
            </Button>
          </div>
        </div>
      ) : (
        <div className="message-markdown markdown-body relative z-[1] text-foreground">
          {shouldRenderRawContentAsMain && (
            <>
              {turn.role === 'assistant' && turn.webDisplayContent && (
                <div className="message-prefix">
                  <Markdown remarkPlugins={[[remarkGfm, { singleTilde: false }], remarkSupersub]} components={messageMarkdownComponents}>
                    {`~From the Internet~\n${turn.webDisplayContent}\n\n---\n\n`}
                  </Markdown>
                </div>
              )}
              {parts.map((part, partIndex) => {
                const match = part.match(thinkRegex);
                if (match && match[1]) {
                  return <ThinkingBlock key={`think_${partIndex}`} content={match[1]} />;
                } else if (part.trim() !== '') { 
                  return (
                    <div key={`content_${partIndex}`} className="message-content">
                    <Markdown
                      remarkPlugins={[[remarkGfm, { singleTilde: false }], remarkSupersub]}
                      components={messageMarkdownComponents}
                    >{part}</Markdown>
                    </div>
                  );
                }
                return null;
              })}
            </>
          )}
          {showToolCallBlock && (
            <ToolCallBlock toolCalls={turn.tool_calls} />
          )}
        </div>
      )}
    </div>
  );
};