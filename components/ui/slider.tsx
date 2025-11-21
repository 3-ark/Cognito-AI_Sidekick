import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/src/background/util"

const sliderVariants = cva(

  // Base styles
  "relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
  {
    variants: {
      variant: {
        default: [
          "[&>span[data-slot=slider-track]]:bg-secondary",
          "[&>span[data-slot=slider-track]>span[data-slot=slider-range]]:bg-primary",
          "[&>button[data-slot=slider-thumb]]:bg-background",
          "[&>button[data-slot=slider-thumb]]:border-primary", // Changed from border-primary/50
          "[&>button[data-slot=slider-thumb]]:ring-offset-background",
          "[&>button[data-slot=slider-thumb]]:focus-visible:ring-ring",
        ],
        themed: [
          // Themed Track, Range, Thumb styles
          "[&>span[data-slot=slider-track]]:bg-[var(--text)]/10",
          "[&>span[data-slot=slider-track]>span[data-slot=slider-range]]:bg-[var(--active)]",
          "[&>button[data-slot=slider-thumb]]:bg-[var(--active)]",
          "[&>button[data-slot=slider-thumb]]:border-[var(--text)]/50",
          "[&>button[data-slot=slider-thumb]]:ring-offset-[var(--bg)]",
          "[&>button[data-slot=slider-thumb]]:focus-visible:ring-[var(--active)]",
        ],
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export interface SliderProps
  extends React.ComponentProps<typeof SliderPrimitive.Root>,
    VariantProps<typeof sliderVariants> {}

const Slider = ({
  className,
  variant,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: SliderProps) => {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min],
  );

  return (
    <SliderPrimitive.Root
      className={cn(sliderVariants({ variant, className }))}
      data-slot="slider"
      defaultValue={defaultValue}
      max={max}
      min={min}
      value={value}
      {...props}
    >
      <SliderPrimitive.Track
        className={cn(
          "relative h-1.5 w-full grow overflow-hidden rounded-full",
          "data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5",
        )}
        data-slot="slider-track"
      >
        <SliderPrimitive.Range
          className={cn(
            "absolute h-full",
            "data-[orientation=vertical]:w-full",
          )}
          data-slot="slider-range"
        />
      </SliderPrimitive.Track>
      {(_values.length > 0 ? _values : [min]).map((_, index) => (
        <SliderPrimitive.Thumb
          key={index}
          className={cn(
            "block h-4 w-4 bg-white rounded-full border border-primary/50 shadow-sm transition-colors focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50",
          )}
          data-slot="slider-thumb"
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider, sliderVariants }