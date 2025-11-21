import React from 'react';

import AnimatedBackground from './AnimatedBackground';
import { useConfig } from './ConfigContext';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';

// Button and FiChevronLeft are no longer needed here for an internal back button
import { cn } from "@/src/background/util";

type ModelParamKey = 'temperature' | 'maxTokens' | 'topP' | 'presencePenalty';

// No onBack prop needed anymore
// interface ModelSettingsPanelProps {
//   onBack?: () => void; 
// }

// export const ModelSettingsPanel: React.FC<ModelSettingsPanelProps> = ({ onBack }) => {
export const ModelSettingsPanel: React.FC = () => { // Simplified props
  const { config, updateConfig } = useConfig();

  const handleChange = (key: ModelParamKey) => (val: number | number[]) => {
    const valueToSet = Array.isArray(val) ? val[0] : val;

    updateConfig({ [key]: valueToSet });
  };

  const temperature = config.temperature ?? 0.7;
  const maxTokens = config.maxTokens ?? 32048;
  const topP = config.topP ?? 0.95;
  const presence_penalty = config.presencePenalty ?? 0;

  const inputStyles = "bg-[var(--input-background)] border-[var(--text)]/20 text-[var(--text)] focus:border-[var(--active)] hide-number-spinners";
  const labelStyles = "text-base font-medium text-[var(--text)] opacity-90";

  return (

    // The main div now provides padding and overflow handling for full-page display
    // The sticky header with back button is removed from here.
    <div className="relative z-[1] flex flex-col h-full flex-1 overflow-y-auto p-6 text-[var(--text)] no-scrollbar">
      <AnimatedBackground />
      <div className="flex flex-col gap-6"> {/* Removed extra text-[var(--text)] as it's on parent */}
          <div className="space-y-3">
            <Label className={labelStyles} htmlFor="temperature">
              Temperature ({temperature.toFixed(2)})
            </Label>
            <Slider
              id="temperature"
              max={2}
min={0}
step={0.01}
              value={[temperature]}
              variant="themed"
              onValueChange={handleChange('temperature')} 
            />
          </div>

          <div className="space-y-3">
            <Label className={labelStyles} htmlFor="maxTokens">
              Max Tokens ({maxTokens})
            </Label>
            <Input
              className={cn(inputStyles, "rounded-xl")}
              id="maxTokens"
              max={1280000}
              min={1}
              type="number"
              value={maxTokens}
              onChange={e => handleChange('maxTokens')(parseInt(e.target.value, 10) || 0)} // Removed unused left side of comma operator
            />
          </div>

          <div className="space-y-3">
            <Label className={labelStyles} htmlFor="topP">
              Top P ({topP.toFixed(2)})
            </Label>
            <Slider
              id="topP"
              max={1}
min={0}
step={0.01}
              value={[topP]}
              variant="themed"
              onValueChange={handleChange('topP')}
            />
          </div>

          <div className="space-y-3">
            <Label className={labelStyles} htmlFor="presencePenalty">
            Presence Penalty ({presence_penalty.toFixed(2)})
            </Label>
            <Slider
              id="presencePenalty"
              max={2}
              min={-2}
              step={0.01}
              value={[presence_penalty]}
              variant="themed"
              onValueChange={handleChange('presencePenalty')}
            />
          </div>
        </div>
      </div>
  );
};
