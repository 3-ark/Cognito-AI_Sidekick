import { useEffect, useState } from 'react';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input'; 
import { Slider } from '@/components/ui/slider';
import { cn } from "@/src/background/util";
import { Checkbox } from "@/components/ui/checkbox";

import { useConfig } from './ConfigContext';
import type { Config } from '../types/config';
import { SettingTitle } from './SettingsTitle';

interface WebSearchModeSelectorProps {
  webMode: Config['webMode'];
  updateConfig: (newConfig: Partial<Config>) => void;
}

const WebSearchModeSelector = ({ webMode, updateConfig }: WebSearchModeSelectorProps) => (
  <RadioGroup
    value={webMode}
    onValueChange={(value) => updateConfig({ webMode: value as Config['webMode'] })}
    className="w-1/2 space-y-3"
  >
    {['Duckduckgo', 'Brave', 'Google', 'Wikipedia', 'GoogleCustomSearch'].map(mode => (
      <div key={mode} className="flex items-center space-x-2">
        <RadioGroupItem
          value={mode}
          id={`webMode-${mode}`}
          variant="themed"
        />
        <Label
          htmlFor={`webMode-${mode}`}
          className="text-[var(--text)] text-base font-medium cursor-pointer"
        >
          {mode === 'GoogleCustomSearch' ? 'Google Custom API' : mode === 'Duckduckgo' ? 'DuckDuckGo' : mode}
        </Label>
      </div>
    ))}
  </RadioGroup>
);

interface SerpSettingsPanelProps {
  config: Config;
  updateConfig: (newConfig: Partial<Config>) => void;
}

const SerpSettingsPanel = ({ config, updateConfig }: SerpSettingsPanelProps) => {
  const charLimit = config?.webLimit ?? 16; 
  const maxLinks = config?.serpMaxLinksToVisit ?? 3;

  return (
    <div className="w-full space-y-4">
      <div>
        <p className="text-[var(--text)] text-base font-medium pb-2 text-left">
          Max Links to Visit: <span className="font-normal">{maxLinks}</span>
        </p>
        <Slider
          value={[maxLinks]}
          max={10}
          min={1}
          step={1}
          variant="themed"
          onValueChange={value => updateConfig({ serpMaxLinksToVisit: value[0] })}
        />
        <p className="text-[var(--text)]/70 text-xs pt-1">
          Number of search result links to fetch.
        </p>
      </div>

      <div className="pt-2">
        <p className="text-[var(--text)] text-base font-medium pb-2 text-left">
          Content Char Limit:{' '}
          <span className="font-normal">{charLimit === 128 ? 'Unlimited (Full)' : `${charLimit}k`}</span>
        </p>
        <Slider
          value={[charLimit]}
          max={128} 
          min={1}   
          step={1}
          variant="themed"
          onValueChange={value => updateConfig({ webLimit: value[0] })}
        />
         <p className="text-[var(--text)]/70 text-xs pt-1">
          Max characters (in thousands) of content to use. 128k for 'Unlimited'.
        </p>
      </div>
    </div>
  );
};

interface WikipediaSettingsPanelProps {
  config: Config;
  updateConfig: (newConfig: Partial<Config>) => void;
}

