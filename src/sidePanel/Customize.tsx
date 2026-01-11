import 'react-color-palette/css';

import {
  useCallback, useEffect, useState,
} from 'react';
import {
  ColorPicker, IColor, useColor,
} from 'react-color-palette';
import { useTranslation } from 'react-i18next';

import { useConfig } from './ConfigContext';
import { LanguageSelector } from './components/LanguageSelector';

import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Switch } from "@/components/ui/switch";

export type Theme = {
  name: string;
  active: string;
  bg: string;
  text: string;
  bold: string;
  italic: string;
  link: string;
  mute: string;
};

export const themes: Theme[] = [
  {
    name: 'paper',
    active: '#dcc299',
    bg: '#F5E9D5',
    text: '#4A4A4A',
    bold: '#af1b1b',
    italic: '#036427',
    link: '#003bb9',
    mute: '#A08C7D',
  },
  {
    name: 'night-sepia',
    bg: '#2B2B2B',
    text: '#E0CDA9',
    active: '#8A6C4E',
    link: '#90acf0',
    bold: '#d97c5f',
    italic: '#a3b36e',
    mute: '#A08C7D',
  },
  {
    name: 'moss',
    active: '#8d9c6e',
    bg: '#f5e6c4',
    text: '#111111',
    bold: '#883333',
    italic: '#4a39a5',
    link: '#4367b6',
    mute: '#7F7F7F',
  },
  {
    name: 'light',
    active: '#c6e1fe',
    bg: '#F1F3F5', 
    text: '#212529', 
    bold: '#004080', 
    italic: '#555555', 
    link: '#0056b3',
    mute: '#6C757D',    
  },
  {
    name: 'dark',
    active: '#5d5ca7',
    bg: '#373737',
    text: '#e3e3e3',
    bold: '#d28400',
    italic: '#70aa85',
    link: '#95a4c9',
    mute: '#A9A9A9',
  },
  {
    name: 'custom',
    bg: '#2B2B2B',
    text: '#E0CDA9',
    active: '#B6A075',
    link: '#c2b28f',
    bold: '#d97c5f',
    italic: '#a3b36e',
    mute: '#A08C7D',
},
];

function isColorDark(color: string): boolean {
  if (!color) return false;

  const hex = color.replace(/[^0-9a-f]/gi, '');
  
  let r, g, b;

  if (hex.length <= 4) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else {
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
  }

  if (isNaN(r) || isNaN(g) || isNaN(b)) return false;

  const brightness = (r * 299 + g * 587 + b * 114) / 1000;

  return brightness < 128;
}

