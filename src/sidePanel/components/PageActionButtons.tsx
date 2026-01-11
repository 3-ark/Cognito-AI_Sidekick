import { useTranslation } from "react-i18next";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/src/background/util";

const MessageTemplate = ({ children, onClick }: { children: React.ReactNode, onClick: () => void }) => (
  <div
    className={cn(
      "bg-(--active) border border-(--text) rounded-[16px] text-(--text)",
      "cursor-pointer flex items-center justify-center",
      "text-md font-extrabold p-0.5 place-items-center relative text-center",
      "w-16 flex-shrink-0",
      "transition-colors duration-200 ease-in-out",
      "hover:bg-[rgba(var(--text-rgb),0.1)]",
    )}
    onClick={onClick}
  >
    {children}
  </div>
);

interface PageActionButtonsProps {
  onSend: (message: string) => void;
  isPageActionsHovering: boolean;
  setIsPageActionsHovering: (isHovering: boolean) => void;
}

export const PageActionButtons = ({
  onSend, isPageActionsHovering, setIsPageActionsHovering,
}: PageActionButtonsProps) => {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "absolute bottom-full mb-2 left-1/2 -translate-x-1/2",
        "flex flex-row justify-center",
        "w-fit h-8 z-[2]",
        "transition-all duration-200 ease-in-out",
        isPageActionsHovering ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2.5",
        "bg-transparent px-0 py-0",
      )}
      style={{ backdropFilter: 'blur(10px)' }}
      onMouseEnter={() => setIsPageActionsHovering(true)}
      onMouseLeave={() => setIsPageActionsHovering(false)}
    >
      <div className="flex items-center space-x-6 max-w-full overflow-x-auto px-0">
        <Tooltip>
          <TooltipTrigger>
            <MessageTemplate onClick={() => onSend(t('provideGist'))}>
              {t('tldr')}
            </MessageTemplate>
          </TooltipTrigger>
          <TooltipContent className=" text-(--text) border-(--text)/50" side="top">
            <p>{t('quickSummary')}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            <MessageTemplate onClick={() => onSend(t('extractKeyFigures'))}>
              {t('facts')}
            </MessageTemplate>
          </TooltipTrigger>
          <TooltipContent className=" text-(--text) border-(--text)/50" side="top">
            <p>{t('numbersEventsNames')}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            <MessageTemplate onClick={() => onSend(t('findPositiveDevelopments'))}>
              {t('yay')}
            </MessageTemplate>
          </TooltipTrigger>
          <TooltipContent className=" text-(--text) border-(--text)/50" side="top">
            <p>{t('goodNews')}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            <MessageTemplate onClick={() => onSend(t('findConcerningIssues'))}>
              {t('oops')}
            </MessageTemplate>
          </TooltipTrigger>
          <TooltipContent className=" text-(--text) border-(--text)/50" side="top">
            <p>{t('badNews')}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};
