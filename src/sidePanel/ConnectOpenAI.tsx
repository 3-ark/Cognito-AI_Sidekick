import { useState } from 'react';
import toast from 'react-hot-toast';
import {
 FaCheck,FaEye, FaEyeSlash, 
} from 'react-icons/fa';

import { useConfig } from './ConfigContext';
import { OPENAI_URL } from './constants';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from "@/src/background/util";

export const ConnectOpenAI = () => {
  const { config, updateConfig } = useConfig();
  const [apiKey, setApiKey] = useState(config?.openAiApiKey || '');
  const [visibleApiKey, setVisibleApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const onConnect = () => {
    if (!apiKey) {
      toast.error("API key is required for OpenAI.");

      return;
    }

    setIsLoading(true);
    toast.dismiss();
    toast.loading('Connecting to OpenAI...');

    fetch(OPENAI_URL, { headers: { Authorization: `Bearer ${apiKey}` } })
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
        if (data?.error) {
          toast.error(`${data?.error?.message}`)

          updateConfig({ openAiError: data?.error?.message, openAiConnected: false });
        } else {
          toast.success('connected to OpenAI');

          updateConfig({
            openAiApiKey: apiKey,
            openAiConnected: true,
            openAiError: undefined,
            models: [
              ...(config?.models || []),
              {
 id: 'openai', host: 'openai', active: true, 
},
            ],
            selectedModel: 'openai',
          });
        }
      })
      .catch(err => {
        toast.dismiss();
        toast.error(err.message || "Failed to connect to OpenAI");
        updateConfig({ openAiError: err.message, openAiConnected: false });
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  const connectButtonDisabled = !apiKey || isLoading;
  const isConnected = config?.openAiConnected;

  return (
    <div className="flex items-center space-x-3">
      <div className="relative flex-grow">
        <Input
          autoComplete="off"
          className={cn(
            { "pr-8": true }, "rounded-full"
          )}
          disabled={isLoading}
          id="openai-api-key"
          placeholder="OPENAI_API_KEY"
          type={visibleApiKey ? 'text' : 'password'}
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
        />
        <Button
            aria-label={visibleApiKey ? "Hide API key" : "Show API key"}
className={cn("absolute inset-y-0 right-0 flex items-center justify-center", "w-8 text-[var(--text)]/70 hover:text-[var(--text)]")}
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
          aria-label="Connected to OpenAI"
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
