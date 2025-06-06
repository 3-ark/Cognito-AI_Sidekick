import '../content/index.css';
import type { ComponentPropsWithoutRef, ReactElement, FC } from 'react';
import { Children, HTMLAttributes, ReactNode, useState, useEffect } from 'react';
import Markdown, { Components } from 'react-markdown';
import { FiCopy, FiCheck, FiX } from 'react-icons/fi';
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
import { MessageTurn } from './ChatHistory';

type ListProps = {
  children?: ReactNode;
  ordered?: boolean;
} & HTMLAttributes<HTMLUListElement | HTMLOListElement>;

const Ul = ({ children, className, ...rest }: ListProps) => (
  <ul className={cn(className)} {...rest}>{children}</ul>
);

const Ol = ({ children, className, ...rest }: ListProps) => (
  <ol className={cn(className)} {...rest}>{children}</ol>
);

type ParagraphProps = { children?: ReactNode } & HTMLAttributes<HTMLParagraphElement>;
const P = ({ children, className, ...rest }: ParagraphProps) => (
  <p className={cn(className)} {...rest}>{children}</p>
);
type CustomPreProps = ComponentPropsWithoutRef<'pre'>;

const Pre = (props: CustomPreProps) => {
  const { children, className: preClassName, ...restPreProps } = props;

  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);
  const codeElement = Children.only(children) as ReactElement<any> | null;
  let codeString = '';
  if (codeElement?.props?.children) {
    if (Array.isArray(codeElement.props.children)) {
      codeString = codeElement.props.children.map((child: React.ReactNode) => typeof child === 'string' ? child : '').join('');
    } else {
      codeString = String(codeElement.props.children);
    }
    codeString = codeString.trim(); 
  }

  const copyToClipboard = () => {
    if (codeString) {
      setCopied(true);
      navigator.clipboard.writeText(codeString);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div
      className="relative my-4"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <pre
        className={preClassName}
        {...restPreProps}
      >
      {children}
    </pre>
      {codeString && ( 
          (<Button
            variant="copy-button"
            size="sm"
            aria-label={copied ? "Copied!" : "Copy code"}
            title={copied ? "Copied!" : "Copy code"}
            className={cn(
              "absolute right-2 top-2 h-8 w-8 p-0",
              "transition-opacity duration-200",
              (hovered || copied) ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            )}
            onClick={copyToClipboard}
          >
            {copied ? <FiCheck className="h-4 w-4" /> : <FiCopy className="h-4 w-4" />}
          </Button>)
          )}
    </div>
  );
};

type CustomCodeProps = ComponentPropsWithoutRef<'code'> & {
  inline?: boolean;
};

const Code = (props: CustomCodeProps) => {
  const { children, className, inline, ...restCodeProps } = props;

  if (inline) {
    return (
      <code
        className={cn(className)}
        {...restCodeProps}
      >
        {children}
      </code>
    );
  }
        
  return (
    <code className={cn(className)} {...restCodeProps}>
      {children}
    </code>
  );
};

type AnchorProps = { children?: ReactNode; href?: string } & HTMLAttributes<HTMLAnchorElement>;
const A = ({ children, href, className, ...rest }: AnchorProps) => (
  <a href={href}
    className={cn(className)}
    target="_blank"
    rel="noopener noreferrer"
    {...rest}
  >
    {children}
  </a>
);

type HeadingProps = { children?: ReactNode } & HTMLAttributes<HTMLHeadingElement>;
const H1 = ({ children, className, ...rest }: HeadingProps) => (
  <h1 className={cn(className)} {...rest}>{children}</h1>
);

const H2 = ({ children, className, ...rest }: HeadingProps) => (
  <h2 className={cn(className)} {...rest}>{children}</h2>
);

const H3 = ({ children, className, ...rest }: HeadingProps) => (
  <h3 className={cn(className)} {...rest}>{children}</h3>
);

