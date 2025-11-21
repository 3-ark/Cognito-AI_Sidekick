import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

import { Model } from '../types/config';
import { getAvailableVoices, VoiceOption } from '../background/ttsUtils';
import { Input } from '@/components/ui/input';
import { useConfig } from './ConfigContext';
import { SettingTitle } from './SettingsTitle';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from "@/src/background/util";

export const MiscSettings = () => {
  const { config, updateConfig } = useConfig();
  const { t } = useTranslation();
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [errorLoading, setErrorLoading] = useState<string | null>(null);

  const openAiVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
  const DEFAULT_OPENAI_ENDPOINT = 'https://api.openai.com/v1/audio/speech';

  useEffect(() => {
    setLoadingVoices(true);
    setErrorLoading(null);
    getAvailableVoices()
      .then(availableVoices => {
        setVoices(availableVoices);

        if (!config.tts?.selectedVoice && availableVoices.length > 0) {
          const defaultVoice = availableVoices.find(v => v.lang.startsWith('en')) || availableVoices[0];

          if (defaultVoice) {
            updateConfig({ tts: { ...config.tts, selectedVoice: defaultVoice.name } });
          }
        }
      })
      .catch(err => {
        console.error('Error loading TTS voices:', err);
        setErrorLoading('Could not load voices. TTS might not be available.');
      })
      .finally(() => {
        setLoadingVoices(false);
      });
  }, []);

  const handleProviderChange = (selectedValue: string) => {
    updateConfig({
      tts: {
        ...config.tts,
        provider: selectedValue,
        selectedVoice: selectedValue === 'openai' ? openAiVoices[0] : voices[0]?.name,
      },
    });
  };

  const handleVoiceChange = (selectedValue: string) => {
    updateConfig({
      tts: {
        ...config.tts,
        selectedVoice: selectedValue,
      },
    });
  };

  const handleRateChange = (value: number[]) => {
    updateConfig({
      tts: {
        ...config.tts,
        rate: value[0],
      },
    });
  };

  const currentRate = config.tts?.rate ?? 1;
  const size = config?.contextLimit || 1;
  const ttsProvider = config.tts?.provider || 'browser';
  const isCustomEndpoint =
    (config.tts?.endpoint && config.tts.endpoint !== DEFAULT_OPENAI_ENDPOINT) ||
    (config.tts?.endpoint === '' &&
      config.tts?.provider === 'openai' &&
      config.models?.some((model: Model) => model.id.startsWith('custom:')));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <SettingTitle
          text="Text-to-Speech"
        />
        <div className="flex flex-col gap-6 mt-4">
          <div className="space-y-3">
            <Label className="text-base font-medium text-foreground">TTS Provider</Label>
            <Select value={ttsProvider} onValueChange={handleProviderChange}>
              <SelectTrigger className={cn('w-full', 'data-[placeholder]:text-muted-foreground')} variant="settings">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent variant="settingsPanel">
                <SelectItem focusVariant="activeTheme" value="browser">
                  Browser
                </SelectItem>
                <SelectItem focusVariant="activeTheme" value="openai">
                  OpenAI
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loadingVoices ? (
            <div className="flex justify-center items-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--text)]" />
            </div>
          ) : errorLoading ? (
            <p className="text-[var(--error)] text-base font-medium">{errorLoading}</p>
          ) : ttsProvider === 'browser' && voices.length > 0 ? (
            <div className="space-y-3">
              <Label className="text-base font-medium text-foreground">Voice</Label>
              <Select value={config.tts?.selectedVoice || ''} onValueChange={handleVoiceChange}>
                <SelectTrigger className={cn('w-full', 'data-[placeholder]:text-muted-foreground')} variant="settings">
                  <SelectValue placeholder="Select voice" />
                </SelectTrigger>
                <SelectContent variant="settingsPanel">
                  {voices.map(voice => (
                    <SelectItem key={voice.name} focusVariant="activeTheme" value={voice.name}>
                      {voice.name} ({voice.lang})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : ttsProvider === 'openai' ? (
            <>
              {isCustomEndpoint ? (
                <>
                  <div className="space-y-3">
                    <Label className="text-base font-medium text-foreground">Voice</Label>
                    <Select
                      value={config.tts?.selectedVoice || ''}
                      onValueChange={handleVoiceChange}
                      disabled={!config.tts?.customVoices}>
                      <SelectTrigger
                        className={cn('w-full', 'data-[placeholder]:text-muted-foreground')}
                        variant="settings">
                        <SelectValue placeholder="Select custom voice" />
                      </SelectTrigger>
                      <SelectContent variant="settingsPanel">
                        {(config.tts?.customVoices || '')
                          .split(',')
                          .map(v => v.trim())
                          .filter(Boolean)
                          .map(voice => (
                            <SelectItem key={voice} focusVariant="activeTheme" value={voice}>
                              {voice}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3">
                    <Label className="text-base font-medium text-foreground">
                      Custom Voices (comma-separated)
                    </Label>
                    <Input
                      className="bg-[var(--input-background)] border-[var(--text)]/20 text-[var(--text)] focus-visible:ring-1 focus-visible:ring-[var(--active)] rounded-full"
                      placeholder="e.g., voice1,voice2,voice3"
                      value={config.tts?.customVoices || ''}
                      onChange={e => updateConfig({ tts: { ...config.tts, customVoices: e.target.value } })}
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <Label className="text-base font-medium text-foreground">Voice</Label>
                  <Select value={config.tts?.selectedVoice || ''} onValueChange={handleVoiceChange}>
                    <SelectTrigger
                      className={cn('w-full', 'data-[placeholder]:text-muted-foreground')}
                      variant="settings">
                      <SelectValue placeholder="Select voice" />
                    </SelectTrigger>
                    <SelectContent variant="settingsPanel">
                      {openAiVoices.map(voice => (
                        <SelectItem key={voice} focusVariant="activeTheme" value={voice}>
                          {voice}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-3">
                <Label className="text-base font-medium text-foreground">Endpoint URL</Label>
                <Input
                  className="bg-[var(--input-background)] border-[var(--text)]/20 text-[var(--text)] focus-visible:ring-1 focus-visible:ring-[var(--active)] rounded-full"
                  placeholder={DEFAULT_OPENAI_ENDPOINT}
                  value={config.tts?.endpoint || ''}
                  onChange={e => updateConfig({ tts: { ...config.tts, endpoint: e.target.value } })}
                />
              </div>
              <div className="space-y-3">
                <Label className="text-base font-medium text-foreground">TTS Model</Label>
                <Input
                  className="bg-[var(--input-background)] border-[var(--text)]/20 text-[var(--text)] focus-visible:ring-1 focus-visible:ring-[var(--active)] rounded-full"
                  placeholder="e.g., tts-1"
                  value={config.tts?.model || ''}
                  onChange={e => updateConfig({ tts: { ...config.tts, model: e.target.value } })}
                />
              </div>
            </>
          ) : (
            <p className="text-base font-medium text-foreground">No voices available.</p>
          )}

          {!loadingVoices &&
            !errorLoading &&
            (ttsProvider === 'browser' ? voices.length > 0 : true) && (
            <div className="mt-2">
              <Label className="text-base font-medium text-foreground pb-3 block">
                Speech Rate: {currentRate.toFixed(1)}
              </Label>
              <Slider
                max={2}
                min={0.5}
                step={0.1}
                value={[currentRate]}
                variant="themed"
                onValueChange={handleRateChange}
              />
            </div>
          )}
        </div>
      </div>
      <div>
        <SettingTitle
          text="Speech-to-Text"
        />
        <div className="flex flex-col gap-6 mt-4">
          <div className="space-y-3">
            <Label className="text-base font-medium text-foreground">Language</Label>
            <Select
              value={config.asr?.language || 'en'}
              onValueChange={value => updateConfig({ asr: { ...config.asr, language: value } })}
            >
              <SelectTrigger className={cn('w-full', 'data-[placeholder]:text-muted-foreground')} variant="settings">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent variant="settingsPanel">
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es-ES">Spanish (Spain)</SelectItem>
                <SelectItem value="fr-FR">French (France)</SelectItem>
                <SelectItem value="de-DE">German (Germany)</SelectItem>
                <SelectItem value="it-IT">Italian (Italy)</SelectItem>
                <SelectItem value="ja-JP">Japanese (Japan)</SelectItem>
                <SelectItem value="ko-KR">Korean (Korea)</SelectItem>
                <SelectItem value="pt-BR">Portuguese (Brazil)</SelectItem>
                <SelectItem value="ru-RU">Russian (Russia)</SelectItem>
                <SelectItem value="zh-CN">Chinese (Mandarin, Simplified)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3">
            <Label className="text-base font-medium text-foreground">Stop Word</Label>
            <Input
              className="bg-[var(--input-background)] border-[var(--text)]/20 text-[var(--text)] focus-visible:ring-1 focus-visible:ring-[var(--active)] rounded-full"
              placeholder="e.g., 'stop'"
              value={config.asr?.stopWord || ''}
              onChange={e => updateConfig({ asr: { ...config.asr, stopWord: e.target.value } })}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
