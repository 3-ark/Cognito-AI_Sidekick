import type { ComponentPropsWithoutRef, ReactElement, ReactNode, HTMLAttributes } from 'react';
import { Children, useState } from 'react';
import { FiCopy, FiCheck } from 'react-icons/fi';
import { Button } from "@/components/ui/button";
import { cn } from "@/src/background/util";

// Type definitions
export type ListProps = {
  children?: ReactNode;
  ordered?: boolean;
} & HTMLAttributes<HTMLUListElement | HTMLOListElement>;

export type ParagraphProps = { children?: ReactNode } & HTMLAttributes<HTMLParagraphElement>;

export type CustomPreProps = ComponentPropsWithoutRef<'pre'> & {
  wrapperClassName?: string;
  buttonVariant?: ComponentPropsWithoutRef<typeof Button>['variant'];
  buttonClassName?: string;
};

export type CustomCodeProps = ComponentPropsWithoutRef<'code'> & {
  inline?: boolean;
};

export type AnchorProps = { children?: ReactNode; href?: string } & HTMLAttributes<HTMLAnchorElement>;
export type HeadingProps = { children?: ReactNode } & HTMLAttributes<HTMLHeadingElement>;
export type StrongProps = { children?: ReactNode } & HTMLAttributes<HTMLElement>;
export type EmProps = { children?: ReactNode } & HTMLAttributes<HTMLElement>;
export type TableProps = { children?: ReactNode } & HTMLAttributes<HTMLTableElement>;
export type THeadProps = { children?: ReactNode } & HTMLAttributes<HTMLTableSectionElement>;
export type TBodyProps = { children?: ReactNode } & HTMLAttributes<HTMLTableSectionElement>;
export type TrProps = { children?: ReactNode } & HTMLAttributes<HTMLTableRowElement>;
export type ThProps = { children?: ReactNode } & HTMLAttributes<HTMLTableCellElement>;
export type TdProps = { children?: ReactNode } & HTMLAttributes<HTMLTableCellElement>;
export type BlockquoteProps = { children?: ReactNode } & HTMLAttributes<HTMLElement>;

// Component implementations
export const Ul = ({ children, className, ...rest }: ListProps) => (
  <ul className={cn("list-disc pl-5 my-2", className)} {...rest}>{children}</ul>
);

export const Ol = ({ children, className, ...rest }: ListProps) => (
  <ol className={cn("list-decimal pl-5 my-2", className)} {...rest}>{children}</ol>
);

export const P = ({ children, className, ...rest }: ParagraphProps) => (
  <p className={cn("mb-0", className)} {...rest}>{children}</p>
);

export const Pre = (props: CustomPreProps) => {
  const {
    children,
    className: preTagClassName,
    wrapperClassName,
    buttonVariant = "ghost",
    buttonClassName,
    ...restPreProps
  } = props;

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
      navigator.clipboard.writeText(codeString);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div
      className={cn("relative my-4", wrapperClassName)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <pre
        className={cn("p-3 rounded-md overflow-x-auto thin-scrollbar", preTagClassName)}
        {...restPreProps}
      >
        {children}
      </pre>
      {codeString && (
        <Button
          variant={buttonVariant}
          size="sm"
          aria-label={copied ? "Copied!" : "Copy code"}
          title={copied ? "Copied!" : "Copy code"}
          className={cn(
            "absolute right-2 top-2 h-8 w-8 p-0",
            "transition-opacity duration-200",
            (hovered || copied) ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
            buttonClassName
          )}
          onClick={copyToClipboard}
        >
          {copied ? <FiCheck className="h-4 w-4" /> : <FiCopy className="h-4 w-4" />}
        </Button>
      )}
    </div>
  );
};

export const Code = (props: CustomCodeProps) => {
  const { children, className, inline, ...restCodeProps } = props;
  if (inline) {
    return (
      <code
        className={cn("px-1 py-0.5 rounded-sm bg-[var(--code-inline-bg)] text-[var(--code-inline-text)] text-sm", className)}
        {...restCodeProps}
      >
        {children}
      </code>
    );
  }
  return (
    <code className={cn("font-mono text-sm", className)} {...restCodeProps}>
      {children}
    </code>
  );
};

export const A = ({ children, href, className, ...rest }: AnchorProps) => (
  <a
    href={href}
    className={cn("text-[var(--link)] hover:underline", className)}
    target="_blank"
    rel="noopener noreferrer"
    {...rest}
  >
    {children}
  </a>
);

export const H1 = ({ children, className, ...rest }: HeadingProps) => (
  <h1 className={cn("text-2xl font-bold mt-4 mb-2 border-b pb-1 border-[var(--border)]", className)} {...rest}>{children}</h1>
);

export const H2 = ({ children, className, ...rest }: HeadingProps) => (
  <h2 className={cn("text-xl font-semibold mt-3 mb-1 border-b pb-1 border-[var(--border)]", className)} {...rest}>{children}</h2>
);

export const H3 = ({ children, className, ...rest }: HeadingProps) => (
  <h3 className={cn("text-lg font-semibold mt-2 mb-1 border-b pb-1 border-[var(--border)]", className)} {...rest}>{children}</h3>
);

export const Strong = ({ children, className, ...rest }: StrongProps) => (
  <strong className={cn("font-bold", className)} {...rest}>{children}</strong>
);

export const Em = ({ children, className, ...rest }: EmProps) => (
  <em className={cn("italic", className)} {...rest}>{children}</em>
);

export const Table = ({ children, className, ...rest }: TableProps) => (
  <div className="markdown-table-wrapper my-2 overflow-x-auto">
    <table className={cn("w-full border-collapse border border-[var(--border)]", className)} {...rest}>{children}</table>
  </div>
);

export const THead = ({ children, className, ...rest }: THeadProps) => (
  <thead className={cn("bg-[var(--muted)]", className)} {...rest}>{children}</thead>
);

export const TBody = ({ children, className, ...rest }: TBodyProps) => (
  <tbody className={cn(className)} {...rest}>{children}</tbody>
);

export const Tr = (props: TrProps) => (
  <tr className={cn("border-b border-[var(--border)] even:bg-[var(--muted)]/50", props.className)} {...props} />
);

export const Th = ({ children, className, ...rest }: ThProps) => (
  <th className={cn("p-2 border border-[var(--border)] text-left font-semibold", className)} {...rest}>{children}</th>
);

export const Td = ({ children, className, ...rest }: TdProps) => (
  <td className={cn("p-2 border border-[var(--border)]", className)} {...rest}>{children}</td>
);

export const Blockquote = ({ children, className, ...rest }: BlockquoteProps) => (
  <blockquote className={cn("pl-4 italic border-l-4 border-[var(--border)] my-2 text-[var(--muted-foreground)]", className)} {...rest}>
    {children}
  </blockquote>
);

export const markdownComponents = {
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