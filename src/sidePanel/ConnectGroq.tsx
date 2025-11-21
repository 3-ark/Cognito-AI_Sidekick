import { useState } from 'react';
import toast from 'react-hot-toast';
import {
 FaCheck,FaEye, FaEyeSlash, 
} from 'react-icons/fa';

import { useConfig } from './ConfigContext';
import { GROQ_URL } from './constants';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from "@/src/background/util";

export const ConnectGroq = () => {
  const { config, updateConfig } = useConfig();
  const [apiKey, setApiKey] = useState(config?.groqApiKey || '');
  const [visibleApiKey, setVisibleApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const onConnect = () => {
    if (!apiKey) {
      toast.error("API key is required for Groq.");

      return;
    }

    setIsLoading(true);
    toast.dismiss();
    toast.loading('Connecting to Groq...');

    fetch(`${GROQ_URL}`, { headers: { Authorization: `Bearer ${apiKey}` } })
      .then(res => {
        if (!res.ok) {
          return res.json().then(errData => {
            throw new Error(errData?.error?.message || `Connection failed: ${res.status} ${res.statusText}`);
          }).catch(() => {
            throw new Error(`Connection failed: ${res.status} ${res.statusText}`);
          });
        }

        return res.json();
      })
      .then(data => {
        if (Array.isArray(data.data) && data.data.length > 0) {
          updateConfig({
            groqApiKey: apiKey,
            groqConnected: true,
            groqError: undefined,
            models: (config?.models || []).filter(m => !m.id.startsWith('groq_')).concat(
              data.data.map((model: any) => ({
 id: `groq_${model.id}`, name: model.id, host: 'groq', active: true, 
})),
            ),
            selectedModel: config?.selectedModel || `groq_${data.data[0].id}`,
          });
          toast.dismiss();
          toast.success('Connected to Groq');
        } else if (data?.error) {
          updateConfig({ groqError: data.error.message, groqConnected: false });
          toast.dismiss();
          toast.error(data.error.message);
        } else {
           updateConfig({ groqError: "Unexpected response or no models found.", groqConnected: false });
          toast.dismiss();
          toast.error('Unexpected response or no models found from Groq.');
        }
      })
      .catch(err => {
        toast.dismiss();
        toast.error(err.message || "Failed to connect to Groq");
        updateConfig({ groqError: err.message, groqConnected: false });
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  const connectButtonDisabled = !apiKey || isLoading;
  const isConnected = config?.groqConnected;

  return (
    <div className="flex items-center space-x-3">
      <div className="relative flex-grow">
        <Input
          autoComplete="off"
          className="pr-8 rounded-full"
          disabled={isLoading}
          id="groq-api-key"
          placeholder="GROQ_API_KEY"
          type={visibleApiKey ? 'text' : 'password'}
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
        />
        <Button
            aria-label={visibleApiKey ? "Hide API key" : "Show API key"}
            className={cn(
                "absolute inset-y-0 right-0 flex items-center justify-center",
                "w-8 text-[var(--text)]/70 hover:text-[var(--text)]",
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
          disabled={connectButtonDisabled}
          size="sm"
          variant="connect"
          onClick={onConnect}
        >
          {isLoading ? "..." : "Save"}
        </Button>
      )}
      {isConnected && (
        <Button
          aria-label="Connected to Groq"
          className={cn("w-8 rounded-md text-[var(--success)]")}
          disabled={isLoading}
          size="sm"
          variant="ghost"
          onClick={onConnect}
        >
          <FaCheck className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
};
