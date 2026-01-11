import * as React from 'react';
import { FiList } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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

  return (
    <Dialog>
      <TooltipProvider>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-(--text)/70 font-mono">Browse available tools</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "rounded-sm shadow-md justify-start font-medium h-6 px-2 text-xs",
                    "border-none",
                    "font-['Space_Mono',_monospace]",
                    "hover:brightness-80 active:brightness-90",
                    "focus:ring-1 focus:ring-white/50",
                    "flex items-center gap-1",
                    "bg-[var(--link)] text-white"
                  )}
                  style={{ minWidth: 0 }}
                >
                  <FiList className="h-3 w-3 mr-1" />
                  Tools
                </Button>
              </DialogTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>View Available Tools</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
      <DialogContent className="themedPanel w-[80dvw] max-w-[300px] bg-(--bg) text-(--text) border-(--text)">
        <DialogHeader>
          <DialogTitle>Available Tools</DialogTitle>
          <DialogDescription className="text-xs text-(--text)/70">
            These tools can be used by the AI to help answer your questions or perform actions.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-72 w-full rounded-md border border-(--text)/20 p-2 bg-(--bg)/30">
          <div className="p-4">
            <ul className="space-y-4">
              {toolDefinitions.map((tool) => (
                <li key={tool.function.name}>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <span className="font-mono text-sm font-bold">{tool.function.name}</span>
                      </TooltipTrigger>
                      <TooltipContent side="right">
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
