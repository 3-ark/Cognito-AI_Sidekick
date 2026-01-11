import * as React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { SettingTitle } from '../SettingsTitle';
import { cn } from "@/src/background/util";
import storage from '../../background/storageUtil';

interface MCPServer {
  name: string;
  url: string;
}

const MCP_SERVERS_KEY = 'mcpServers';

export const MCPServerManager: React.FC = () => {
  const [servers, setServers] = React.useState<MCPServer[]>([]);
  const [newServerName, setNewServerName] = React.useState('');
  const [newServerUrl, setNewServerUrl] = React.useState('');

  React.useEffect(() => {
    const fetchServers = async () => {
      const storedServers = await storage.getItem(MCP_SERVERS_KEY);
      // Ensure we handle both stringified JSON and raw objects for robustness.
      if (storedServers) {
        try {
          const parsedServers = typeof storedServers === 'string' ? JSON.parse(storedServers) : storedServers;
          if (Array.isArray(parsedServers)) {
            setServers(parsedServers);
          }
        } catch (e) {
          console.error("Failed to parse MCP servers from storage:", e);
        }
      }
    };
    fetchServers();
  }, []);

  const addServer = async () => {
    if (newServerName && newServerUrl) {
      const newServer = { name: newServerName, url: newServerUrl };
      const updatedServers = [...servers, newServer];
      setServers(updatedServers);
      await storage.setItem(MCP_SERVERS_KEY, JSON.stringify(updatedServers));
      setNewServerName('');
      setNewServerUrl('');
    }
  };

  const removeServer = async (index: number) => {
    const updatedServers = servers.filter((_, i) => i !== index);
    setServers(updatedServers);
    await storage.setItem(MCP_SERVERS_KEY, JSON.stringify(updatedServers));
  };

  return (
    <AccordionItem
      value="mcp-servers"
      className={cn(
        "bg-[var(--input-background)] border-(--text)/20 rounded-xl shadow-md",
        "transition-all duration-150 ease-in-out",
        "hover:border-(--active) hover:brightness-105"
      )}
    >
      <AccordionTrigger
        className={cn(
          "flex items-center justify-between w-full px-3 py-2 hover:no-underline",
          "text-(--text) font-medium",
          "hover:brightness-95",
        )}
      >
        <SettingTitle icon="🔌" text="MCP Servers" />
      </AccordionTrigger>
      <AccordionContent
        className="px-3 pb-4 pt-2 text-(--text)"
      >
        <div className="space-y-4">
          <div>
            <Label>MCP Servers</Label>
            <p className="text-sm text-muted-foreground">
              Add the WebSocket URL of a running MCP server. Example: ws://localhost:8080
            </p>
            <div className="space-y-2 mt-2">
              {servers.map((server, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <Input value={server.name} readOnly className="flex-1" />
                  <Input value={server.url} readOnly className="flex-1" />
                  <Button variant="ghost" size="sm" onClick={() => removeServer(index)}>
                    <FiTrash2 />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Input
              placeholder="Server Name"
              value={newServerName}
              onChange={(e) => setNewServerName(e.target.value)}
            />
            <Input
              placeholder="Server URL"
              value={newServerUrl}
              onChange={(e) => setNewServerUrl(e.target.value)}
            />
            <Button variant="ghost" onClick={addServer}>
              <FiPlus />
            </Button>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
