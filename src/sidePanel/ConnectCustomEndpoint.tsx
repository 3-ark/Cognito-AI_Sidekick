import { useState } from 'react';
import toast from 'react-hot-toast';
import {
 FaCheck, FaEye, FaEyeSlash, FaTimes, 
} from 'react-icons/fa';

import { CustomEndpoint } from '../types/config';

import { useConfig } from './ConfigContext';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from "@/src/background/util";

interface ConnectCustomEndpointProps {
    endpointData: CustomEndpoint;
    index: number;
}

export const ConnectCustomEndpoint = ({ endpointData, index }: ConnectCustomEndpointProps) => {
  const { config, updateConfig } = useConfig();
  const [apiKey, setApiKey] = useState(endpointData.apiKey || '');
  const [endpoint, setEndpoint] = useState(endpointData.endpoint || '');
  const [name, setName] = useState(endpointData.name || '');
  const [visibleApiKey, setVisibleApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const onSaveSettings = () => {
    if (!endpoint) {
        toast.error("Custom endpoint URL is required.");

        return;
    }

    setIsLoading(true);
    setTimeout(() => {
      const updatedEndpoints = [...(config.customEndpoints || [])];

      updatedEndpoints[index] = {
        ...updatedEndpoints[index],
        apiKey,
        endpoint,
        name,
        connected: true,
        error: undefined,
      };

      const newModel = {
        id: endpointData.id,
        host: 'custom',
        name,
        active: true,
      };
      const otherModels = (config?.models || []).filter(m => m.id !== endpointData.id);

      updateConfig({
        customEndpoints: updatedEndpoints,
        models: [...otherModels, newModel],
        selectedModel: endpointData.id,
      });
      toast.success('Custom endpoint settings saved');
      setIsLoading(false);
    }, 500);
  };

  const onResetSettings = () => {
    setApiKey('');
    setEndpoint('');
    const updatedEndpoints = [...(config.customEndpoints || [])];

    updatedEndpoints[index] = {
 ...updatedEndpoints[index], apiKey: '', endpoint: '', connected: false, error: undefined, 
};

    updateConfig({
      customEndpoints: updatedEndpoints,
      models: (config?.models || []).filter(m => m.id !== endpointData.id),
    });
    toast.success('Custom endpoint settings reset');
  };

  const saveButtonDisabled = (!endpoint && !apiKey) || isLoading;
  const isConnected = endpointData.connected;

  return (
    <div className="space-y-2">
      <Input
        className="rounded-full"
        disabled={isLoading}
        id={`custom-endpoint-name-${index}`}
        placeholder="Custom Endpoint Name"
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <Input
        className={cn(
           { "pr-8": true }, "rounded-full"
        )}
        disabled={isLoading}
        id={`custom-endpoint-url-${index}`}
        placeholder="Custom OpenAI-Compatible Endpoint URL"
        value={endpoint}
        onChange={e => setEndpoint(e.target.value)}
      />
      <div className="flex items-center space-x-3">
        <div className="relative flex-grow">
            <Input
            autoComplete="off"
            className={cn(
                { "pr-8": true }, "rounded-full"
            )}
            disabled={isLoading}
            id={`custom-api-key-${index}`}
            placeholder="API Key (Optional)"
            type={visibleApiKey ? 'text' : 'password'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            />
            <Button
                aria-label={visibleApiKey ? "Hide API key" : "Show API key"}
className={cn(
                    "absolute inset-y-0 right-0 flex items-center justify-center",
                    "h-8 w-8 text-[var(--text)]/70 hover:text-[var(--text)]",
                )}
                disabled={isLoading}
                size="sm"
                variant="ghost"
                onClick={() => setVisibleApiKey(!visibleApiKey)}
            >
                {visibleApiKey ? <FaEyeSlash className="h-4 w-4" /> : <FaEye className="h-4 w-4" />}
            </Button>
        </div>

        {!isConnected && (
          <Button
          disabled={saveButtonDisabled}
          size="sm"
          variant="connect"            
          onClick={onSaveSettings}
          >
            {isLoading ? "..." : "Save"}
          </Button>
        )}
        {isConnected && (
          <>
            <Button
              aria-label="Custom Endpoint Settings Saved"
className={cn( "w-8 h-8 rounded-md text-[var(--success)]")}
size="sm"
              variant="ghost"
            >
              <FaCheck className="h-5 w-5" />
            </Button>
            <Button
              aria-label="Reset Custom Endpoint Settings"
className={cn( "h-8 w-8 rounded-md text-[var(--error)] hover:bg-[var(--error)]/10")}
disabled={isLoading}
              size="sm"
              variant="ghost"
              onClick={onResetSettings}
            >
              <FaTimes className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
