import * as React from 'react';
import {
  useEffect, useRef,
} from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronDown } from 'react-icons/fi';

import { useUpdateModels } from '../hooks/useUpdateModels';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { cn } from "@/src/background/util";
import { type Config } from "@/src/types/config";

export interface ModelSelectorProps {
  config: Config;
  updateConfig: (newConfig: Partial<Config>) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  config,
  updateConfig,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = React.useState('');
  const [inputFocused, setInputFocused] = React.useState(false);
  const { fetchAllModels } = useUpdateModels();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [dropdownPosition, setDropdownPosition] = React.useState<{ top: number; left: number; width: number }>({
    top: 0, left: 0, width: 0,
  });

  const trimmedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredModels =
    config?.models?.filter(
      model =>
        !trimmedSearchQuery ||
        model.id.toLowerCase().includes(trimmedSearchQuery) ||
        model.name?.toLowerCase()?.includes(trimmedSearchQuery) ||
        model.host?.toLowerCase()?.includes(trimmedSearchQuery) ||
        model.host_display_name?.toLowerCase()?.includes(trimmedSearchQuery),
    ) || [];

  useEffect(() => {
    if (inputFocused && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 2,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [inputFocused, searchQuery]);

  useEffect(() => {
    if (!inputFocused || !inputRef.current) return;

    const handleReposition = () => {
      if (inputRef.current) {
        const rect = inputRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + window.scrollY + 2,
          left: rect.left + window.scrollX,
          width: rect.width,
        });
      }
    };

    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [inputFocused]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current && !inputRef.current.contains(event.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node)
      ) {
        setInputFocused(false);
      }
    };

    if (inputFocused) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [inputFocused]);

  const getHostDisplayName = (host: string) => {
    if (host.startsWith('custom_endpoint')) {
      const customEndpoint = config.customEndpoints?.find(e => e.id === host);
      return customEndpoint?.name || host;
    }
    return host;
  };

  const selectedModel = config.models?.find(m => m.id === config.selectedModel);
  const selectedModelDisplay = selectedModel
    ? `${selectedModel.host ? `(${getHostDisplayName(selectedModel.host)}) ` : ''}${selectedModel.name || selectedModel.id}`
    : t('selectModel');

  const openSelectorSearch = () => {
    fetchAllModels();
    setSearchQuery('');
    setInputFocused(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  return (
    <div className="relative w-full">
      {!inputFocused && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label={t('selectedModel', { modelName: selectedModelDisplay })}
                className={cn(
                  "text-(--text) w-full flex items-center justify-between font-medium h-6 px-2 text-center",
                  "font-['Space_Mono',_monospace]",
                  "bg-transparent border-(--text)/20",
                  "cursor-pointer",
                )}
                type="button"
                onClick={openSelectorSearch}
              >
                <span className="truncate">{selectedModelDisplay}</span>
                <FiChevronDown className="h-4 w-4 opacity-70 flex-shrink-0" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{selectedModelDisplay}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <div className={cn(inputFocused ? "block" : "hidden")}>
        <Input
          ref={inputRef}
          autoComplete="off"
          className={cn(
            "text-(--text) rounded-sm w-full justify-start font-medium h-6 font-['Space_Mono',_monospace]",
            "focus:border-(--active) focus:ring-1 focus:ring-(--active)",
            "bg-transparent border-(--text)/20"
          )}
          id="model-selector-input"
          placeholder={t('searchModels')}
          onFocus={() => {
            if (!inputFocused) {
              setInputFocused(true);
            }
          }}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {inputFocused && (
        <div
          ref={dropdownRef}
          className={cn(
            "fixed z-50",
            "bg-(--bg)",
            "border border-(--active)/50",
            "rounded-md shadow-lg",
            "no-scrollbar",
            "overflow-y-auto",
          )}
          style={{
            maxHeight: `min(calc(50vh - 6rem), 200px)`,
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
          }}
        >
          <div className="py-0.5">
            <TooltipProvider>
              {filteredModels.length > 0 ? (
                filteredModels.map(model => (
                  <Tooltip key={model.id}>
                    <TooltipTrigger asChild>
                      <button
                        className={cn(
                          "w-full text-left",
                    "px-2 py-1.5",
                    "text-(--text) text-xs",
                    "hover:bg-(--active)/20",
                    "focus:bg-(--active)/30 focus:outline-none",
                    "transition-colors duration-150",
                    "font-['Space_Mono',_monospace]",
                  )}
                  type="button"
                  onClick={() => {
                    updateConfig({ selectedModel: model.id });
                    setSearchQuery('');
                    setInputFocused(false);
                    if (inputRef.current) {
                      inputRef.current.blur();
                    }
                  }}
                >
                  <div className="flex items-center">
                    <span>
                      {model.host ? `(${getHostDisplayName(model.host)}) ` : ''}
                      {model.name || model.id}
                      {typeof model.context_length === 'number' && (
                        <span className="text-xs text-(--text) opacity-60 ml-1.5">
                          {`(${t('ctx')}: ${model.context_length >= 100000 ? `${model.context_length / 1000}k` : model.context_length})`}
                        </span>
                      )}
                    </span>
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {model.host ? `(${getHostDisplayName(model.host)}) ` : ''}
                {model.name || model.id}
              </TooltipContent>
            </Tooltip>
              ))
            ) : (
              <div className="px-2 py-1.5 text-(--text) opacity-60 text-xs">
                {searchQuery ? t('noModelsMatch') : t('noModelsAvailable')}
              </div>
            )}
          </TooltipProvider>
        </div>
        </div>
      )}
    </div>
  );
};

export default ModelSelector;
