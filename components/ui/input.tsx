import * as React from "react"
import { cn } from "@/src/background/util"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  const [isFocused, setIsFocused] = React.useState(false);

  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground flex h-8 w-full min-w-0 bg-transparent px-3 py-1 text-sm transition-[color,box-shadow,border-color] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring",
        "text-[var(--text)] px-2.5",
        "focus:border-[var(--active)] dark:focus:border-0 focus:ring-1 focus:ring-[var(--active)] focus:ring-offset-0",
        "hover:border-[var(--active)] dark:hover:border-0",
        "bg-[var(--input-background)]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        "shadow-[var(--input-base-shadow)]",
        className,
        isFocused && "input-breathing"
      )}
      onFocus={e => {
        setIsFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={e => {
        setIsFocused(false);
        props.onBlur?.(e);
      }}
      {...props}
    />
  )
}

export { Input }