const WikipediaSettingsPanel = ({ config, updateConfig }: WikipediaSettingsPanelProps) => {
  const numBlocks = config?.wikiNumBlocks ?? 3;
  const rerankEnabled = config?.wikiRerank ?? false;
  const numBlocksToRerank = config?.wikiNumBlocksToRerank ?? Math.max(numBlocks, 10);

  return (
    <div className="w-full space-y-4">
      <div>
        <p className="text-[var(--text)] text-base font-medium pb-2 text-left">
          Results Num: <span className="font-normal">{numBlocks}</span>
        </p>
        <Slider
          value={[numBlocks]}
          max={30}
          min={1}
          step={1}
          variant="themed"
          onValueChange={value => updateConfig({ wikiNumBlocks: value[0] })}
        />
      </div>

      <div className="flex items-center space-x-2 pt-2">
        <Checkbox
          id="wikiRerank"
          checked={rerankEnabled}
          onCheckedChange={(checked) => updateConfig({ wikiRerank: !!checked })}
          variant="themed"
        />
        <Label
          htmlFor="wikiRerank"
          className="text-[var(--text)] text-base font-medium cursor-pointer"
        >
          Enable LLM Reranking
        </Label>
      </div>

      {rerankEnabled && (
        <div>
          <p className="text-[var(--text)] text-base font-medium pb-2 text-left pt-2">
            Rerank Num: <span className="font-normal">{numBlocksToRerank}</span>
          </p>
          <Slider
            value={[numBlocksToRerank]} 
            max={50}
            min={1}
            step={1}
            variant="themed"
            onValueChange={value => updateConfig({ wikiNumBlocksToRerank: value[0] })}
            disabled={!rerankEnabled}
          />
           <p className="text-[var(--text)]/70 text-xs pt-1">
            More items for reranking can improve quality but takes longer.
          </p>
        </div>
      )}
    </div>
  );
};

interface GoogleCustomSearchSettingsPanelProps {
  config: Config;
  updateConfig: (newConfig: Partial<Config>) => void;
}

const GoogleCustomSearchSettingsPanel = ({ config, updateConfig }: GoogleCustomSearchSettingsPanelProps) => {
  const [apiKey, setApiKey] = useState(config?.googleApiKey || '');
  const [cx, setCx] = useState(config?.googleCx || '');

  useEffect(() => {
    setApiKey(config?.googleApiKey || '');
    setCx(config?.googleCx || '');
  }, [config?.googleApiKey, config?.googleCx]);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newApiKey = e.target.value;
    setApiKey(newApiKey);
    updateConfig({ googleApiKey: newApiKey });
  };

  const handleCxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCx = e.target.value;
    setCx(newCx);
    updateConfig({ googleCx: newCx });
  };


  const linkClass = "text-[var(--active)] hover:underline text-xs";

  return (
    <div className="w-full space-y-4">
      <div>
        <Label htmlFor="googleApiKey" className="text-[var(--text)] text-base font-medium pb-1 block">
          Google API Key
        </Label>
        <Input
          id="googleApiKey"
          type={config.visibleApiKeys ? "text" : "password"}
          value={apiKey}
          onChange={handleApiKeyChange}
          className="h-6"
          placeholder="Enter Google API Key"
        />
        <p className="text-[var(--text)]/70 text-xs pt-1">
          Your Google Cloud API Key for Custom Search.
          <a
            href="https://developers.google.com/custom-search/v1/introduction"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(linkClass, "ml-1")}
          >
            Get API Key
          </a>
        </p>
      </div>
      <div className="pt-2">
        <Label htmlFor="googleCx" className="text-[var(--text)] text-base font-medium pb-1 block">
          Search Engine ID (CX)
        </Label>
        <Input
          id="googleCx"
          type="text"
          value={cx}
          className="h-6"
          onChange={handleCxChange}
          placeholder="Enter Search Engine ID (CX)"
        />
        <p className="text-[var(--text)]/70 text-xs pt-1">
          Your Programmable Search Engine ID.
          <a
            href="https://programmablesearchengine.google.com/controlpanel/all"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(linkClass, "ml-1")}
          >
            Get CX ID
          </a>
        </p>
      </div>
       <p className="text-[var(--text)]/70 text-xs pt-2">
          Note: Custom Search JSON API provides 100 search queries per day for free.
          The API returns up to 10 snippets.
          Ensure your Programmable Search Engine is configured to search the entire web if desired.
        </p>
    </div>
  );
};


