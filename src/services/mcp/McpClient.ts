import { universalFetch } from '../ai/utils/universalFetch';
import { McpToolInfo } from './types';

//widely supported revision, servers negotiate down when they need to
const PROTOCOL_VERSION = '2025-06-18';
const REQUEST_TIMEOUT = 30_000;

//raised on 401 so the caller can start the oauth flow
export class McpUnauthorizedError extends Error {
  constructor(public challenge: string | null) {
    super('Authorization required');
  }
}

//the server may answer a request with json or a short sse stream
function parseSseMessages(body: string): any[] {
  const messages: any[] = [];
  for (const block of body.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');
    if (!data) continue;
    try {
      messages.push(JSON.parse(data));
    } catch { }
  }
  return messages;
}

//flatten a tools/call result into the plain text the model consumes
function flattenContent(result: any): string {
  const blocks: any[] = result?.content ?? [];
  const parts = blocks.map((block) => {
    if (block?.type === 'text') return block.text ?? '';
    if (block?.type === 'resource') return block.resource?.text ?? `[resource ${block.resource?.uri ?? ''}]`;
    return `[${block?.type ?? 'unknown'} content]`;
  });
  const text = parts.filter(Boolean).join('\n\n');
  if (text) return text;
  if (result?.structuredContent) return JSON.stringify(result.structuredContent);
  return 'The tool returned no content.';
}

export class McpClient {
  private sessionId: string | null = null;
  private negotiatedVersion = PROTOCOL_VERSION;
  private nextId = 1;

  constructor(
    private url: string,
    //resolved per request so a refreshed token is picked up
    private getAuthHeaders: () => Promise<Record<string, string>>,
  ) { }

  private async buildHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(await this.getAuthHeaders()),
    };
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    return headers;
  }

  private async post(payload: any): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      const headers = await this.buildHeaders();
      //the header is only meaningful once a version has been negotiated
      if (payload.method !== 'initialize') headers['MCP-Protocol-Version'] = this.negotiatedVersion;

      const res = await universalFetch(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (res.status === 401) throw new McpUnauthorizedError(res.headers.get('www-authenticate'));
      return res;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async notify(method: string, params?: any): Promise<void> {
    await this.post({ jsonrpc: '2.0', method, params });
  }

  private async request(method: string, params?: any): Promise<any> {
    const id = this.nextId++;
    const res = await this.post({ jsonrpc: '2.0', id, method, params });
    if (!res.ok) throw new Error(`${method} failed (${res.status})`);

    const body = await res.text();
    const contentType = res.headers.get('content-type') ?? '';
    const messages = contentType.includes('text/event-stream') ? parseSseMessages(body) : [JSON.parse(body)];

    const message = messages.find((m) => m?.id === id);
    if (!message) throw new Error(`${method} returned no response`);
    if (message.error) throw new Error(message.error.message ?? `${method} failed`);
    return message.result;
  }

  //initialize handshake, returns the server's advertised name
  async connect(): Promise<string | undefined> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    let res: Response;
    try {
      res = await universalFetch(this.url, {
        method: 'POST',
        headers: await this.buildHeaders(),
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: this.nextId++,
          method: 'initialize',
          params: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: 'Opera', version: '1.0.0' },
          },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (res.status === 401) throw new McpUnauthorizedError(res.headers.get('www-authenticate'));
    if (!res.ok) throw new Error(`Connection failed (${res.status})`);

    //the session id must ride along on every later request
    this.sessionId = res.headers.get('mcp-session-id');

    const body = await res.text();
    const contentType = res.headers.get('content-type') ?? '';
    const messages = contentType.includes('text/event-stream') ? parseSseMessages(body) : [JSON.parse(body)];
    const result = messages.find((m) => m?.result)?.result;
    if (!result) throw new Error('Server did not complete the handshake.');

    if (result.protocolVersion) this.negotiatedVersion = result.protocolVersion;
    await this.notify('notifications/initialized');
    return result.serverInfo?.name;
  }

  async listTools(): Promise<McpToolInfo[]> {
    const tools: McpToolInfo[] = [];
    let cursor: string | undefined;
    do {
      const result = await this.request('tools/list', cursor ? { cursor } : {});
      tools.push(...(result?.tools ?? []));
      cursor = result?.nextCursor;
    } while (cursor);
    return tools;
  }

  async callTool(name: string, args: Record<string, any>): Promise<string> {
    const result = await this.request('tools/call', { name, arguments: args });
    const text = flattenContent(result);
    return result?.isError ? `Tool reported an error: ${text}` : text;
  }
}
