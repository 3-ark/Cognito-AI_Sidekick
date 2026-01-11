import React, { useEffect, useRef, useState } from 'react';
import { Input } from "@/components/ui/input";
import { cn } from "@/src/background/util";
import { type Config } from "@/src/types/config";
import { FiChevronDown } from 'react-icons/fi';

export interface ModelSelectionProps {
  config: Config;
  updateConfig: (newConfig: Partial<Config>) => void;
  fetchAllModels: () => Promise<void>;
}

export const ModelSelection: React.FC<ModelSelectionProps> = ({
  config,
  updateConfig,
  fetchAllModels,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });

  const filteredModels =
    config?.models?.filter(
      (model) =>
        model.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        model.host?.toLowerCase()?.includes(searchQuery.toLowerCase())
    ) || [];

  useEffect(() => {
    if (inputFocused && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [inputFocused, config.selectedModel]); // Added config.selectedModel to recalculate on change when not focused

  useEffect(() => {
    if (!inputFocused) return;
    const handleResizeScroll = () => {
      if (inputRef.current) {
        const rect = inputRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
        });
      }
    };
    window.addEventListener('resize', handleResizeScroll);
    window.addEventListener('scroll', handleResizeScroll, true);
    return () => {
      window.removeEventListener('resize', handleResizeScroll);
      window.removeEventListener('scroll', handleResizeScroll, true);
    };
  }, [inputFocused]);

  return (
    <div className="relative w-full">
      <div className="relative flex items-center w-full">
        <Input
          id="model-input"
          ref={inputRef}
          value={inputFocused ? searchQuery : config?.selectedModel || ''}
          placeholder={
            inputFocused
              ? 'Search models...'
              : config?.selectedModel || 'Select model...'
          }
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => {
            setSearchQuery('');
            setInputFocused(true);
            fetchAllModels();
          }}
          className={cn(
            "text-(--text) bg-transparent rounded-none w-full justify-start font-medium h-6 font-['Space_Mono',_monospace]", // Removed shadow-md
            "pr-7" // Add padding to the right for the arrow
          )}
        />
        <FiChevronDown
          className={cn(
            "absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-(--text) opacity-70",
            "pointer-events-none" // Make icon non-interactive
          )}
        />
      </div>
      {inputFocused && (
        <div
          className="fixed inset-0 z-50" // This creates a full-screen overlay to catch clicks outside
          onClick={() => setInputFocused(false)}
        >
          <div
            className={cn(
              "absolute", // Position will be based on dropdownPosition
              "bg-(--bg)",
              "no-scrollbar",
              "shadow-md",
              "overflow-y-auto z-[100]" // Ensure dropdown is above other elements
            )}
            style={{
              maxHeight: `min(calc(50vh - 6rem), 300px)`, // Keep original max height logic
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              width: `${dropdownPosition.width}px`,
            }}
            onClick={(e) => e.stopPropagation()} // Prevent click inside dropdown from closing it
          >
            <div className="py-0.5">
              {filteredModels.length > 0 ? (
                filteredModels.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    className={cn(
                      "w-full text-left",
                      "px-4 py-1.5",
                      "text-(--text) text-sm",
                      "hover:bg-(--active)/20",
                      "focus:bg-(--active)/30",
                      "transition-colors duration-150",
                      "font-['Space_Mono',_monospace]"
                    )}
                    onClick={() => {
                      updateConfig({ selectedModel: model.id });
                      setSearchQuery(''); // Clear search query
                      setInputFocused(false);
                    }}
                  >
                    <div className="flex items-center">
                      <span>
                        {model.host ? `(${model.host}) ` : ''}
                        {model.id}
                        {model.context_length && (
                          <span className="text-xs text-(--text) opacity-50 ml-1">
                            [ctx: {model.context_length}]
                          </span>
                        )}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-4 py-1.5 text-(--text) opacity-50 text-sm">
                  No models found
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
