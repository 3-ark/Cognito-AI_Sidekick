import { useState } from 'react';
import { Accordion } from '@/components/ui/accordion'; 
import AnimatedBackground from './AnimatedBackground'; 
import { Connect } from './Connect';
import { PageContext } from './PageContext';
import { ModelSettingsPanel } from './ModelSettingsPanel';
import { Themes } from './Themes';
import { TtsSettings } from './TtsSettings';
import { WebSearch } from './WebSearch';
import { RagSettings } from './RagSettings';
import { MCPServerManager } from './components/MCPServerManager';

export const Settings = () => {
  const [accordionValue, setAccordionValue] = useState<string>(""); // Keep if Connect button needs it

  return (
    <div
      id="settings"
      className="relative z-[1] top-0 w-full h-full flex-1 flex-col overflow-y-auto overflow-x-hidden bg-transparent text-foreground px-6 pb-10 pt-[56px] scrollbar-hidden"
    >
      <AnimatedBackground />
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
        <TtsSettings />
        <PageContext />
        <WebSearch />
        <RagSettings />
        <MCPServerManager />
        <div className="pointer-events-none h-12" /> {/* prevent the missing bottom border */}
      </Accordion>
    </div>
  );
};