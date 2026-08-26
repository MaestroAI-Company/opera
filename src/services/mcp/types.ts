//server entry as persisted in settings, never holds a secret
export interface McpServerConfig {
  id: string;
  //label shown in settings, falls back to the server's own name
  name: string;
  url: string;
  //header used when the server has no oauth, value lives in the secret store
  headerName: string;
  //oauth client id for servers that do not register apps automatically
  clientId?: string;
}

export type McpConnectionState = 'idle' | 'connecting' | 'connected' | 'needs_auth' | 'error';

export interface McpServerStatus {
  state: McpConnectionState;
  //server-reported name, kept for the settings label
  serverName?: string;
  toolCount: number;
  error?: string;
}

//tool as advertised by tools/list
export interface McpToolInfo {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: any;
}
