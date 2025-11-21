import * as React from "react"
import AutosizeTextarea, { TextareaAutosizeProps } from "react-textarea-autosize"

import { cn } from "@/src/background/util"

type Style = {
  height?: number;
  [key: string]: any;
}

export interface TextareaProps extends Omit<React.ComponentProps<"textarea">, 'style'> {
  autosize?: boolean
  minRows?: number
  maxRows?: number
  style?: Style
  onHeightChange?: TextareaAutosizeProps['onHeightChange']
}

const Textarea = ({
  className,
  autosize = false,
  minRows,
  maxRows,
  style,
  onHeightChange,
  ...props
}: TextareaProps) => {
  const commonClasses = cn(
    "flex w-full rounded-md border border-[var(--text)]/20 bg-[var(--input-background)]",
    "px-3 py-2 text-sm placeholder:text-muted-foreground",
    "transition-all duration-200 ease-in-out",
    "outline-none focus:border-[var(--active)] hover:border-[var(--active)]/70",
    "focus:ring-1 focus:ring-[var(--active)]/30",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "whitespace-pre-wrap break-words",
    "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  );

  if (autosize) {
    return (
      <AutosizeTextarea
        className={cn(
          commonClasses,
          "thin-scrollbar",
          className,
        )}
        maxRows={maxRows}
        minRows={minRows}
        style={style}
        onHeightChange={onHeightChange}
        {...props}
      />
    )
  }

  return (
    <textarea
      className={cn(
        commonClasses,
        "min-h-16 field-sizing-content",
        className,
      )}
      data-slot="textarea-default"
      {...props}
    />
  )
}

export { Textarea }