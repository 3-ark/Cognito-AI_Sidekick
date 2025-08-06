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

function Textarea({
  className,
  autosize = false,
  minRows,
  maxRows,
  style,
  onHeightChange,
  ...props
}: TextareaProps) {
  if (autosize) {
    return (
      <AutosizeTextarea
        minRows={minRows}
        maxRows={maxRows}
        style={style}
        onHeightChange={onHeightChange}
        className={cn(
          "flex w-full placeholder:text-muted-foreground whitespace-pre-wrap break-words",
          "focus-visible:border-ring focus-visible:ring-ring/50",
          "text-sm md:text-sm transition-[color,box-shadow] outline-none focus-visible:ring-[3px]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "thin-scrollbar",
          className
        )}
        {...props}
      />
    )
  }

  return (
    <textarea
      data-slot="textarea-default"
      className={cn(
        "border-[var(--text)]/20 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }