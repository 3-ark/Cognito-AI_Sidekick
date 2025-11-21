import { useTranslation } from "react-i18next";
import { TbBrowserPlus, TbWorldSearch } from "react-icons/tb";

import type { Config } from '../../types/config';

import { Button } from "@/components/ui/button";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";

const WEB_SEARCH_MODES = [
  { id: 'Google', label: 'Google Search' },
] as const;

interface ActionButtonsProps {
  config: Config;
  updateConfig: (newConfig: Partial<Config>) => void;
}

export const ActionButtons = ({ config, updateConfig }: ActionButtonsProps) => {
  const { t } = useTranslation();

  if (!config) {
    return null;
  }

  return (
    <div className="absolute bottom-full ml-4 flex flex-col gap-2 z-[5] mb-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={t('addWebSearchResultsToLlmContext')}
            className="text-[var(--text)] hover:bg-secondary/70"
            size="icon"
            variant="ghost"
            onClick={() => {
              updateConfig({
                chatMode: 'web',
                webMode: config.webMode || (WEB_SEARCH_MODES[0]?.id as Config['webMode']),
              });
            }}
          >
            <TbWorldSearch />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="bg-[var(--active)]/50 text-[var(--text)] border-[var(--text)]" side="right">
          <p>{t('addWebSearchResultsToLlmContext')}</p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={t('addCurrentWebPageToLlmContext')}
            className="text-[var(--text)] hover:bg-secondary/70"
            size="icon"
            variant="ghost"
            onClick={() => { updateConfig({ chatMode: 'page' }); }}
          >
            <TbBrowserPlus />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="bg-[var(--active)]/50 text-[var(--text)] border-[var(--text)]" side="right">
          <p>{t('addCurrentWebPageToLlmContext')}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
