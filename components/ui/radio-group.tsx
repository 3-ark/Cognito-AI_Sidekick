import * as React from "react"
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
import { cva, type VariantProps } from "class-variance-authority"
import { CircleIcon } from "lucide-react"

import { cn } from "src/background/util"

const RadioGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) => {
  return (
    <RadioGroupPrimitive.Root
      className={cn("grid gap-3", className)}
      data-slot="radio-group"
      {...props}
    />
  )
}

const radioGroupItemVariants = cva(
  "aspect-square size-4 shrink-0 rounded-full border shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: [
          "border-input dark:bg-input/30 text-primary focus-visible:border-ring focus-visible:ring-ring/50",
        ],
        themed: [
          "border-[var(--text)] text-[var(--active)]", // Base border and text (for icon)
          "focus-visible:ring-1 focus-visible:ring-[var(--active)] focus-visible:ring-offset-0 focus-visible:border-[var(--active)]", // Themed focus
          "data-[state=checked]:border-[var(--active)]", // Themed checked border
        ],
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export interface RadioGroupItemProps
  extends React.ComponentProps<typeof RadioGroupPrimitive.Item>,
    VariantProps<typeof radioGroupItemVariants> {}

const RadioGroupItem = ({
  className,
  variant, // Add variant prop
  ...props
}: RadioGroupItemProps) => {
  return (
    <RadioGroupPrimitive.Item
      className={cn(radioGroupItemVariants({ variant, className }))}
      data-slot="radio-group-item"
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        className="relative flex items-center justify-center"
        data-slot="radio-group-indicator"
      >
        {/* Conditional fill for CircleIcon based on variant */}
        <CircleIcon className={cn(
          "absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2",
          variant === "themed" ? "fill-[var(--active)]" : "fill-primary",
        )} />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
}

export {
 RadioGroup, RadioGroupItem, radioGroupItemVariants, 
}
