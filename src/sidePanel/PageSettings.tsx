import React from 'react';
import { useTranslation } from 'react-i18next';
import { Slider } from '@/components/ui/slider';
import { Switch } from "@/components/ui/switch";
import { Label } from '@/components/ui/label';
import { useConfig } from './ConfigContext';
import { SettingTitle } from './SettingsTitle';
import { Textarea } from '@/components/ui/textarea';

export const PageSettings = () => {
  const { t } = useTranslation();
  const { config, updateConfig } = useConfig();
  const size = config?.contextLimit || 1;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <SettingTitle
          text="Page Context"
        />
        <div className="mt-4">
          <div className="w-full">
            <p className="text-(--text) text-base font-medium pb-6 text-left">
              Char Limit:{' '}
              <span className="font-normal">{size === 128 ? 'inf' : `${size}k`}</span>
            </p>
            <Slider
              defaultValue={[size]}
              max={128}
              min={1}
              step={1}
              variant="themed"
              onValueChange={(value: number[]) => updateConfig({ contextLimit: value[0] })}
            />
          </div>
        </div>
      </div>
      <div>
        <SettingTitle
          text="Floating Button"
        />
        <div className="flex flex-col gap-6 mt-4">
          <div className="flex items-center justify-between pr-3">
            <Label className="text-base font-medium text-foreground cursor-pointer" htmlFor="showFloatingButton-switch">Show floating button</Label>
            <Switch
              checked={config?.showFloatingButton ?? true}
              id="showFloatingButton-switch"
              onCheckedChange={(checked) => updateConfig({ showFloatingButton: checked })}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {t('floatingButtonShortcutHint')}
          </p>
          <p className="text-sm text-muted-foreground">
            You can open the floating button window with the shortcut Alt+O.
          </p>
          <p className="text-sm text-muted-foreground">
            {t('customizeShortcutsHint')}{' '}
            <a
              className="text-[var(--link)]"
              href="chrome://extensions/shortcuts"
              target="_blank"
              rel="noopener noreferrer"
            >
              chrome://extensions/shortcuts
            </a>
          </p>
        </div>
      </div>
      <div>
        <SettingTitle
          text="Reader Lens"
        />
        <p className="text-sm text-muted-foreground">
          You can customize your gist here.
        </p>
        <div className="flex flex-col gap-6 mt-4">
          <Textarea
            placeholder="I am an investor, I want know more about the opportunity and risk."
            className="text-base"
            value={config?.readerLens || ''}
            onChange={(e) => updateConfig({ readerLens: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
};