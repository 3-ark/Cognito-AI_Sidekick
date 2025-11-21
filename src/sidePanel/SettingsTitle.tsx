import type { ReactNode } from 'react';

import { cn } from "@/src/background/util";

interface SettingTitleProps {
  text?: string;
  widget?: ReactNode;
  icon?: ReactNode;
}

export const SettingTitle = ({
 text = '', widget = <></>, icon = '',
}: SettingTitleProps) => (
  (<div className="flex items-center justify-between w-full">
    <div className="flex items-center">
      {icon && (
        (<span
          className={cn(
            "text-foreground", 
            "text-xl",
            "leading-none",   
            "mr-3",            
          )}
        >
          {icon}
        </span>)
      )}
      <span
        className={cn(
          "text-foreground",
          "opacity-90",
          "font-['Space_Mono',_monospace]",
          "text-base",
          "font-bold",
        )}
      >
        {text}
      </span>
    </div>
    {widget && (
      <div className="ml-2">
        {widget}
      </div>
    )}
  </div>)
);
