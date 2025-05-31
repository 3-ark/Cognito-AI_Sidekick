import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/src/background/util";
import { CHAT_MODE_OPTIONS, ChatMode } from '@/src/types/config';
import { useConfig } from './ConfigContext';

export const AddToChat = () => {
  const { config, updateConfig } = useConfig();

  const currentModeInConfig = config?.chatMode;

  const handleModeChange = (selectedValue: string) => {
    const mode = selectedValue as ChatMode;
    updateConfig({
      chatMode: mode === "chat" ? undefined : mode,
    });
  };

  const selectValue = currentModeInConfig || "chat";

  return (
    <TooltipProvider delayDuration={500}>
      <Select value={selectValue} onValueChange={handleModeChange}>
        <Tooltip>
          <TooltipTrigger asChild>
            <SelectTrigger
              aria-label="Switch Chat Mode"
              className={cn(
                "border-none shadow-none bg-transparent",
                "hover:bg-[var(--text)]/10",
                "hover:rounded-[8px_0_0_8px]", // Adds radius only to left corners
                "text-foreground",
                "px-0 pl-2 h-9 w-fit",
                "gap-0",
                "not-focus-visible",
                "[&>svg]:text-[var(--text)]"
              )}
            >
              {!currentModeInConfig ? (
                <span className="text-sm mr-1 font-bold">Mode</span>
              ) : (
                <span className="text-sm font-bold">{currentModeInConfig}</span>
              )}
            </SelectTrigger>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="bg-secondary/50 text-foreground"
          >
            <p>Switch Chat Mode (Ctrl+M)</p>
          </TooltipContent>
        </Tooltip>

        <SelectContent
          align="end"
          sideOffset={5}
          className={cn(
            "bg-[var(--bg)] text-[var(--text)] border border-[var(--text)]/10 font-semibold rounded-md shadow-lg",
            "min-w-[80px] z-50"
          )}
        >
          {CHAT_MODE_OPTIONS.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className={cn(
                "text-[var(--text)]",
                "hover:brightness-95 focus:bg-[var(--active)] focus:text-[var(--active-foreground)]"
              )}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </TooltipProvider>
  );
}