import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/src/background/util";

// Definition for MessageTemplate moved here as it's specific to these buttons
const MessageTemplate = ({ children, onClick }: { children: React.ReactNode, onClick: () => void }) => (
  <div
    className={cn(
      "bg-[var(--active)] border border-[var(--text)] rounded-[16px] text-[var(--text)]",
      "cursor-pointer flex items-center justify-center",
      "text-md font-extrabold p-0.5 place-items-center relative text-center",
      "w-16 flex-shrink-0",
      "transition-colors duration-200 ease-in-out",
      "hover:bg-[rgba(var(--text-rgb),0.1)]"
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

export const PageActionButtons = ({ onSend, isPageActionsHovering, setIsPageActionsHovering }: PageActionButtonsProps) => {
  return (
    <div
      className={cn(
        "fixed bottom-16 left-1/2 -translate-x-1/2",
        "flex flex-row justify-center",
        "w-fit h-8 z-[2]",
        "transition-all duration-200 ease-in-out",
        isPageActionsHovering ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2.5",
        "bg-transparent px-0 py-0"
      )}
      style={{ backdropFilter: 'blur(10px)' }}
      onMouseEnter={() => setIsPageActionsHovering(true)}
      onMouseLeave={() => setIsPageActionsHovering(false)}
    >
      <div className="flex items-center space-x-6 max-w-full overflow-x-auto px-0">
        <Tooltip>
          <TooltipTrigger>
            <MessageTemplate onClick={() => onSend('Provide the gist without missing important details.')}>
              TLDR
            </MessageTemplate>
          </TooltipTrigger>
          <TooltipContent side="top" className=" text-[var(--text)] border-[var(--text)]/50">
            <p>Quick Summary</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            <MessageTemplate onClick={() => onSend('Extract all key figures, names, locations, and dates mentioned on this page and list them.')}>
              Facts
            </MessageTemplate>
          </TooltipTrigger>
          <TooltipContent side="top" className=" text-[var(--text)] border-[var(--text)]/50">
            <p>Numbers, events, names</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            <MessageTemplate onClick={() => onSend('Find positive developments, achievements, or opportunities mentioned on this page.')}>
              Yay!
            </MessageTemplate>
          </TooltipTrigger>
          <TooltipContent side="top" className=" text-[var(--text)] border-[var(--text)]/50">
            <p>Good news</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger>
            <MessageTemplate onClick={() => onSend('Find concerning issues, risks, or criticisms mentioned on this page.')}>
              Oops
            </MessageTemplate>
          </TooltipTrigger>
          <TooltipContent side="top" className=" text-[var(--text)] border-[var(--text)]/50">
            <p>Bad news</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};
