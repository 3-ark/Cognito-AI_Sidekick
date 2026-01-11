import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { cva, type VariantProps } from "class-variance-authority"
import { CheckIcon } from "lucide-react"

import { cn } from "@/src/background/util"

const checkboxVariants = cva(

  // Base styles
  "peer size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: [
          "border-input dark:bg-input/30",
          "data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary",
          "focus-visible:border-ring focus-visible:ring-ring/50",
        ],
        themed: [
          "border-(--text)", // Unchecked border
          "data-[state=checked]:bg-(--active) data-[state=checked]:text-(--text) data-[state=checked]:border-(--active)", // Checked state
          "focus-visible:ring-1 focus-visible:ring-(--active) focus-visible:ring-offset-0 focus-visible:border-(--active)", // Focus state (added focus-visible:border for consistency)
        ],
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export interface CheckboxProps
  extends React.ComponentProps<typeof CheckboxPrimitive.Root>,
    VariantProps<typeof checkboxVariants> {}

const Checkbox = ({
  className,
  variant,
  ...props
}: CheckboxProps) => {
  return (
    <CheckboxPrimitive.Root
      className={cn(checkboxVariants({ variant, className }))}
      data-slot="checkbox"
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className="flex items-center justify-center text-current transition-none"
        data-slot="checkbox-indicator"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox, checkboxVariants }
