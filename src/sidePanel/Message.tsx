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
import type { MessageTurn } from '../background/chatHistoryStorage';

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

  let shouldRendercontentAsMain = true;
  if (showToolCallBlock) {
    const trimmedcontent = (turn.content || '').trim();
    if (trimmedcontent === '') {
      shouldRendercontentAsMain = false;
    } else if (
      (trimmedcontent.startsWith('{') && trimmedcontent.endsWith('}')) ||
      (trimmedcontent.startsWith('[') && trimmedcontent.endsWith(']'))
    ) {
      try {
        JSON.parse(trimmedcontent);
        shouldRendercontentAsMain = false;
      } catch (e) {
        shouldRendercontentAsMain = true;
      }
    } else {
      shouldRendercontentAsMain = true;
    }
  }

  const contentToRender = shouldRendercontentAsMain ? (turn.content || '') : '';
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

    document.addEventListener('keydown', handleKeyDown, true);
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
            "border rounded-xl w-95 shadow-lg text-left relative",
            !isEditing && "px-3 py-1", 

            turn.role === 'assistant' ? 'bg-accent border-[var(--text)]/20' : 'bg-primary/10 border-[var(--text)]/20',
            'chatMessage'
          ]
      )}
      onDoubleClick={() => {
        if (!isEditing && turn.role !== 'tool') {
          onStartEdit(index, turn.content);
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
              "rounded-md border bg-background px-1 text-base ring-offset-background placeholder:text-muted-foreground",
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
      ) : turn.role === 'tool' ? (
        <ToolDisplay turn={turn} />
      ) : (
        <div className="message-markdown markdown-body relative z-[1] text-foreground">
          {shouldRendercontentAsMain && (
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
          {/* ToolCallBlock hidden from UI */}
        </div>
      )}
    </div>
  );
};

const COLLAPSIBLE_TOOLS: Record<string, string> = {
  fetcher: 'Fetched Content',
  web_search: 'Web Search Results',
  smart_dispatcher: 'Smart Dispatcher',
  planner: 'The Plan',
  retriever: 'Retrieved Content',
  wikipedia_search: 'Wikipedia Search Results',
};

const ToolDisplay: FC<{ turn: MessageTurn }> = ({ turn }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { config } = useConfig();

  if (turn.name && turn.name in COLLAPSIBLE_TOOLS) {
    const toolName = COLLAPSIBLE_TOOLS[turn.name];
    return (
      <div className="my-2">
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
              {isOpen ? `Hide ${toolName}` : `Show ${toolName}`}
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
                  {turn.content || ''}
                </Markdown>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  }

  // Fallback for other tools or if turn.name is undefined
  return (
    <div className="message-markdown markdown-body relative z-[1] text-foreground">
      <Markdown remarkPlugins={[[remarkGfm, { singleTilde: false }], remarkSupersub]} components={messageMarkdownComponents}>
        {turn.content || ''}
      </Markdown>
    </div>
  );
};