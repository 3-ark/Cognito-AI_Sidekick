import { useEffect, useState } from 'react';

import type { Config } from '../types/config';

import { useConfig } from './ConfigContext';

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from '@/components/ui/input'; 
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from '@/components/ui/slider';
import { cn } from "@/src/background/util";

interface WebSearchModeSelectorProps {
  webMode: Config['webMode'];
  updateConfig: (newConfig: Partial<Config>) => void;
}

const WebSearchModeSelector = ({ webMode, updateConfig }: WebSearchModeSelectorProps) => (
  <RadioGroup
    className="w-1/2 space-y-3"
    value={webMode}
    onValueChange={value => updateConfig({ webMode: value as Config['webMode'] })}
  >
    {['Duckduckgo', 'Brave', 'Google', 'Wikipedia', 'GoogleCustomSearch'].map(mode => (
      <div key={mode} className="flex items-center space-x-2">
        <RadioGroupItem
          id={`webMode-${mode}`}
          value={mode}
          variant="themed"
        />
        <Label
          className="text-(--text) text-base font-medium cursor-pointer"
          htmlFor={`webMode-${mode}`}
        >
          {mode === 'GoogleCustomSearch' ? 'Google Custom API' : mode}
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
        <p className="text-(--text) text-base font-medium pb-2 text-left">
          Max Links to Visit: <span className="font-normal">{maxLinks}</span>
        </p>
        <Slider
          max={10}
          min={1}
          step={1}
          value={[maxLinks]}
          variant="themed"
          onValueChange={value => updateConfig({ serpMaxLinksToVisit: value[0] })}
        />
        <p className="text-(--text)/70 text-xs pt-1">
          Number of search result links to fetch.
        </p>
      </div>

      <div className="pt-2">
        <p className="text-(--text) text-base font-medium pb-2 text-left">
          Content Char Limit:{' '}
          <span className="font-normal">{charLimit === 128 ? 'Unlimited (Full)' : `${charLimit}k`}</span>
        </p>
        <Slider
          max={128}
          min={1} 
          step={1}   
          value={[charLimit]}
          variant="themed"
          onValueChange={value => updateConfig({ webLimit: value[0] })}
        />
         <p className="text-(--text)/70 text-xs pt-1">
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
        <p className="text-(--text) text-base font-medium pb-2 text-left">
          Results Num: <span className="font-normal">{numBlocks}</span>
        </p>
        <Slider
          max={30}
          min={1}
          step={1}
          value={[numBlocks]}
          variant="themed"
          onValueChange={value => updateConfig({ wikiNumBlocks: value[0] })}
        />
      </div>

      <div className="flex items-center space-x-2 pt-2">
        <Checkbox
          checked={rerankEnabled}
          id="wikiRerank"
          variant="themed"
          onCheckedChange={checked => updateConfig({ wikiRerank: !!checked })}
        />
        <Label
          className="text-(--text) text-base font-medium cursor-pointer"
          htmlFor="wikiRerank"
        >
          Enable LLM Reranking
        </Label>
      </div>

      {rerankEnabled && (
        <div>
          <p className="text-(--text) text-base font-medium pb-2 text-left pt-2">
            Rerank Num: <span className="font-normal">{numBlocksToRerank}</span>
          </p>
          <Slider
            disabled={!rerankEnabled} 
            max={50}
            min={1}
            step={1}
            value={[numBlocksToRerank]}
            variant="themed"
            onValueChange={value => updateConfig({ wikiNumBlocksToRerank: value[0] })}
          />
           <p className="text-(--text)/70 text-xs pt-1">
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

  const linkClass = "text-(--active) hover:underline text-xs";

  return (
    <div className="w-full space-y-4">
      <div>
        <Label className="text-(--text) text-base font-medium pb-1 block" htmlFor="googleApiKey">
          Google API Key
        </Label>
        <Input
          className="h-6"
          id="googleApiKey"
          placeholder="Enter Google API Key"
          type={config.visibleApiKeys ? "text" : "password"}
          value={apiKey}
          onChange={handleApiKeyChange}
        />
        <p className="text-(--text)/70 text-xs pt-1">
          Your Google Cloud API Key for Custom Search.
          <a
            className={cn(linkClass, "ml-1")}
            href="https://developers.google.com/custom-search/v1/introduction"
            rel="noopener noreferrer"
            target="_blank"
          >
            Get API Key
          </a>
        </p>
      </div>
      <div className="pt-2">
        <Label className="text-(--text) text-base font-medium pb-1 block" htmlFor="googleCx">
          Search Engine ID (CX)
        </Label>
        <Input
          className="h-6"
          id="googleCx"
          placeholder="Enter Search Engine ID (CX)"
          type="text"
          value={cx}
          onChange={handleCxChange}
        />
        <p className="text-(--text)/70 text-xs pt-1">
          Your Programmable Search Engine ID.
          <a
            className={cn(linkClass, "ml-1")}
            href="https://programmablesearchengine.google.com/controlpanel/all"
            rel="noopener noreferrer"
            target="_blank"
          >
            Get CX ID
          </a>
        </p>
      </div>
       <p className="text-(--text)/70 text-xs pt-2">
          Note: Custom Search JSON API provides 100 search queries per day for free.
          The API returns up to 10 snippets.
          Ensure your Programmable Search Engine is configured to search the entire web if desired.
        </p>
    </div>
  );
};

export const WebSearchPage = () => {
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
            <p className="text-(--text)/70">Select a search mode to see its options.</p>
          </div>
        );
    }
  };

  return (
    <div
      className="relative z-1 top-0 w-full h-full flex-1 flex-col overflow-y-auto overflow-x-hidden bg-transparent text-foreground p-6 scrollbar-hidden"
      id="settings"
    >
      <div className="flex">
          <WebSearchModeSelector updateConfig={updateConfig} webMode={config?.webMode} />
          {renderRightPanel()}
      </div>
    </div>
  );
};
