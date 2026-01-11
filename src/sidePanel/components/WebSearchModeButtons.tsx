import { useTranslation } from "react-i18next";
import {
  FaBrave, FaGoogle, FaWikipediaW,
} from "react-icons/fa6";
import { SiDuckduckgo } from "react-icons/si";
import { TbApi } from "react-icons/tb";

import type { Config } from '../../types/config';

import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/src/background/util";

const WebSearchIconButton = ({
  children, onClick, isActive, title,
}: { children: React.ReactNode, onClick: () => void, isActive?: boolean, title: string }) => (
  <Tooltip>
    <TooltipTrigger>
      <div
        aria-label={title}
        className={cn(
          "border rounded-lg text-(--text)",
          "cursor-pointer flex items-center justify-center",
          "p-2 place-items-center relative",
          "w-8 h-8 flex-shrink-0",
          "transition-colors duration-200 ease-in-out",
          isActive
            ? "bg-(--active) text-(--text) border-(--active) hover:brightness-95"
            : "bg-transparent border-(--text)/50 hover:bg-[rgba(var(--text-rgb),0.1)]",
        )}
        onClick={onClick}
      >
        {children}
      </div>
    </TooltipTrigger>
    <TooltipContent className="bg-(--active)/80 text-(--text) border-(--text)/50" side="top">
      <p>{title}</p>
    </TooltipContent>
  </Tooltip>
);

const WEB_SEARCH_MODES = [
  {
    id: 'Google', icon: FaGoogle, label: 'googleSearch',
  },
  {
    id: 'Duckduckgo', icon: SiDuckduckgo, label: 'duckduckgoSearch',
  },
  {
    id: 'Brave', icon: FaBrave, label: 'braveSearch',
  },
  {
    id: 'Wikipedia', icon: FaWikipediaW, label: 'wikipediaSearch',
  },
  {
    id: 'GoogleCustomSearch', icon: TbApi, label: 'googleApiSearch',
  },
] as const;

interface WebSearchModeButtonsProps {
  config: Config;
  updateConfig: (newConfig: Partial<Config>) => void;
  isWebSearchHovering: boolean;
  setIsWebSearchHovering: (isHovering: boolean) => void;
}

export const WebSearchModeButtons = ({
  config, updateConfig, isWebSearchHovering, setIsWebSearchHovering,
}: WebSearchModeButtonsProps) => {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "absolute bottom-full mb-2 left-1/2 -translate-x-1/2",
        "flex flex-row justify-center",
        "w-fit h-10 z-[2]",
        "transition-all duration-200 ease-in-out",
        isWebSearchHovering ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2.5",
        "bg-transparent px-0 py-0",
      )}
      style={{ backdropFilter: 'blur(10px)' }}
      onMouseEnter={() => setIsWebSearchHovering(true)}
      onMouseLeave={() => setIsWebSearchHovering(false)}
    >
      <div className="flex items-center space-x-4 max-w-full overflow-x-auto px-4 py-1">
        {WEB_SEARCH_MODES.map(mode => (
          <WebSearchIconButton
            key={mode.id}
            isActive={config.webMode === mode.id}
            title={t(mode.label)}
            onClick={() => {
              updateConfig({ webMode: mode.id as Config['webMode'], chatMode: 'web' });
            }}
          >
            <mode.icon size={18} />
          </WebSearchIconButton>
        ))}
      </div>
    </div>
  );
};
