import { DeviceEventEmitter } from 'react-native';
import { ToolManager } from '../ai/tools/ToolManager';
import { AppEvents } from '../events';
import { Settings } from '../settings/SettingsService';
import { McpAuth } from './McpAuth';
import { parseServerInput } from './config';
import { McpClient, McpUnauthorizedError } from './McpClient';
import { getSecret, setSecret } from './mcpStorage';
import { McpTool } from './McpTool';
import { McpServerConfig, McpServerStatus } from './types';

function newId(): string {
  return `mcp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

//host name reads better than a raw url in the tool prefix
function labelFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'server';
  }
}

class McpServiceImpl {
  private servers: McpServerConfig[] = [];
  private clients = new Map<string, McpClient>();
  private statuses = new Map<string, McpServerStatus>();
  private toolsByServer = new Map<string, McpTool[]>();
  //last 401 challenge per server, needed to find the authorization server
  private challenges = new Map<string, string | null>();

  private syncSub: { remove(): void } | null = null;

  async init(): Promise<void> {
    this.readServers();
    //a sync can bring in servers added on another device
    if (!this.syncSub) {
      this.syncSub = DeviceEventEmitter.addListener(AppEvents.syncCompleted, () => {
        this.reload().catch((e) => console.warn('[McpService] reload after sync failed:', e));
      });
    }
  }

  private readServers(): void {
    const raw = Settings.getCached().mcpServers;
    try {
      const parsed = JSON.parse(raw || '[]');
      this.servers = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.servers = [];
    }
  }

  //re-read the list after a sync, connecting what arrived and dropping what left
  async reload(): Promise<void> {
    const before = new Set(this.servers.map((s) => s.id));
    this.readServers();
    const present = new Set(this.servers.map((s) => s.id));

    for (const id of before) {
      if (present.has(id)) continue;
      this.clients.delete(id);
      this.statuses.delete(id);
      this.toolsByServer.delete(id);
    }
    this.publishTools();

    await Promise.all(this.servers.filter((s) => !before.has(s.id)).map((s) => this.connect(s.id)));
  }

  getServers(): McpServerConfig[] {
    return this.servers;
  }

  getStatus(id: string): McpServerStatus {
    return this.statuses.get(id) ?? { state: 'idle', toolCount: 0 };
  }

  private async persist(): Promise<void> {
    await Settings.set('mcpServers', JSON.stringify(this.servers));
  }

  private setStatus(id: string, status: McpServerStatus): void {
    this.statuses.set(id, status);
    DeviceEventEmitter.emit(AppEvents.mcpServersChanged);
  }

  //add servers from a pasted link or mcp.json style configuration
  async importConfig(text: string): Promise<{ added: McpServerConfig[]; skipped: string[] }> {
    const { servers, skipped } = parseServerInput(text);
    const notes = [...skipped];
    const added: McpServerConfig[] = [];

    for (const parsed of servers) {
      if (this.servers.some((s) => s.url === parsed.url)) {
        notes.push(`"${parsed.name}" is already in the list.`);
        continue;
      }
      const server: McpServerConfig = {
        id: newId(),
        name: parsed.name,
        url: parsed.url,
        headerName: parsed.headerName,
        clientId: '',
      };
      if (parsed.headerValue) await setSecret(`${server.id}_header`, parsed.headerValue);
      added.push(server);
    }

    if (added.length > 0) {
      this.servers = [...this.servers, ...added];
      await this.persist();
      await Promise.all(added.map((s) => this.connect(s.id)));
    }
    return { added, skipped: notes };
  }

  async updateServer(id: string, patch: Partial<McpServerConfig>): Promise<void> {
    this.servers = this.servers.map((s) => (s.id === id ? { ...s, ...patch } : s));
    await this.persist();
  }

  async removeServer(id: string): Promise<void> {
    this.servers = this.servers.filter((s) => s.id !== id);
    this.clients.delete(id);
    this.statuses.delete(id);
    this.toolsByServer.delete(id);
    await McpAuth.forget(id);
    await this.persist();
    this.publishTools();
  }

  //custom header value, kept beside the oauth tokens
  async getHeaderValue(id: string): Promise<string> {
    return (await getSecret(`${id}_header`)) ?? '';
  }

  async setHeaderValue(id: string, value: string): Promise<void> {
    await setSecret(`${id}_header`, value || null);
  }

  private async authHeaders(id: string): Promise<Record<string, string>> {
    const token = await McpAuth.getAccessToken(id);
    if (token) return { Authorization: `Bearer ${token}` };

    const server = this.servers.find((s) => s.id === id);
    const value = await this.getHeaderValue(id);
    if (server?.headerName && value) return { [server.headerName]: value };
    return {};
  }

  private buildClient(server: McpServerConfig): McpClient {
    const client = new McpClient(server.url, () => this.authHeaders(server.id));
    this.clients.set(server.id, client);
    return client;
  }

  //handshake and discover tools for one server
  async connect(id: string): Promise<void> {
    const server = this.servers.find((s) => s.id === id);
    if (!server?.url.trim()) return;
    //index and the overlay both boot the service
    if (this.statuses.get(id)?.state === 'connecting') return;

    this.setStatus(id, { state: 'connecting', toolCount: 0 });
    try {
      const client = this.buildClient(server);
      const serverName = await client.connect();
      const infos = await client.listTools();

      //adopt the server's own name once, so tool prefixes stay stable afterwards
      const label = serverName && server.name === labelFromUrl(server.url) ? serverName : server.name;
      if (label !== server.name) await this.updateServer(id, { name: label });

      this.toolsByServer.set(
        id,
        infos.map((info) => new McpTool(id, label, info.name, info, (sid, name, args) => this.callTool(sid, name, args))),
      );

      this.setStatus(id, { state: 'connected', serverName, toolCount: infos.length });
      this.challenges.delete(id);
      this.publishTools();
    } catch (e: any) {
      this.clients.delete(id);
      this.toolsByServer.delete(id);
      if (e instanceof McpUnauthorizedError) {
        this.challenges.set(id, e.challenge);
        this.setStatus(id, { state: 'needs_auth', toolCount: 0 });
      } else {
        console.warn(`[McpService] ${server.url} failed:`, e?.message || e);
        this.setStatus(id, { state: 'error', toolCount: 0, error: e?.message || 'Connection failed' });
      }
      this.publishTools();
    }
  }

  async connectAll(): Promise<void> {
    await Promise.all(this.servers.map((s) => this.connect(s.id)));
  }

  //run the oauth flow then retry the handshake
  async authorize(id: string): Promise<boolean> {
    const server = this.servers.find((s) => s.id === id);
    if (!server) return false;
    try {
      const ok = await McpAuth.authorize(id, server.url, this.challenges.get(id) ?? null, server.clientId);
      if (ok) await this.connect(id);
      return ok;
    } catch (e: any) {
      console.warn('[McpService] authorize failed:', e?.message || e);
      this.setStatus(id, { state: 'error', toolCount: 0, error: e?.message || 'Authorization failed' });
      return false;
    }
  }

  //tools discovered on a connected server, in settings order
  getTools(id: string): McpTool[] {
    return this.toolsByServer.get(id) ?? [];
  }

  //rebuild the whole mcp tool set and hand it to the tool manager
  private publishTools(): void {
    const tools = this.servers.flatMap((s) => this.toolsByServer.get(s.id) ?? []);
    ToolManager.setMcpTools(tools);
    DeviceEventEmitter.emit(AppEvents.mcpServersChanged);
  }

  async callTool(serverId: string, name: string, args: Record<string, any>): Promise<string> {
    const client = this.clients.get(serverId);
    if (!client) return 'This MCP server is not connected.';
    try {
      return await client.callTool(name, args);
    } catch (e: any) {
      if (e instanceof McpUnauthorizedError) {
        this.challenges.set(serverId, e.challenge);
        this.setStatus(serverId, { state: 'needs_auth', toolCount: 0 });
        return 'This MCP server needs to be reconnected in the settings.';
      }
      return `MCP error: ${e?.message || 'unknown error'}`;
    }
  }
}

export const McpService = new McpServiceImpl();
