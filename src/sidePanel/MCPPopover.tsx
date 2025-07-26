import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from "@/components/ui/button";
import { FiTool, FiRefreshCw } from "react-icons/fi";
import { cn } from "@/src/background/util";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from '@/components/ui/scroll-area';

interface MCPTool {
  name: string;
  serverName: string;
  serverUrl: string;
  // Add other tool properties as needed, e.g., description
}

export const MCPPopover: React.FC = () => {
  const [tools, setTools] = React.useState<MCPTool[]>([]);
  const [isOpen, setIsOpen] = React.useState(false);

  const fetchTools = () => {
    chrome.runtime.sendMessage({ type: 'MCP_LIST_TOOLS' }, (response) => {
      if (response) {
        setTools(response);
      }
    });
  };

  React.useEffect(() => {
    if (isOpen) {
      fetchTools();
    }
  }, [isOpen]);

  const groupedTools = React.useMemo(() => {
    return tools.reduce((acc, tool) => {
      const serverKey = `${tool.serverName}`;
      if (!acc[serverKey]) {
        acc[serverKey] = [];
      }
      acc[serverKey].push(tool);
      return acc;
    }, {} as Record<string, MCPTool[]>);
  }, [tools]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTitle></DialogTitle>
      <DialogDescription></DialogDescription>
      <TooltipProvider>
        <div className="flex items-center gap-2 mb-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className={cn(
                    "text-white rounded-sm shadow-md justify-start font-medium h-6 px-2 text-xs",
                    "border-none",
                    "font-['Space_Mono',_monospace]",
                    "hover:brightness-80 active:brightness-90",
                    "focus:ring-1 focus:ring-white/50"
                  )}
                  style={{ backgroundColor: "var(--link)" }}
                >
                  <FiTool className="mr-2 h-4 w-4" />
                  MCP
                </Button>
              </DialogTrigger>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>View Available MCP Tools</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
      <DialogContent className="themedPanel w-[80dvw] max-w-[400px] bg-[var(--bg)] text-[var(--text)] border-[var(--text)]">
        <div className="grid gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <h4 className="font-medium leading-none">MCP Tools</h4>
              <Button variant="ghost" size="xs" onClick={fetchTools}>
                <FiRefreshCw />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Available tools from connected MCP servers.
            </p>
          </div>
          <ScrollArea className="max-h-[60dvh] pr-4">
            <div className="grid gap-4">
              {Object.keys(groupedTools).length > 0 ? (
                Object.entries(groupedTools).map(([serverName, serverTools]) => (
                  <div key={serverName}>
                    <h5 className="font-semibold text-sm mb-2">{serverName}</h5>
                    <div className="grid gap-2 pl-2">
                      {serverTools.map((tool) => (
                        <div key={`${tool.serverUrl}-${tool.name}`} className="flex items-center justify-between gap-4 text-sm">
                          <span>{tool.name}</span>
                          {/* Future: Add a button here to call the tool */}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No tools found or servers connected.</p>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};
