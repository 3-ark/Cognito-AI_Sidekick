import * as React from "react"

import { cn } from "@/src/background/util"

const Input = ({
 className, type, ...props 
}: React.ComponentProps<"input">) => {
  const [isFocused, setIsFocused] = React.useState(false);

  return (
    <input
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground flex h-8 w-full min-w-0 rounded-md bg-transparent px-3 py-1 text-sm transition-[color,box-shadow,border-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "border border-(--text)/20 dark:border-0",
        "focus-visible:border-ring",
        "text-(--text) px-2.5",
        "focus:border-(--active) dark:focus:border-0 focus:ring-1 focus:ring-(--active) focus:ring-offset-0",
        "hover:border-(--active) dark:hover:border-0",
        "bg-[var(--input-background)]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        "shadow-[var(--input-base-shadow)]",
        className,
        isFocused && "input-breathing",
      )}
      data-slot="input"
      type={type}
      onBlur={e => {
        setIsFocused(false);
        props.onBlur?.(e);
      }}
      onFocus={e => {
        setIsFocused(true);
        props.onFocus?.(e);
      }}
      {...props}
    />
  )
}

export { Input }