export const setTheme = (c: Theme, paperTextureEnabled: boolean = true) => {
  const root = document.documentElement;

  document.documentElement.dataset.paperTexture = String(paperTextureEnabled);

  if (!c) {
    console.error("setTheme called with undefined theme object");

    return;
  }

  const isDarkBg = c.bg && isColorDark(c.bg);
  const isDarkTheme = isDarkBg;

  root.dataset.theme = isDarkTheme ? 'dark' : 'light';
  
  if (isDarkTheme) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  const convertHexToRGBA = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const a = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;

    return `rgba(${r}, ${g}, ${b}, ${a})`;
  };

  const bg = convertHexToRGBA(c.bg || '#ffffff');
  const text = convertHexToRGBA(c.text || '#000000');
  const active = convertHexToRGBA(c.active || '#007bff');
  const bold = convertHexToRGBA(c.bold || '#000000');
  const italic = convertHexToRGBA(c.italic || '#000000');
  const link = convertHexToRGBA(c.link || '#007bff');
  const codeFg = text;
  const codeBg = isDarkTheme ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.05)';
  const preFg = text;
  const preBg = isDarkTheme ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.05)';
  const mute = convertHexToRGBA(c.mute || '#75757580');
  const tableBorder = text;
  const errorColor = convertHexToRGBA(isDarkTheme ? '#d18383' : '#d32f2f');
  const successColor = convertHexToRGBA(isDarkTheme ? '#76ae79' : '#388e3c');
  const warningColor = convertHexToRGBA('#fbc02d');

  root.style.setProperty('--background', bg);
  root.style.setProperty('--foreground', text);
  root.style.setProperty('--card', bg);
  root.style.setProperty('--card-foreground', text);
  root.style.setProperty('--popover', bg);
  root.style.setProperty('--popover-foreground', text);
  root.style.setProperty('--primary', active);
  root.style.setProperty('--primary-foreground', bg);
  root.style.setProperty('--secondary', active);
  root.style.setProperty('--secondary-foreground', bg);
  root.style.setProperty('--muted', codeBg);
  root.style.setProperty('--muted-foreground', mute);
  root.style.setProperty('--accent', active);
  root.style.setProperty('--accent-foreground', bg);
  root.style.setProperty('--destructive', errorColor);
  root.style.setProperty('--destructive-foreground', bg);
  root.style.setProperty('--border', text);
  root.style.setProperty('--input', text);
  root.style.setProperty('--ring', active);

  root.style.setProperty('--markdown-h1', bold);
  root.style.setProperty('--markdown-h2', italic);
  root.style.setProperty('--markdown-h3', text);
  root.style.setProperty('--markdown-strong', bold);
  root.style.setProperty('--markdown-em', italic);
  root.style.setProperty('--markdown-link', link);
  root.style.setProperty('--markdown-inline-code-foreground', codeFg);
  root.style.setProperty('--markdown-code-background', codeBg);
  root.style.setProperty('--markdown-pre-foreground', preFg);
  root.style.setProperty('--markdown-pre-background', preBg);
  root.style.setProperty('--markdown-table-border', tableBorder);
  root.style.setProperty('--markdown-thead-background', active);
  root.style.setProperty('--markdown-thead-foreground', bg);

  root.style.setProperty('--bold', bold);
  root.style.setProperty('--italic', italic);
  root.style.setProperty('--link', link);
  root.style.setProperty('--error', errorColor);
  root.style.setProperty('--success', successColor);
  root.style.setProperty('--warning', warningColor);
  root.style.setProperty('--bg', bg);
  root.style.setProperty('--text', text);
  root.style.setProperty('--active', active);
};

const PaletteColorPicker = ({
  initialColor,
  onColorChangeComplete,
  themeKey,
}: {
  initialColor: string;
  onColorChangeComplete: (key: keyof Omit<Theme, 'name'>, color: IColor) => void;
  themeKey: keyof Omit<Theme, 'name'>;
}) => {
  const normalizedHex = normalizeColor(initialColor);

  const [color, setColor] = useColor(normalizedHex);

  const handleChange = (newColor: IColor) => {
    setColor(newColor);
  };

  const handleComplete = (finalColor: IColor) => {
    let hex = finalColor.hex.slice(0, 7);

    if (finalColor.rgb.a !== undefined && finalColor.rgb.a < 1) {
      const alphaHex = Math.round(finalColor.rgb.a * 255)
        .toString(16)
        .padStart(2, '0');

      hex += alphaHex;
    } else {
      hex += 'ff';
    }

    hex = hex.slice(0, 9);

    onColorChangeComplete(themeKey, { ...finalColor, hex });
  };

  return (
    <div className="p-3">
      <ColorPicker
        color={color}
        onChange={handleChange}
        onChangeComplete={handleComplete}
      />
    </div>
  );
};

