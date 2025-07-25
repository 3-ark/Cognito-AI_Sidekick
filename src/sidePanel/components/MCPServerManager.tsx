import * as React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { SettingTitle } from '../SettingsTitle';
import { cn } from "@/src/background/util";

interface MCPServer {
  name: string;
  url: string;
}

export const MCPServerManager: React.FC = () => {
  const [servers, setServers] = React.useState<MCPServer[]>([]);
  const [newServerName, setNewServerName] = React.useState('');
  const [newServerUrl, setNewServerUrl] = React.useState('');

  const addServer = () => {
    if (newServerName && newServerUrl) {
      const newServer = { name: newServerName, url: newServerUrl };
      const updatedServers = [...servers, newServer];
      setServers(updatedServers);
      setNewServerName('');
      setNewServerUrl('');
      // Save to storage
    }
  };

  const removeServer = (index: number) => {
    const updatedServers = servers.filter((_, i) => i !== index);
    setServers(updatedServers);
    // Save to storage
  };

  return (
    <AccordionItem
      value="mcp-servers"
      className={cn(
        "bg-[var(--input-background)] border-[var(--text)]/20 rounded-xl shadow-md",
        "transition-all duration-150 ease-in-out",
        "hover:border-[var(--active)] hover:brightness-105"
      )}
    >
      <AccordionTrigger
        className={cn(
          "flex items-center justify-between w-full px-3 py-2 hover:no-underline",
          "text-[var(--text)] font-medium",
          "hover:brightness-95",
        )}
      >
        <SettingTitle icon="🔌" text="MCP Servers" />
      </AccordionTrigger>
      <AccordionContent
        className="px-3 pb-4 pt-2 text-[var(--text)]"
      >
        <div className="space-y-4">
          <div>
            <Label>MCP Servers</Label>
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
            <Button onClick={addServer}>
              <FiPlus />
            </Button>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
