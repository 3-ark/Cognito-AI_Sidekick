import { useState, useEffect } from 'react';
import { Accordion } from '@/components/ui/accordion'; 
import { Button } from '@/components/ui/button';
import { cn } from 'src/background/util';
import { useConfig } from './ConfigContext';
import AnimatedBackground from './AnimatedBackground'; 
import { Connect } from './Connect';
import { PageContext } from './PageContext';
import { ModelSettingsPanel } from './ModelSettingsPanel';
import { Persona } from './Persona';
import { Themes } from './Themes';
import { TtsSettings } from './TtsSettings';
import { WebSearch } from './WebSearch';
import { RagSettings } from './RagSettings';
import type { ReactNode } from 'react';

// --- Word-by-word typewriter animation ---
function TypewriterLinesWordByWord({ lines, delay = 120, className = "" }: { lines: ReactNode[], delay?: number, className?: string }) {
  const words = lines.flatMap((line, idx) =>
    typeof line === "string"
      ? line.split(" ").map((word, i, arr) => word + (i < arr.length - 1 ? " " : "")).concat(idx < lines.length - 1 ? ["\n"] : [])
      : [line, idx < lines.length - 1 ? "\n" : ""]
  );
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (visibleCount < words.length) {
      const timer = setTimeout(() => setVisibleCount(visibleCount + 1), delay);
      return () => clearTimeout(timer);
    }
  }, [visibleCount, words.length, delay]);

  return (
    <div
      className={className}
      style={{
        fontFamily: "'Space Mono', monospace",
        whiteSpace: "pre-wrap"
      }}
    >
      {words.slice(0, visibleCount).map((word, idx) =>
        word === "\n" ? <br key={idx} /> : <span key={idx}>{word}</span>
      )}
      {visibleCount < words.length && <span className="blinking-cursor">|</span>}
    </div>
  );
}

// --- Guide content with link ---
const guideLines = [
  "1. Fill your API key or urls in API Access",
  "2. Exit settings, then click the avatar icon to select your model to chat with. You can set username in the top right corner.",
  "3. Use the 'Chat Controls' (notebook icon in input bar) to toggle AI memory and tool usage.",
  <>
    4. Check the user guide{" "}
    <a
      href="https://github.com/3-ark/Cognito-AI_Sidekick/blob/main/docs/USER_GUIDE.md"
      target="_blank"
      rel="noopener noreferrer"
      className="underline text-blue-600 dark:text-blue-400 hover:text-blue-800"
    >
      here
    </a>
  </>,
  "",
  "Note: You can change the other settings now or later. But even if you use local only, it's recommended to leave an API to avoid this welcome modal. Have fun!"
];

export const Settings = () => {
  const { config } = useConfig();
  const [showWarning, setShowWarning] = useState(!config?.models || config.models.length === 0);
  const [accordionValue, setAccordionValue] = useState<string>("");

  return (
    <div
      id="settings"
      className="relative z-[1] top-0 w-full h-full flex-1 flex-col overflow-y-auto overflow-x-hidden bg-transparent text-foreground px-6 pb-10 pt-[56px] scrollbar-hidden"
    >
      <AnimatedBackground />
      {showWarning && (
        <div
          className={cn(
            "mb-4 p-4",
            "rounded-[3rem]",
            "text-[var(--text)]",
            "text-base"
          )}
        >
          <h2 className="font-bold text-lg mb-2">Quick Guide</h2>
          <TypewriterLinesWordByWord
            lines={guideLines}
            delay={80}
            className="text-base text-foreground mt-2"
          />
          <Button
            variant="outline"
            className="justify-center px-8 py-2 text-sm rounded-full mt-2"
            onClick={() => {
              setAccordionValue("connect");
              setShowWarning(false);
            }}
          >
            Got It
          </Button>
        </div>
      )}

      <Accordion
        type="single"
        collapsible
        className="w-full flex flex-col gap-4"
        value={accordionValue}
        onValueChange={setAccordionValue}
      >
        <Connect />
        <Themes /> 
        <ModelSettingsPanel />
        <Persona />
        <TtsSettings />
        <PageContext />
        <WebSearch />
        <RagSettings />
        <div className="pointer-events-none h-12" /> {/* prevent the missing bottom border */}
      </Accordion>
    </div>
  );
};