export const Customize = () => {
  const { config, updateConfig } = useConfig();
  const { t } = useTranslation();
  const currentFontSize = config?.fontSize || 14;
  
  const [pickerVisibleForKey, setPickerVisibleForKey] = useState<keyof Omit<Theme, 'name'> | null>(null);
  const [customThemeColors, setCustomThemeColors] = useState<Omit<Theme, 'name'>>(() => {
    const baseDefault = themes.find(t => t.name === 'custom')!;
    const { name, ...restOfBaseDefault } = baseDefault;

    const configCustom = (typeof config?.customTheme === 'object' && config.customTheme !== null)
      ? config.customTheme
      : {};
    
    const mergedInitialState: Omit<Theme, 'name'> = {
        bg: configCustom.bg ?? restOfBaseDefault.bg,
        text: configCustom.text ?? restOfBaseDefault.text,
        active: configCustom.active ?? restOfBaseDefault.active,
        bold: configCustom.bold ?? restOfBaseDefault.bold,
        italic: configCustom.italic ?? restOfBaseDefault.italic,
        link: configCustom.link ?? restOfBaseDefault.link,
        mute: configCustom.mute ?? restOfBaseDefault.mute,
    };

    return mergedInitialState;
  });

  useEffect(() => {
    if (config?.theme === 'custom') {
      const configCustom = (typeof config?.customTheme === 'object' && config.customTheme !== null)
        ? config.customTheme
        : {};
      const baseDefault = themes.find(t => t.name === 'custom')!;
      const { name, ...restOfBaseDefault } = baseDefault;
      const newCustomColorsCandidate: Omit<Theme, 'name'> = {
        bg: configCustom.bg ?? restOfBaseDefault.bg,
        text: configCustom.text ?? restOfBaseDefault.text,
        active: configCustom.active ?? restOfBaseDefault.active,
        bold: configCustom.bold ?? restOfBaseDefault.bold,
        italic: configCustom.italic ?? restOfBaseDefault.italic,
        link: configCustom.link ?? restOfBaseDefault.link,
        mute: configCustom.mute ?? restOfBaseDefault.mute,
      };

      if (JSON.stringify(customThemeColors) !== JSON.stringify(newCustomColorsCandidate)) {
        setCustomThemeColors(newCustomColorsCandidate);
      }
    }
  }, [config?.customTheme, config?.theme, customThemeColors]);

  const handleColorChange = useCallback((key: keyof Omit<Theme, 'name'>, colorResult: IColor) => {
    console.log(`Themes: handleColorChange called for key "${key}" with color`, colorResult.hex);
    const value = colorResult.hex;

    setCustomThemeColors(prevCustomColors => {
      const newThemeData = { ...prevCustomColors, [key]: value };
      
      console.log("Themes: Updating config with new customTheme and setting theme to 'custom'", newThemeData);
      updateConfig({
        customTheme: newThemeData,
        theme: 'custom',
      });

      return newThemeData;
    });
  }, [updateConfig]);

  const editableColorKeys: Array<keyof Omit<Theme, 'name'>> = ['bg', 'text', 'active', 'bold', 'italic', 'link', 'mute'];
  const effectiveCustomThemeForPickers: Theme = { ...customThemeColors, name: 'custom' };

  useEffect(() => {
    const currentThemeName = config?.theme || 'paper';
    const isCustom = currentThemeName === 'custom';
    let themeToApply: Theme | undefined;

    if (isCustom) {
      const baseCustomDefinition = themes.find(t => t.name === 'custom')!;

      themeToApply = {
        ...baseCustomDefinition,
        ...customThemeColors,   
        name: 'custom',
      };
    } else {
      themeToApply = themes.find(t => t.name === currentThemeName) || themes.find(t => t.name === 'paper');
    }

    if (themeToApply) {
      setTheme(themeToApply, config?.paperTexture ?? true);
    } else {
      const ultimateFallbackTheme = themes.find(t => t.name === 'paper') || themes[0];

      if (ultimateFallbackTheme) {
        console.warn(`Themes: No theme definition found for "${currentThemeName}". Applying ultimate fallback: ${ultimateFallbackTheme.name}.`);
        setTheme(ultimateFallbackTheme, config?.paperTexture ?? true);
      } else {
        console.error("Themes: Critical error - themes array is empty. Cannot apply any theme.");
      }
    }

    if (config?.fontSize) {
      document.documentElement.style.setProperty('--global-font-size', `${config.fontSize}px`);
    }
  }, [config?.theme, customThemeColors, config?.paperTexture, config?.fontSize]);

  return (
    <div
      className="relative z-1 top-0 w-full h-full flex-1 flex-col overflow-y-auto overflow-x-hidden bg-transparent text-foreground p-6 scrollbar-hidden"
      id="settings"
    >
      <div className="flex flex-col gap-6">
        <div className="space-y-3">
          <Label className="text-base font-medium text-foreground">{t('language')}</Label>
          <LanguageSelector />
        </div>
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between pr-3">
              <Label className="text-base font-medium text-foreground cursor-pointer" htmlFor="generateTitle-switch">Create chat title</Label>
              <Switch
                checked={config?.generateTitle ?? false}
                id="generateTitle-switch"
                onCheckedChange={checked => updateConfig({ generateTitle: checked })}
              />
            </div>
            <div className="flex items-center justify-between pr-3">
              <Label className="text-base font-medium text-foreground cursor-pointer" htmlFor="backgroundImage-switch">Background illustration</Label>
              <Switch
                checked={config?.backgroundImage ?? false}
                id="backgroundImage-switch"
                onCheckedChange={checked => updateConfig({ backgroundImage: checked })}
              />
            </div>
            <div className="flex items-center justify-between pr-3">
              <Label className="text-base font-medium text-foreground cursor-pointer" htmlFor="animatedBackground-switch">Animated background</Label>
              <Switch
                checked={config?.animatedBackground ?? true}
                id="animatedBackground-switch"
                onCheckedChange={checked => updateConfig({ animatedBackground: checked })}
              />
            </div>
            <div className="flex items-center justify-between pr-3">
              <Label className="text-base font-medium text-foreground cursor-pointer" htmlFor="paperTexture-switch">Paper texture</Label>
              <Switch
                checked={config?.paperTexture ?? true}
                id="paperTexture-switch"
                onCheckedChange={checked => updateConfig({ paperTexture: checked })}
              />
            </div>
            <div className="flex items-center justify-between pr-3">
              <Label className="text-base font-medium text-foreground cursor-pointer" htmlFor="latex-switch">Enable LaTeX</Label>
              <Switch
                checked={config?.latexEnabled ?? true}
                id="latex-switch"
                onCheckedChange={(checked) => updateConfig({ latexEnabled: checked })}
              />
            </div>
          </div>

          <div>
            <p className="text-foreground text-base font-medium pb-3 text-left">Font Size: {currentFontSize}px</p>
            <Slider className="w-full" max={20} min={7} step={1} value={[currentFontSize]} variant="themed" onValueChange={value => { updateConfig({ fontSize: value[0] }); }} />
          </div>

          <div className="pt-4 mt-4 border-t border-(--text)/20">
            <div className="space-y-2 mb-4">
              <h4 className="font-medium leading-none text-foreground">Custom Theme Colors</h4>
              <p className="text-sm text-muted-foreground">Modify colors for your 'custom' theme. Selecting a color will automatically apply the custom theme.</p>
            </div>
            <div className="space-y-3">
              {editableColorKeys.map(key => {
                const colorValue = effectiveCustomThemeForPickers[key];
                const normalizedColor = normalizeColor(colorValue);
                const isValid = isValidColor(colorValue);

                if (!isValid) {
                  console.error(`Themes UI: Invalid color value for key "${key}":`, colorValue);

                  return (
                    <div key={key} className="flex items-center justify-between p-2 text-red-500 bg-red-100 rounded-md">
                      <Label className="capitalize text-sm font-medium text-red-600">{key}</Label>
                      <span>Invalid color: "{String(colorValue)}"</span>
                    </div>
                  );
                }

                return (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="capitalize text-sm font-medium text-foreground">{key}</Label>
                    <Popover 
                      open={pickerVisibleForKey === key} 
                      onOpenChange={isOpen => setPickerVisibleForKey(isOpen ? key : null)}
                    >
                      <PopoverTrigger asChild>
                        <button 
                          aria-label={`Pick color for ${key}: ${normalizedColor}`} 
                          className="w-20 h-8 border border-border rounded-sm cursor-pointer hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background" 
                          style={{ backgroundColor: normalizedColor }}
                        />
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-auto p-0 bg-popover border border-border shadow-lg z-51" side="right" sideOffset={10} onOpenAutoFocus={e => e.preventDefault()} >
                        {pickerVisibleForKey === key && (
                          <PaletteColorPicker key={`${key}-${colorValue}`} initialColor={colorValue} themeKey={key} onColorChangeComplete={handleColorChange} />
                        )}
                      </PopoverContent>
                    </Popover>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
  );
};

function isValidColor(color: string): boolean {
  if (!color) return false;
  
  const hex = color.replace(/[^0-9a-f]/gi, '');
  
  return [6, 8].includes(hex.length);
}

function normalizeColor(color: string): string {
  if (!color) return '#000000ff';

  let hex = color.replace(/[^0-9a-f]/gi, '');

  hex = hex.slice(0, 8);

  if (hex.length < 6) {
    hex = hex.padEnd(6, '0');
  }

  if (hex.length === 6) {
    hex += 'ff';
  }

  hex = hex.slice(0, 8);

  return `#${hex}`;
}