export const WebSearch = () => {
  const { config, updateConfig } = useConfig();

  useEffect(() => {
    if (config?.webMode === 'Wikipedia') {
      const updates: Partial<Config> = {};
      const numBlocksOrDefault = config.wikiNumBlocks ?? 3;

      if (typeof config.wikiNumBlocks === 'undefined') {
        updates.wikiNumBlocks = 3;
      }
      
      if (config.wikiRerank) {
        if (typeof config.wikiNumBlocksToRerank === 'undefined') {
          updates.wikiNumBlocksToRerank = Math.max(numBlocksOrDefault, 10);
        } else {
          if (config.wikiNumBlocksToRerank < numBlocksOrDefault) {
            updates.wikiNumBlocksToRerank = numBlocksOrDefault;
          }
        }
      }
      if (Object.keys(updates).length > 0) updateConfig(updates);
    }
  }, [config?.webMode, config?.wikiRerank, config?.wikiNumBlocks, config?.wikiNumBlocksToRerank, updateConfig]);

  useEffect(() => {
    const serpScrapingModes: (Config['webMode'])[] = ['Duckduckgo', 'Brave', 'Google', 'GoogleCustomSearch'];
    if (serpScrapingModes.includes(config?.webMode)) {
      const updates: Partial<Config> = {};
      if (typeof config?.serpMaxLinksToVisit === 'undefined') updates.serpMaxLinksToVisit = 3;
      if (typeof config?.webLimit === 'undefined') updates.webLimit = 16; 
      if (Object.keys(updates).length > 0) updateConfig(updates);
    }
  }, [config?.webMode, config?.serpMaxLinksToVisit, config?.webLimit, updateConfig]);

  useEffect(() => {
    if (config?.webMode === 'GoogleCustomSearch') {
      const updates: Partial<Config> = {};
      if (typeof config.googleApiKey === 'undefined') updates.googleApiKey = '';
      if (typeof config.googleCx === 'undefined') updates.googleCx = '';
      if (Object.keys(updates).length > 0) updateConfig(updates);
    }
  }, [config?.webMode, config?.googleApiKey, config?.googleCx, updateConfig]);

  const renderRightPanel = () => {
    const panelWrapperClass = "w-[45%] pl-4 flex flex-col space-y-6"; 

    switch (config?.webMode) {
      case 'Wikipedia':
        return (
          <div className={panelWrapperClass}>
            <WikipediaSettingsPanel config={config} updateConfig={updateConfig} />
          </div>
        );
      case 'GoogleCustomSearch':
        return (
          <div className={panelWrapperClass}>
            <GoogleCustomSearchSettingsPanel config={config} updateConfig={updateConfig} />
            <SerpSettingsPanel config={config} updateConfig={updateConfig} />
          </div>
        );
      case 'Duckduckgo':
      case 'Brave':
      case 'Google':
        return (
          <div className={panelWrapperClass}>
            <SerpSettingsPanel config={config} updateConfig={updateConfig} />
          </div>
        );
      default:
        return (
          <div className="w-[45%] pl-4">
            <p className="text-[var(--text)]/70">Select a search mode to see its options.</p>
          </div>
        );
    }
  };

  return (
    <AccordionItem
      value="web-search"
      className={cn(
        "bg-[var(--input-background)] border-[var(--text)]/20 rounded-xl shadow-md",
        "overflow-hidden",
        "transition-all duration-150 ease-in-out",
        "hover:border-[var(--active)] hover:brightness-105"
      )}
    >
      <AccordionTrigger
        className={cn(
          "flex items-center justify-between w-full px-3 py-2 hover:no-underline",
          "text-[var(--text)] font-medium",
          "hover:brightness-95",
        )}
      >
        <SettingTitle
          icon="🌐"
          text="Web Search"
        />
      </AccordionTrigger>
      <AccordionContent className="px-3 pb-4 pt-2 text-[var(--text)]">
      <div className="flex">
          <WebSearchModeSelector updateConfig={updateConfig} webMode={config?.webMode} />
          {renderRightPanel()}
          </div>
          </AccordionContent>
          </AccordionItem>
  );
};