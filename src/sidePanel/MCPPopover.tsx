import * as React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { FiTool } from "react-icons/fi";
import { cn } from "@/src/background/util";

export const MCPPopover: React.FC = () => {
  const [tools, setTools] = React.useState<any[]>([]);

  React.useEffect(() => {
    // Fetch tools from the background script
  }, []);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "flex-1 text-[var(--text)] rounded-xl shadow-md justify-start pl-4 font-medium h-8 text-xs px-3 py-1",
            "bg-[rgba(255,250,240,0.4)] dark:bg-[rgba(255,255,255,0.1)]",
            "border-[var(--text)]/20",
            "font-['Space_Mono',_monospace]",
            "hover:border-[var(--active)] hover:brightness-98 active:bg-[var(--active)] active:brightness-95",
            "focus:ring-1 focus:ring-[var(--active)]"
          )}
        >
          <FiTool className="mr-2 h-4 w-4" />
          MCP Tools
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">MCP Tools</h4>
            <p className="text-sm text-muted-foreground">
              Available tools from connected MCP servers.
            </p>
          </div>
          <div className="grid gap-2">
            {tools.map((tool) => (
              <div key={tool.name} className="grid grid-cols-3 items-center gap-4">
                <span className="col-span-2">{tool.name}</span>
                <Button size="sm" onClick={() => console.log('call tool', tool.name)}>Call</Button>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
