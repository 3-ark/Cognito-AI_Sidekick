import * as React from 'react';
import { FiList } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toolDefinitions } from '../hooks/toolDefinitions';
import { cn } from '@/src/background/util';

export const ToolList: React.FC = () => {
  const sharedTooltipContentStyle = "bg-[var(--active)]/50 text-[var(--text)] border-[var(--text)]";

  return (
    <Dialog>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={cn(
                  "rounded-full shadow-lg",
                  "bg-[var(--italic)] text-[var(--text)]",
                  "hover:bg-italic/80",
                  "focus:ring-1 focus:ring-[var(--ring)] focus:ring-offset-1 focus:ring-offset-[var(--bg)]",
                  "absolute bottom-4 right-4"
                )}>
                <FiList className="h-5 w-5" />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="left" className={sharedTooltipContentStyle}>
            <p>View Available Tools</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DialogContent className="themedPanel max-w-md bg-[var(--bg)] text-[var(--text)] border-[var(--text)]">
        <DialogHeader>
          <DialogTitle>Available Tools</DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-72 w-full rounded-md border border-[var(--text)]/20 p-2 bg-[var(--bg)]/30">
          <div className="p-4">
            <ul className="space-y-4">
              {toolDefinitions.map((tool) => (
                <li key={tool.function.name}>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <span className="font-mono text-sm font-bold">{tool.function.name}</span>
                      </TooltipTrigger>
                      <TooltipContent side="right" className={sharedTooltipContentStyle}>
                        <p className="max-w-xs">{tool.function.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </li>
              ))}
            </ul>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
