import { useState } from 'react';
import toast from 'react-hot-toast';
import { FaEye, FaEyeSlash, FaCheck } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfig } from './ConfigContext';
import { OPENROUTER_URL } from './constants';
import { cn } from "@/src/background/util";

export const ConnectOpenRouter = () => {
  const { config, updateConfig } = useConfig();
  const [apiKey, setApiKey] = useState(config?.openRouterApiKey || '');
  const [visibleApiKey, setVisibleApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const onConnect = () => {
    if (!apiKey) {
      toast.error("API key is required for OpenRouter.");
      return;
    }
    setIsLoading(true);
    toast.dismiss();
    toast.loading('Connecting to OpenRouter...');

    fetch(`${OPENROUTER_URL}`, { headers: { Authorization: `Bearer ${apiKey}` } })
      .then(res => {
        if (!res.ok) {
          return res.json().then(errData => {
            const errorMsg = errData?.error?.message || `Connection failed: ${res.status} ${res.statusText}`;
            throw new Error(errorMsg);
          }).catch(() => {
            throw new Error(`Connection failed: ${res.status} ${res.statusText}`);
          });
        }
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data.data) && data.data.length > 0) {
          updateConfig({
            openRouterApiKey: apiKey,
            openRouterConnected: true,
            openRouterError: undefined,
            models: (config?.models || []).filter(m => !m.id.startsWith('openrouter_')).concat(
              data.data.map((model: any) => ({
                id: `openrouter_${model.id}`,
                name: model.name || model.id,
                host: 'openrouter',
                active: true
              }))
            ),
          selectedModel: `openrouter_${data.data[0].id}`
          });
          toast.dismiss();
          toast.success('Connected to OpenRouter');
        } else if (data?.error) {
          updateConfig({ openRouterError: data.error.message, openRouterConnected: false });
          toast.dismiss();
          toast.error(data.error.message);
        } else {
          updateConfig({ openRouterError: "Unexpected response or no models found.", openRouterConnected: false });
          toast.dismiss();
          toast.error('Unexpected response or no models found from OpenRouter.');
        }
      })
      .catch(err => {
        toast.dismiss();
        toast.error(err.message || "Failed to connect to OpenRouter");
        updateConfig({ openRouterError: err.message, openRouterConnected: false });
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  const connectButtonDisabled = !apiKey || isLoading;
  const isConnected = config?.openRouterConnected;

  return (
    <div className="flex items-center space-x-3">
      <div className="relative flex-grow">
        <Input
          id="openrouter-api-key"
          autoComplete="off"
          placeholder="OPENROUTER_API_KEY"
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
            className={cn("absolute inset-y-0 right-0 flex items-center justify-center", "w-8 text-[var(--text)]/70 hover:text-[var(--text)]")}
            onClick={() => setVisibleApiKey(!visibleApiKey)}
            aria-label={visibleApiKey ? "Hide API key" : "Show API key"}
            disabled={isLoading}
        >
            {visibleApiKey ? <FaEyeSlash className="h-4 w-4" /> : <FaEye className="h-4 w-4" />}
        </Button>
      </div>

      {!isConnected && (
        <Button
          onClick={onConnect}
          variant="connect"
          size="sm"
          disabled={connectButtonDisabled}
        >
          {isLoading ? "..." : "Save"}
        </Button>
      )}
      {isConnected && (
        <Button
          variant="ghost" size="sm" aria-label="Connected to OpenRouter"
          className={cn("w-8 rounded-md text-[var(--success)]")}
          onClick={onConnect}
          disabled={isLoading}
        >
          <FaCheck className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
};