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
