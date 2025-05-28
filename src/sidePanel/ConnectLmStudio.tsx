import { useState } from 'react';
import toast from 'react-hot-toast';
import { FiCheck } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfig } from './ConfigContext';
import { cn } from "@/src/background/util";

export const ConnectLmStudio = () => {
  const { config, updateConfig } = useConfig();
  const [url, setUrl] = useState(config?.lmStudioUrl || 'http://localhost:1234');
  const [isLoading, setIsLoading] = useState(false);

  const onConnect = () => {
    setIsLoading(true);
    toast.dismiss();
    toast.loading('Connecting to LM Studio...');

    fetch(`${url}/v1/models`)
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
        if (Array.isArray(data.data)) {
          updateConfig({
            lmStudioConnected: true,
            lmStudioUrl: url,
            lmStudioError: undefined,
            models: (config?.models || []).filter(m => m.id !== 'lmstudio_generic').concat([
              { id: 'lmstudio_generic', host: 'lmstudio', active: true, name: 'LM Studio Model' }
            ]),
            selectedModel: 'lmstudio_generic'
          });
          toast.dismiss();
          toast.success("Connected to LM Studio");
        } else if (data?.error) {
          updateConfig({ lmStudioError: data.error.message, lmStudioConnected: false });
          toast.dismiss();
          toast.error(data.error.message);
        } else {
          updateConfig({ lmStudioError: "Unexpected response from LM Studio", lmStudioConnected: false });
          toast.dismiss();
          toast.error('Unexpected response from LM Studio');
        }
      })
      .catch(err => {
        toast.dismiss();
        toast.error(err.message || "Failed to connect to LM Studio");
        updateConfig({ lmStudioError: err.message, lmStudioConnected: false });
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  const isConnected = config?.lmStudioConnected;

  return (
    <div className="flex items-center space-x-3">
      <Input
        id="lmstudio-url-input"
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="http://localhost:1234"
        className="pr-8"
        disabled={isLoading}
      />
      {!isConnected && (
        <Button
          onClick={onConnect}
          variant="connect"
          size="sm"
          disabled={isLoading}
        >
          {isLoading ? "..." : "Connect"}
        </Button>
      )}
      {isConnected && (
        <Button
          variant="ghost" size="sm" aria-label="Connected to LM Studio"
          className={cn("w-8 rounded-md text-[var(--success)]")}
          disabled={isLoading}
          onClick={onConnect}
        >
          <FiCheck className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
};