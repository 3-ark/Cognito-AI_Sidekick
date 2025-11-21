import { FC } from 'react';
import { X } from 'lucide-react';

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/src/background/util";

interface ContextIndicatorProps {
  context: string;
  onClear: () => void;
}

export const ContextIndicator: FC<ContextIndicatorProps> = ({ context, onClear }) => {
  if (!context) {
    return null;
  }

  return (
    <div className="sticky top-0 z-10 bg-blue-900/50 backdrop-blur-sm text-white p-2 rounded-lg mb-2 text-sm">
      <div className="flex justify-between items-center">
        <p className="font-semibold">Active Context:</p>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className={cn(
                  "p-1 h-auto",
                  "hover:bg-white/20",
                )}
                size="sm"
                variant="ghost"
                onClick={onClear}
              >
                <X size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="bg-secondary/50 text-foreground" side="top">
              Clear Context
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-xs max-h-24 overflow-y-auto thin-scrollbar">
        {context}
      </pre>
    </div>
  );
};
