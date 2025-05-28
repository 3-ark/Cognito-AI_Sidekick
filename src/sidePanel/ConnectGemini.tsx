import { useState } from 'react';
import toast from 'react-hot-toast';
import { FaEye, FaEyeSlash, FaCheck } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfig } from './ConfigContext';
import { GEMINI_URL } from './constants';
import { cn } from "@/src/background/util";

export const ConnectGemini = () => {
  const { config, updateConfig } = useConfig();
  const [apiKey, setApiKey] = useState(config?.geminiApiKey);
  const [visibleApiKey, setVisibleApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const onConnect = () => {
    if (!apiKey) {
      toast.error("API key is required for Gemini.");
      return;
    }
    setIsLoading(true);
    toast.dismiss();
    toast.loading('Connecting to Gemini...');

    fetch(GEMINI_URL, { headers: { Authorization: `Bearer ${apiKey}` }} )
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
          toast.error(`${data?.error?.message}`);
          updateConfig({ geminiError: data?.error?.message, geminiConnected: false });
        } else {
          toast.success('connected to Gemini');
          updateConfig({
            geminiApiKey: apiKey,
            geminiConnected: true,
            geminiError: undefined,
            models: [
              ...(config?.models || []),
              { id: 'gemini', host: 'gemini', active: true }
            ],
            selectedModel: 'gemini'
          });
        }
      })
      .catch(err => {
        toast.dismiss();
        toast.error(err.message || "Failed to connect to Gemini");
        updateConfig({ geminiError: err.message, geminiConnected: false });
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  const connectButtonDisabled = !apiKey || isLoading;
  const isConnected = config?.geminiConnected;

  return (
    <div className="flex items-center space-x-3">
      <div className="relative flex-grow">
        <Input
          id="gemini-api-key"
          autoComplete="off"
          placeholder="GEMINI_API_KEY"
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
            className={cn("absolute inset-y-0 right-0 flex items-center justify-center", "h-8", "w-8 text-[var(--text)]/70 hover:text-[var(--text)]")}
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
          variant="ghost" size="sm" aria-label="Connected to Gemini"
          className={cn("h-8", "w-8 rounded-md text-[var(--success)]")}
          onClick={onConnect}
          disabled={isLoading}
        >
          <FaCheck className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
};