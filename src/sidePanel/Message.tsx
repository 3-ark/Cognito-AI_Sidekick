import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { FiCheck, FiX } from 'react-icons/fi';
import Markdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkSupersub from 'remark-supersub';

import 'katex/dist/katex.min.css';
import type { MessageTurn, RetrieverResult } from '../types/chatTypes';
import type { Config } from '../types/config';

import { useConfig } from './ConfigContext';

import '../content/index.css';

import { markdownComponents } from '@/components/MarkdownComponents';
import { Button } from "@/components/ui/button";
import { CodeBlock, CodeBlockCopyButton } from '@/components/ui/code-block';
import type { ReactElement, ReactNode } from 'react';
import { Children } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/src/background/util";
import { remarkCitation } from '../remark/remark-citation.mjs';

const getMarkdownPlugins = (config: Config) => {
  const remarkPlugins: any[] = [[remarkGfm, { singleTilde: false }], remarkSupersub, remarkCitation];
  const rehypePlugins: any[] = [];

  if (config.latexEnabled) {
    remarkPlugins.push([remarkMath, { singleDollarTextMath: false }]);
    rehypePlugins.push(rehypeKatex);
  }

  return { remarkPlugins, rehypePlugins };
};

const ThinkingBlock = ({ content }: { content: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { config } = useConfig();
  const { remarkPlugins, rehypePlugins } = getMarkdownPlugins(config);

  return (
    <div className="mb-2">
      <Collapsible className="w-full" open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            className={cn(
              "border-[var(--text)]/20 text-foreground hover:text-accent-foreground",
            )}
            size="sm"
            variant="outline"
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
              "text-muted-foreground",
            )}
          >
            <div className="markdown-body">
              <Markdown
                components={createMessageMarkdownComponents()}
                remarkPlugins={remarkPlugins}
                rehypePlugins={rehypePlugins}
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

import ChannelNames from '../types/ChannelNames';

const Citation: FC<any> = ({ node, retrieverResults, ...props }) => {
  const citationNumber = parseInt(node.value, 10);
  const source = retrieverResults?.results[citationNumber - 1];

  if (!source) {
    return <sup {...props}>{`[${citationNumber}]`}</sup>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <sup className="cursor-pointer text-blue-500" {...props}>{`[${citationNumber}]`}</sup>
        </TooltipTrigger>
        <TooltipContent>
          <div className="p-2 text-xs">
            <p className="font-bold">Source {citationNumber}: {source.parentTitle || 'Untitled'}</p>
            <p className="truncate"><span className="font-semibold">Content:</span> {source.content}</p>
            <p><span className="font-semibold">Score:</span> {source.score.toFixed(2)}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const SourcesDisplay: FC<{ retrieverResults: RetrieverResult; onLoadChat: (conversation: Conversation) => void; }> = ({ retrieverResults, onLoadChat }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleSourceClick = (result: any) => {
    if (result.originalType === 'note' || result.originalType === 'json') {
      chrome.runtime.sendMessage({ type: ChannelNames.GET_NOTE_REQUEST, payload: { noteId: result.parentId } }, response => {
        if (response.success) {
          chrome.runtime.sendMessage({ type: 'OPEN_NOTE_IN_NEW_TAB', payload: { note: response.note } });
        }
      });
    } else if (result.originalType === 'chat') {
        chrome.runtime.sendMessage({ type: ChannelNames.GET_CONVERSATION_REQUEST, payload: { conversationId: result.parentId } }, response => {
            if (response.success) {
                onLoadChat(response.conversation);
            }
        });
    }
  };

  if (!retrieverResults || retrieverResults.results.length === 0) {
    return null;
  }

  return (
    <div className="mt-2">
      <Collapsible className="w-full" open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            className="border-[var(--text)]/20 text-foreground hover:text-accent-foreground"
            size="sm"
            variant="outline"
          >
            {isOpen ? 'Hide Sources' : `Show Sources (${retrieverResults.results.length})`}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-2 mt-2 rounded-md border border-dashed bg-muted border-muted-foreground text-muted-foreground">
            <div className="space-y-2">
              {retrieverResults.results.map((result, index) => (
                <div key={index} className="text-xs p-2 bg-background rounded-md cursor-pointer hover:bg-accent" onClick={() => handleSourceClick(result)}>
                  <p className="font-bold">
                    Source {index + 1}: {result.parentTitle || 'Untitled'}
                  </p>
                  <p className="truncate">
                    <span className="font-semibold">Content:</span> {result.content}
                  </p>
                  <p>
                    <span className="font-semibold">Score:</span> {result.score.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

const MessagePre = (props: React.ComponentPropsWithoutRef<'pre'>) => {
  const { children } = props;

  // The `pre` tag rendered by `react-markdown` has a single `code` child element.
  const codeElement = Children.only(children) as ReactElement<{
    className?: string;
    children?: ReactNode;
  }> | null;

  if (!codeElement) {
    return <pre {...props} />;
  }

  // The language is part of the `code` element's class name (e.g., "language-javascript").
  const language = codeElement.props.className?.replace('language-', '') || '';

  // The actual code content is the child of the `code` element.
  const code = codeElement.props.children ? String(codeElement.props.children).trim() : '';

  return (
    <CodeBlock code={code} language={language} showLineNumbers wrapLines>
      <CodeBlockCopyButton />
    </CodeBlock>
  );
};

const createMessageMarkdownComponents = (retrieverResults?: RetrieverResult) => ({
  ...markdownComponents,
  pre: MessagePre,
  citation: (props: any) => <Citation {...props} retrieverResults={retrieverResults} />,
});

import { Conversation } from '../types/chatTypes';

interface MessageProps {
  turn: MessageTurn;
  index: number;
  isEditing: boolean;
  editText: string;
  onStartEdit: (index: number, currentContent: string) => void;
  onSetEditText: (text: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (messageId: string) => void;
  onContinue: (messageId: string) => void;
  onLoadChat: (conversation: Conversation) => void;
}

export const EditableMessage: FC<MessageProps> = ({
  turn, index, isEditing, editText, onStartEdit, onSetEditText, onSaveEdit, onCancelEdit, onDelete, onContinue, onLoadChat
}) => {
  const { config } = useConfig();
  const { remarkPlugins, rehypePlugins } = getMarkdownPlugins(config);

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
        : turn.role === 'assistant'
        ? ''
        : [
            "border rounded-xl max-w-[95%] w-fit shadow-md text-left relative",
            !isEditing && "px-3 py-1", 

            'bg-gradient-to-br from-primary/60 to-primary/30 border-[var(--active)]/20 rounded-br-none',
            'chatMessage',
          ],
      )}
    >
      {isEditing ? (
        <div className="flex flex-col space-y-2 items-stretch p-1">
          <Textarea
            className={cn(
              "rounded-md border bg-background p-1 text-base ring-offset-background placeholder:text-muted-foreground",
              "border-input",
              "text-foreground",
              "hover:border-primary focus-visible:border-primary focus-visible:ring-0",
              "min-h-[60px]",
              "w-full",
            )} 
            minRows={3}
            placeholder="Edit your message..."
            value={editText}
            autoFocus
            autosize
            onChange={e => onSetEditText(e.target.value)}
          />
          <div className="flex font-mono justify-end space-x-2">
            <Button
              size="sm"
              title="Save changes"
              variant="outline"
              onClick={onSaveEdit}
            >
              <FiCheck className="h-4 w-4 mr-1" /> Save
            </Button>
            <Button
              size="sm"
              title="Discard changes"
              variant="outline"
              onClick={onCancelEdit}
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
                  <Markdown components={createMessageMarkdownComponents(turn.retrieverResults)} remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
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
                      components={createMessageMarkdownComponents(turn.retrieverResults)}
                      remarkPlugins={remarkPlugins}
                      rehypePlugins={rehypePlugins}
                    >{part}</Markdown>
                    </div>
                  );
                }

                return null;
              })}
            </>
          )}
          {/* ToolCallBlock hidden from UI */}
          {turn.role === 'assistant' && turn.retrieverResults && (
            <SourcesDisplay retrieverResults={turn.retrieverResults} onLoadChat={onLoadChat} />
          )}
        </div>
      )}
    </div>
  );
};

const COLLAPSIBLE_TOOLS: Record<string, string> = {
  fetcher: 'Fetched Content',
  web_search: 'Search Results',
  browse_page: 'Browsed Page Content',

};

const ToolDisplay: FC<{ turn: MessageTurn }> = ({ turn }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { config } = useConfig();
  const { remarkPlugins, rehypePlugins } = getMarkdownPlugins(config);

  if (turn.name && turn.name in COLLAPSIBLE_TOOLS) {
    const toolName = COLLAPSIBLE_TOOLS[turn.name];

    return (
      <div className="my-2">
        <Collapsible className="w-full flex flex-col items-center" open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button
              className={cn(
                "rounded-xl",
                "border-[var(--text)]/20",
                "bg-text-foreground hover:text-accent-foreground",
              )}
              size="sm"
              variant="outline"
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
                "text-muted-foreground",
              )}
            >
              <div className="markdown-body">
                <Markdown
                  components={createMessageMarkdownComponents()}
                  remarkPlugins={remarkPlugins}
                  rehypePlugins={rehypePlugins}
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
      <Markdown components={createMessageMarkdownComponents()} remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
        {turn.content || ''}
      </Markdown>
    </div>
  );
};
