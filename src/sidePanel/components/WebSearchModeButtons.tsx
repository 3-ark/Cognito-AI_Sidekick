import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/src/background/util";
import type { Config } from '../../types/config';
import { FaWikipediaW, FaGoogle, FaBrave } from "react-icons/fa6";
import { SiDuckduckgo } from "react-icons/si";
import { TbApi } from "react-icons/tb";

// Definition for WebSearchIconButton moved here
const WebSearchIconButton = ({ children, onClick, isActive, title }: { children: React.ReactNode, onClick: () => void, isActive?: boolean, title: string }) => (
  <Tooltip>
    <TooltipTrigger>
      <div
        className={cn(
          "border rounded-lg text-[var(--text)]",
          "cursor-pointer flex items-center justify-center",
          "p-2 place-items-center relative",
          "w-8 h-8 flex-shrink-0",
          "transition-colors duration-200 ease-in-out",
          isActive
            ? "bg-[var(--active)] text-[var(--text)] border-[var(--active)] hover:brightness-95"
            : "bg-transparent border-[var(--text)]/50 hover:bg-[rgba(var(--text-rgb),0.1)]",
        )}
        onClick={onClick}
        aria-label={title}
      >
        {children}
      </div>
    </TooltipTrigger>
    <TooltipContent side="top" className="bg-[var(--active)]/80 text-[var(--text)] border-[var(--text)]/50">
      <p>{title}</p>
    </TooltipContent>
  </Tooltip>
);

// WEB_SEARCH_MODES definition moved here as it's specific to this component
const WEB_SEARCH_MODES = [
  { id: 'Google', icon: FaGoogle, label: 'Google Search' },
  { id: 'Duckduckgo', icon: SiDuckduckgo, label: 'DuckDuckGo Search' },
  { id: 'Brave', icon: FaBrave, label: 'Brave Search' },
  { id: 'Wikipedia', icon: FaWikipediaW, label: 'Wikipedia Search' },
  { id: 'GoogleCustomSearch', icon: TbApi, label: 'Google API Search' },
] as const;

interface WebSearchModeButtonsProps {
  config: Config;
  updateConfig: (newConfig: Partial<Config>) => void;
  isWebSearchHovering: boolean;
  setIsWebSearchHovering: (isHovering: boolean) => void;
}

export const WebSearchModeButtons = ({ config, updateConfig, isWebSearchHovering, setIsWebSearchHovering }: WebSearchModeButtonsProps) => {
  return (
    <div
      className={cn(
        "fixed bottom-14 left-1/2 -translate-x-1/2",
        "flex flex-row justify-center",
        "w-fit h-10 z-[2]",
        "transition-all duration-200 ease-in-out",
        isWebSearchHovering ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2.5",
        "bg-transparent px-0 py-0"
      )}
      style={{ backdropFilter: 'blur(10px)' }}
      onMouseEnter={() => setIsWebSearchHovering(true)}
      onMouseLeave={() => setIsWebSearchHovering(false)}
    >
      <div className="flex items-center space-x-4 max-w-full overflow-x-auto px-4 py-1">
        {WEB_SEARCH_MODES.map((mode) => (
          <WebSearchIconButton
            key={mode.id}
            onClick={() => {
              updateConfig({ webMode: mode.id as Config['webMode'], chatMode: 'web' });
            }}
            isActive={config.webMode === mode.id}
            title={mode.label}
          >
            <mode.icon size={18} />
          </WebSearchIconButton>
        ))}
      </div>
    </div>
  );
};
