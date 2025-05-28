import { useState } from 'react';
import toast from 'react-hot-toast';
import { FaEye, FaEyeSlash, FaCheck, FaTimes } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfig } from './ConfigContext';
import { cn } from "@/src/background/util";

export const ConnectCustom = () => {
  const { config, updateConfig } = useConfig();
  const [apiKey, setApiKey] = useState(config?.customApiKey || '');
  const [endpoint, setEndpoint] = useState(config?.customEndpoint || '');
  const [visibleApiKey, setVisibleApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const onSaveSettings = () => {
    if (!endpoint) {
        toast.error("Custom endpoint URL is required.");
        return;
    }
    setIsLoading(true);
    setTimeout(() => {
      updateConfig({
        customApiKey: apiKey,
        customEndpoint: endpoint,
        customConnected: true,
        customError: undefined,
        models: (config?.models || []).filter(m => m.id !== 'custom_endpoint').concat([
          { id: 'custom_endpoint', host: 'custom', name: 'Custom Endpoint Model', active: true }
        ]),
        selectedModel: 'custom_endpoint',
      });
      toast.success('Custom endpoint settings saved');
      setIsLoading(false);
    }, 500);
  };

  const onResetSettings = () => {
    setApiKey('');
    setEndpoint('');
    updateConfig({
      customApiKey: '',
      customEndpoint: '',
      customConnected: false,
      customError: undefined,
      models: (config?.models || []).filter(m => m.id !== 'custom_endpoint'),
    });
    toast.success('Custom endpoint settings reset');
  };

  const saveButtonDisabled = (!endpoint && !apiKey) || isLoading;
  const isConnected = config?.customConnected; 

  return (
    <div className="space-y-2">
      <Input
        id="custom-endpoint-url"
        placeholder="Custom OpenAI-Compatible Endpoint URL"
        value={endpoint}
        onChange={e => setEndpoint(e.target.value)}
        className={cn(
           {"pr-8": true}
        )}
        disabled={isLoading}
      />
      <div className="flex items-center space-x-3">
        <div className="relative flex-grow">
            <Input
            id="custom-api-key"
            autoComplete="off"
            placeholder="API Key (Optional)"
            type={visibleApiKey ? 'text' : 'password'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            className={cn(
                {"pr-8": true}
            )}
            disabled={isLoading}
            />
            <Button
                variant="ghost" size="sm"
                className={cn(
                    "absolute inset-y-0 right-0 flex items-center justify-center",
                    "h-8 w-8 text-[var(--text)]/70 hover:text-[var(--text)]"
                )}
                onClick={() => setVisibleApiKey(!visibleApiKey)}
                aria-label={visibleApiKey ? "Hide API key" : "Show API key"}
                disabled={isLoading}
            >
                {visibleApiKey ? <FaEyeSlash className="h-4 w-4" /> : <FaEye className="h-4 w-4" />}
            </Button>
        </div>

        {!isConnected && (
          <Button
          onClick={onSaveSettings}
          variant="connect"
          size="sm"            
          disabled={saveButtonDisabled}
          >
            {isLoading ? "..." : "Save"}
          </Button>
        )}
        {isConnected && (
          <>
            <Button
              variant="ghost" size="sm" aria-label="Custom Endpoint Settings Saved"
              className={cn( "w-8 h-8 rounded-md text-[var(--success)]")}
            >
              <FaCheck className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost" size="sm" aria-label="Reset Custom Endpoint Settings"
              onClick={onResetSettings}
              className={cn( "h-8 w-8 rounded-md text-[var(--error)] hover:bg-[var(--error)]/10")}
              disabled={isLoading}
            >
              <FaTimes className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
};