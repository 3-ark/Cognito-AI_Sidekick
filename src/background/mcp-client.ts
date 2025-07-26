import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js"
// This interface should match the one in MCPServerManager.tsx.
// For better maintainability, you might consider moving this to a shared types file.
interface MCPServer {
  name: string;
  url: string; // This will now be a WebSocket URL, e.g., "ws://localhost:8080"
  env?: { [key: string]: string };
}

// Based on the MCP specification for a Prompt/Tool definition.
interface MCPToolDefinition {
  name: string;
  description?: string;
  arguments?: object;
}

export class MCPClient {
  private client: Client;
  private transport: WebSocketClientTransport;
  private isConnected: boolean = false;

  constructor(server: MCPServer) {
    // The server.url is now the WebSocket URL.
    // The 'env' property is not used by the WebSocket transport, as the server
    // is expected to be running independently with its own environment. The second argument to WebSocketClientTransport is for options, not env. The extra '});' was a syntax error.
    this.transport = new WebSocketClientTransport(new URL(server.url));

    this.client = new Client({
      name: "cognito-ai-sidekick",
      version: "0.1.0",
      title: "Cognito AI Sidekick Extension",
    });
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      console.warn("Client is already connected.");
      return;
    }
    await this.client.connect(this.transport);
    this.isConnected = true;
  }

  disconnect(): void {
    if (this.isConnected) {
      // The transport's close() method closes the WebSocket connection.
      // The Client class itself does not have a disconnect method; the transport is responsible.
      this.transport.close();
      this.isConnected = false;
    }
  }

  async listTools(): Promise<MCPToolDefinition[]> {
    const prompts = await this.client.listPrompts();
    if (!Array.isArray(prompts)) {
      console.error("[MCP Client] listPrompts() did not return an array, but:", prompts);
      return [];
    }
    return prompts as MCPToolDefinition[];
  }

  async getPrompt(params: Parameters<Client['getPrompt']>[0]) {
    return this.client.getPrompt(params);
  }

  async listResources() {
    return this.client.listResources();
  }

  async readResource(params: Parameters<Client['readResource']>[0]) {
    return this.client.readResource(params);
  }

  async callTool(params: Parameters<Client['callTool']>[0]) {
    return this.client.callTool(params);
  }
}
