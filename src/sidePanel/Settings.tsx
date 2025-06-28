import { Accordion } from '@/components/ui/accordion'; 
import { useConfig } from './ConfigContext';
import { Connect } from './Connect';
import { PageContext } from './PageContext';
import { ModelSettingsPanel } from './ModelSettingsPanel';
import { Persona } from './Persona';
import { Themes } from './Themes';
import { TtsSettings } from './TtsSettings';
import { WebSearch } from './WebSearch';
import { RagSettings } from './RagSettings';
import { Button } from '@/components/ui/button';
import { cn } from 'src/background/util';
import { useState } from 'react';
import AnimatedBackground from './AnimatedBackground'; 

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
        <div className={cn(
          "mb-4 p-4",
          "rounded-[3rem]",
          "cognito-title-blade-glow",
          "text-[var(--text)]",
          "text-base"
        )}>
          <div className="flex flex-col items-center gap-4">
            <h2 className="text-xl font-bold">Quick Setup Guide</h2>
            <div className="flex flex-col gap-3 w-full">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--active)] flex items-center justify-center">1</span>
                <p> Fill your API key or urls in API Access</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--active)] flex items-center justify-center">2</span>
                <p>Exit settings, then click the avatar icon to select your model to chat with. You can set username in the top right corner.</p>
              </div>
              <div className="text-sm text-[var(--mute)] mt-1 ml-9">
                <em>Note: You can change the other settings now or later. Have fun!</em>
              </div>
            </div>
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
        <div className="pointer-events-none h-12" /> {/* prevent the missing bottom boarder */}
      </Accordion>
    </div>
  );
};
