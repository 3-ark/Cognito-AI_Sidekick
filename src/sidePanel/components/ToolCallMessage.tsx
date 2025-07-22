import type { FC } from 'react';
import { MessageTurn } from '../../background/chatHistoryStorage';
import { cn } from "@/src/background/util";

interface ToolCallMessageProps {
  turn: MessageTurn;
}

export const ToolCallMessage: FC<ToolCallMessageProps> = ({ turn }) => {
  const toolName = turn.tool_calls?.[0]?.function?.name || 'tool';

  return (
    <div
      className={cn(
        "text-base my-1 italic",
        "text-muted-foreground",
        "flex items-center justify-center",
        "px-2"
      )}
    >
      🤖 Calling {toolName}...
    </div>
  );
};
