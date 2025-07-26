import { Client, Connection } from "@modelcontextprotocol/sdk/client/index.js";

class MCPClient {
  private client: Client;
  private connections: { [serverUri: string]: Connection } = {};

  constructor() {
    this.client = new Client({
      name: 'cognito-ai-sidekick',
      version: '0.1.0',
      title: 'Cognito AI Sidekick Extension',
    });
  }

  async connect(serverUri: string, env?: { [key: string]: string }) {
    if (this.connections[serverUri]) {
      console.log(`Already connected to ${serverUri}`);
      return;
    }
    try {
      const connection = await this.client.connect(serverUri, { env });
      this.connections[serverUri] = connection;
      console.log(`Connected to MCP server at ${serverUri}`);
    } catch (error) {
      console.error(`Failed to connect to MCP server at ${serverUri}:`, error);
    }
  }

  async disconnect(serverUri: string) {
    const connection = this.connections[serverUri];
    if (connection) {
      await connection.close();
      delete this.connections[serverUri];
      console.log(`Disconnected from MCP server at ${serverUri}`);
    }
  }

  async listTools() {
    const allTools = [];
    for (const serverUri in this.connections) {
      const connection = this.connections[serverUri];
      const tools = await connection.listTools();
      allTools.push(...tools);
    }
    return allTools;
  }

  async callTool(toolName: string, args: any) {
    for (const serverUri in this.connections) {
      const connection = this.connections[serverUri];
      const tools = await connection.listTools();
      if (tools.some(tool => tool.name === toolName)) {
        return await connection.callTool(toolName, args);
      }
    }
    throw new Error(`Tool ${toolName} not found on any connected server`);
  }
}

export default new MCPClient();
