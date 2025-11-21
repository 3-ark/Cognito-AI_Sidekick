import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

import { cn } from "@/src/background/util"

const ScrollArea = ({
  className,
  children,
  viewportRef,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & { viewportRef?: React.Ref<HTMLDivElement> }) => {
  return (
    <ScrollAreaPrimitive.Root
      className={cn("relative", className)} 
      data-slot="scroll-area" 
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        className={cn(
          "size-full rounded-[inherit]",
          "focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-none",
          "[&>div]:!border-b-0",
          "pb-px pr-px", 
        )}
        data-slot="scroll-area-viewport"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar orientation="vertical" />  
      <ScrollBar orientation="horizontal" /> 
      <ScrollAreaPrimitive.Corner /> 
    </ScrollAreaPrimitive.Root>
  )
}

const ScrollBar = ({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) => {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      className={cn(
        "flex touch-none select-none transition-colors",
        orientation === "vertical" && "h-full w-px",
        orientation === "horizontal" && "h-px w-full border-b-0 bg-transparent shadow-none min-h-0",
        className,
      )}
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        className="relative flex-1 rounded-sm" 
        data-slot="scroll-area-thumb"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

export { ScrollArea, ScrollBar }