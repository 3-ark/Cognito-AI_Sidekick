'use client';
import { Button } from '@/components/ui/button';
import { cn } from '@/src/background/util';
import { CheckIcon, CopyIcon } from 'lucide-react';
import type { ComponentProps, HTMLAttributes, ReactNode } from 'react';
import { createContext, useContext, useState, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Custom hook to detect when the dark class is applied to the html element
const useIsDarkTheme = () => {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkTheme = () => {
      const isDarkMode = document.documentElement.classList.contains('dark');
      setIsDark(isDarkMode);
    };

    // Initial check
    checkTheme();

    // Observe class changes on the html element
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      observer.disconnect();
    };
  }, []);

  return isDark;
};


type CodeBlockContextType = {
  code: string;
};
const CodeBlockContext = createContext<CodeBlockContextType>({
  code: '',
});
export type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  code: string;
  language: string;
  showLineNumbers?: boolean;
  wrapLines?: boolean;
  children?: ReactNode;
};
export const CodeBlock = ({
  code,
  language,
  showLineNumbers = false,
  wrapLines = false,
  className,
  children,
  ...props
}: CodeBlockProps) => {
  const isDark = useIsDarkTheme();
  const theme = isDark ? oneDark : oneLight;
  return (
    <CodeBlockContext.Provider value={{ code }}>
      <div
        className={cn('group relative', className)}
        {...props}
      >
        <div className="w-full overflow-auto thin-scrollbar rounded-lg border border-border/20">
          <div>
            <SyntaxHighlighter
              wrapLines={wrapLines}
              lineProps={wrapLines ? { style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all' } } : undefined}
              codeTagProps={{
                className: 'font-mono text-sm',
              }}
              customStyle={{
                margin: 0,
                padding: '0.1rem',
                display: 'table',
                minWidth: '100%',
              }}
              language={language}
              lineNumberStyle={{
                color: 'hsl(var(--muted-foreground))',
                paddingRight: '1rem',
                minWidth: '2.5rem',
                textAlign: 'left',
              }}
              showLineNumbers={showLineNumbers}
              style={theme}
            >
              {code}
            </SyntaxHighlighter>
          </div>
        </div>
        {children && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
            {children}
          </div>
        )}
        </div>
    </CodeBlockContext.Provider>
  );
};

export type CodeBlockCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
};
export const CodeBlockCopyButton = ({
  onCopy,
  onError,
  timeout = 2000,
  children,
  className,
  ...props
}: CodeBlockCopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const { code } = useContext(CodeBlockContext);
  const copyToClipboard = async () => {
    if (typeof window === 'undefined' || !navigator.clipboard.writeText) {
      onError?.(new Error('Clipboard API not available'));
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      onCopy?.();
      setTimeout(() => setIsCopied(false), timeout);
    } catch (error) {
      onError?.(error as Error);
    }
  };
  const Icon = isCopied ? CheckIcon : CopyIcon;
  return (
    <Button
      className={cn('shrink-0', className)}
      variant="ghost"
      onClick={copyToClipboard}
      size="sm"
      {...props}
    >
      {children ?? <Icon />}
    </Button>
  );
};
