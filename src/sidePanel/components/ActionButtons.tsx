import { TbWorldSearch, TbBrowserPlus } from "react-icons/tb";
import { BiBrain } from "react-icons/bi";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/src/background/util";
import type { Config } from '../../types/config';

// Assuming WEB_SEARCH_MODES might be needed if actions are expanded, or could be passed if specific default is required.
// For now, it's not directly used but kept for context awareness from original Cognito.tsx
const WEB_SEARCH_MODES = [
  { id: 'Google', label: 'Google Search' },
  // ... other modes if they were relevant to default webMode selection
] as const;


interface ActionButtonsProps {
  config: Config;
  updateConfig: (newConfig: Partial<Config>) => void;
}

export const ActionButtons = ({ config, updateConfig }: ActionButtonsProps) => {
  if (!config) {
    return null; // Or some loading/error state if config is essential and not loaded
  }

  return (
    <div className="fixed bottom-20 left-8 flex flex-col gap-2 z-[5]">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label="Add Web Search Results to LLM Context"
            variant="ghost"
            size="icon"
            onClick={() => {
              updateConfig({
                chatMode: 'web',
                // Ensure a default webMode is set if not already present.
                // This part might need adjustment based on how WEB_SEARCH_MODES is defined and used globally.
                webMode: config.webMode || (WEB_SEARCH_MODES[0]?.id as Config['webMode'])
              });
            }}
            className="text-[var(--text)] hover:bg-secondary/70"
          >
            <TbWorldSearch />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" className="bg-[var(--active)]/50 text-[var(--text)] border-[var(--text)]">
          <p>Add Web Search Results to LLM Context</p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label="Add Current Web Page to LLM Context"
            variant="ghost"
            size="icon"
            onClick={() => { updateConfig({ chatMode: 'page' }); }}
            className="text-[var(--text)] hover:bg-secondary/70"
          >
            <TbBrowserPlus />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" className="bg-[var(--active)]/50 text-[var(--text)] border-[var(--text)]">
          <p>Add Current Web Page to LLM Context</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