type StrongProps = { children?: ReactNode } & HTMLAttributes<HTMLElement>;
const Strong = ({ children, className, ...rest }: StrongProps) => (
  <strong className={cn(className)} {...rest}>{children}</strong>
);

type EmProps = { children?: ReactNode } & HTMLAttributes<HTMLElement>;
const Em = ({ children, className, ...rest }: EmProps) => (
  <em className={cn(className)} {...rest}>{children}</em>
);

type TableProps = { children?: ReactNode } & HTMLAttributes<HTMLTableElement>;
const Table = ({ children, className, ...rest }: TableProps) => (
  <table className={cn(className)} {...rest}>{children}</table>
);

type THeadProps = { children?: ReactNode } & HTMLAttributes<HTMLTableSectionElement>;
const THead = ({ children, className, ...rest }: THeadProps) => (
  <thead className={cn(className)} {...rest}>{children}</thead>
);

type TBodyProps = { children?: ReactNode } & HTMLAttributes<HTMLTableSectionElement>;
const TBody = ({ children, className, ...rest }: TBodyProps) => (
  <tbody className={cn(className)} {...rest}>{children}</tbody>
);

type TrProps = { children?: ReactNode } & HTMLAttributes<HTMLTableRowElement>;
const Tr = (props: TrProps) => <tr className={cn(props.className)} {...props} />;

type ThProps = { children?: ReactNode } & HTMLAttributes<HTMLTableCellElement>;
const Th = ({ children, className, ...rest }: ThProps) => (
  <th className={cn(className)} {...rest}>{children}</th>
);

type TdProps = { children?: ReactNode } & HTMLAttributes<HTMLTableCellElement>;
const Td = ({ children, className, ...rest }: TdProps) => (
  <td className={cn(className)} {...rest}>{children}</td>
);

type BlockquoteProps = { children?: ReactNode } & HTMLAttributes<HTMLElement>;
const Blockquote = ({ children, className, ...rest }: BlockquoteProps) => (
  <blockquote className={cn(className)} {...rest}>
    {children}
  </blockquote>
);

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
                remarkPlugins={[remarkGfm]}
                components={{
                  ...markdownComponents,
                }}>{content}</Markdown>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

const markdownComponents: Components = {
  ul: Ul,
  ol: Ol,
  p: P,
  pre: Pre,
  code: Code,
  a: A,
  strong: Strong,
  em: Em,
  h1: H1, 
  h2: H2,
  h3: H3,
  table: Table,
  thead: THead,
  tbody: TBody,
  tr: Tr,
  th: Th,
  td: Td,
  blockquote: Blockquote,
};

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
  const contentToRender = turn.rawContent || '';
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
        "border rounded-2xl text-base font-semibold",
        "w-[calc(100%-2rem)] mx-1 my-2",
        "pb-1 pl-4 pr-4 pt-1", 
        "shadow-lg text-left relative",
        turn.role === 'assistant' ? 'bg-accent border-[var(--text)]/20' : 'bg-primary/10 border-[var(--text)]/20',
        config?.paperTexture ? 'chat-message-bubble' : '',
        'chatMessage', isEditing ? 'editing' : '' 
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
          {turn.role === 'assistant' && turn.webDisplayContent && (
            <div className="message-prefix">
              <Markdown remarkPlugins={[[remarkGfm, { singleTilde: false }], remarkSupersub]} components={markdownComponents}>
                {`~From the Internet~
${turn.webDisplayContent}

---

`}
              </Markdown>
            </div>
          )}
          {parts.map((part, partIndex) => {
            const match = part.match(thinkRegex);
            if (match && match[1]) {
              return <ThinkingBlock key={`think_${partIndex}`} content={match[1]} />;
            } else {
              return (
                <div key={`content_${partIndex}`} className="message-content">
                <Markdown
                  remarkPlugins={[[remarkGfm, { singleTilde: false }], remarkSupersub]}
                  components={markdownComponents}
                >{part}</Markdown>
                </div>
              );
            }
          })}
        </div>
      )}
    </div>
  );
};