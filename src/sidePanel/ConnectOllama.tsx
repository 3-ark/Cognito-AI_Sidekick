import { useState } from 'react';
import toast from 'react-hot-toast';
import { FiCheck } from 'react-icons/fi';

import { useConfig } from './ConfigContext';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from "@/src/background/util";

export const ConnectOllama = () => {
  const { config, updateConfig } = useConfig();
  const [url, setUrl] = useState(config?.ollamaUrl || 'http://localhost:11434');
  const [isLoading, setIsLoading] = useState(false);

  const onConnect = () => {
    setIsLoading(true);
    toast.dismiss();
    toast.loading('Connecting to Ollama...');

    fetch(`${url}/v1/models`)
      .then(res => {
        if (!res.ok) {
          return res.json().then(errData => {
            throw new Error(errData?.error || `Connection failed: ${res.status} ${res.statusText}`);
          }).catch(() => {
            throw new Error(`Connection failed: ${res.status} ${res.statusText}`);
          });
        }

        return res.json();
      })
      .then(data => {
        if (Array.isArray(data.data)) {
          updateConfig({
            ollamaConnected: true,
            ollamaUrl: url,
            ollamaError: undefined,
            models: (config?.models || [])
              .filter(m => m.host !== 'ollama')
              .concat(
                data.data.map((model: any) => ({
 id: model.id, name: model.id, host: 'ollama', active: true, 
})),
              ),
            selectedModel: config?.selectedModel && data.data.some((m:any) => m.id === config.selectedModel) ? config.selectedModel : data.data[0]?.id,
          });
          toast.dismiss();
          toast.success("Connected to ollama");
        } else if (data?.error) {
          updateConfig({ ollamaError: data.error, ollamaConnected: false });
          toast.dismiss();
          toast.error(typeof data.error === 'string' ? data.error : "Ollama connection error");
        } else {
          updateConfig({ ollamaError: "Unexpected response from Ollama", ollamaConnected: false });
          toast.dismiss();
          toast.error('Unexpected response from Ollama');
        }
      })
      .catch(err => {
        toast.dismiss();
        toast.error(err.message || "Failed to connect to Ollama");
        updateConfig({ ollamaError: err.message, ollamaConnected: false });
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  const isConnected = config?.ollamaConnected;

  return (
    <div className="flex items-center space-x-3">
      <Input
        className="pr-8 rounded-full"
        disabled={isLoading}
        id="ollama-url-input"
        placeholder="http://localhost:11434"
        value={url}
        onChange={e => setUrl(e.target.value)}
      />
      {!isConnected && (
        <Button
          disabled={isLoading} 
          size="sm"
          variant="connect"
          onClick={onConnect}
          >
          {isLoading ? "..." : "Connect"}
        </Button>
      )}
      {isConnected && (
        <Button
          aria-label="Connected to Ollama"
className={cn("w-8 rounded-md text-[var(--success)]")}
disabled={isLoading} 
          size="sm"
          variant="ghost"
          onClick={onConnect}
        >
          <FiCheck className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
};
