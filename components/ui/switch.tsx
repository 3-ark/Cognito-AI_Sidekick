import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "@/src/background/util"

const Switch = ({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) => {
  return (
    <SwitchPrimitive.Root
      className={cn(

        // Track: thin and elegant
        "peer relative inline-flex h-[10px] w-[26px] shrink-0 cursor-pointer items-center rounded-full bg-input transition-colors duration-200 data-[state=checked]:bg-primary data-[state=unchecked]:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      data-slot="switch"
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
                    "pointer-events-none block size-4 rounded-full shadow-md ring-1 transition-transform duration-200 ease-in-out transform",
                    "data-[state=checked]:translate-x-[12px] data-[state=checked]:bg-white data-[state=checked]:ring-primary/50",
                    "data-[state=unchecked]:translate-x-[0px] data-[state=unchecked]:bg-primary data-[state=unchecked]:ring-primary-foreground/50",
        )}
       data-slot="switch-thumb"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
