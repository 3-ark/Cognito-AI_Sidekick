import type { FC } from 'react';
import { FiExternalLink } from 'react-icons/fi';
import {
  AccordionItem,
  AccordionContent,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ConnectGemini } from './ConnectGemini';
import { ConnectGroq } from './ConnectGroq';
import { ConnectLmStudio } from './ConnectLmStudio';
import { ConnectOllama } from './ConnectOllama';
import { ConnectOpenAI } from './ConnectOpenAI';
import { ConnectOpenRouter } from './ConnectOpenRouter';
import { ConnectCustom } from './ConnectCustom';
import { SettingTitle } from './SettingsTitle';
import { cn } from "@/src/background/util";

type ConnectionProps = {
  title: string;
  Component: FC<unknown>;
  link?: string;
};

const ConnectionSection: FC<ConnectionProps> = ({
  title,
  Component,
  link,
}) => (
  (<div className="px-4 py-3 border-b border-[var(--text)]/20 last:border-b-0">
    <div className="flex items-center justify-between mb-2">
      <h4 className="text-base font-medium capitalize text-foreground">
        {title}
      </h4>
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "text-xs inline-flex items-center gap-1",
            "text-[var(--link)] hover:text-[var(--active)] hover:underline",
            "focus-visible:ring-1 focus-visible:ring-[var(--ring)] rounded-sm p-0.5"
          )}
        >
          API Keys
          <FiExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
    <Component />
  </div>)
);

export const Connect: FC = () => {

  return (
    <AccordionItem
      value="connect"
      className={cn(
        "bg-[var(--input-background)]",
        "border-[var(--text)]/20",
        "rounded-xl",
        "shadow-md",
        "transition-all duration-150 ease-in-out", 
        "hover:border-[var(--active)] hover:brightness-105",
        "overflow-hidden"
      )}
    >
      <AccordionTrigger
        className={cn(
          "flex items-center justify-between w-full px-3 py-2 hover:no-underline",
          "text-[var(--text)] font-medium",
          "hover:brightness-95",
        )}
      >
        <SettingTitle icon="♾️" text="API Access" />
      </AccordionTrigger>
      <AccordionContent className="p-0 text-[var(--text)]">
        <ConnectionSection Component={ConnectOllama} title="Ollama" />
        <ConnectionSection Component={ConnectLmStudio} title="LM Studio" />
        <ConnectionSection
          Component={ConnectGroq}
          link="https://console.groq.com/keys"
          title="Groq"
        />
        <ConnectionSection
          Component={ConnectGemini}
          link="https://aistudio.google.com/app/apikey"
          title="Gemini"
        />
        <ConnectionSection
          Component={ConnectOpenAI}
          link="https://platform.openai.com/api-keys"
          title="OpenAI"
        />
        <ConnectionSection
          Component={ConnectOpenRouter}
          link="https://openrouter.ai/settings/keys"
          title="OpenRouter"
        />
        <ConnectionSection
          Component={ConnectCustom}
          title="OpenAI Compatible Endpoint"
        />
      </AccordionContent>
    </AccordionItem>
  );
};