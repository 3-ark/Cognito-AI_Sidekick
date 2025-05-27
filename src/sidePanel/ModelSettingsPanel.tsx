import { useConfig } from './ConfigContext';
import {
  AccordionItem,
  AccordionContent,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { SettingTitle } from './SettingsTitle';
import { cn } from "@/src/background/util";

type ModelParamKey = 'temperature' | 'maxTokens' | 'topP' | 'presencepenalty';

export const ModelSettingsPanel = () => {
  const { config, updateConfig } = useConfig();

  const handleChange = (key: ModelParamKey) => (val: number | number[]) => {
    const valueToSet = Array.isArray(val) ? val[0] : val;
    updateConfig({ [key]: valueToSet });
  };

  const temperature = config.temperature ?? 0.7;
  const maxTokens = config.maxTokens ?? 32048;
  const topP = config.topP ?? 0.95;
  const presence_penalty = config.presencepenalty ?? 0;

  return (
    <AccordionItem
      value="model-params"
      className={cn(
        "bg-[var(--input-background)] border-[var(--text)]/10 rounded-xl shadow-md",
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
        <SettingTitle icon="⚙️" text="Model Config" />
      </AccordionTrigger>
      <AccordionContent
        className="px-3 pb-4 pt-2 text-[var(--text)]"
      >
        <div className="flex flex-col gap-6">
          <div className="space-y-3">
            <Label htmlFor="temperature" className="text-base font-medium text-foreground">
              Temperature ({temperature.toFixed(2)})
            </Label>
            <Slider
              id="temperature"
              min={0} max={2} step={0.01}
              value={[temperature]}
              onValueChange={handleChange('temperature')}
              variant="themed" 
            />
          </div>

          <div className="space-y-3">
            <Label htmlFor="maxTokens" className="text-base font-medium text-foreground">
              Max Tokens ({maxTokens})
            </Label>
            <Input
              id="maxTokens"
              type="number"
              value={maxTokens}
              min={1}
              max={1280000}
              onChange={(e) => handleChange('maxTokens')(parseInt(e.target.value, 10) || 0)}
              className={cn(
                "hide-number-spinners"
              )}
            />
          </div>

          <div className="space-y-3">
            <Label htmlFor="topP" className="text-base font-medium text-foreground">
              Top P ({topP.toFixed(2)})
            </Label>
            <Slider
              id="topP"
              min={0} max={1} step={0.01}
              value={[topP]}
              onValueChange={handleChange('topP')}
              variant="themed"
            />
          </div>

          <div className="space-y-3">
            <Label htmlFor="presencepenalty" className="text-base font-medium text-foreground">
            Presence Penalty ({presence_penalty.toFixed(2)})
            </Label>
            <Slider
              id="presencepenalty"
              min={-2}
              max={2}
              step={0.01}
              value={[presence_penalty]}
              onValueChange={handleChange('presencepenalty')}
              variant="themed"
            />
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};