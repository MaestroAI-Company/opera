//one server pulled out of a pasted configuration
export interface ParsedServer {
  name: string;
  url: string;
  headerName: string;
  headerValue: string;
}

export interface ParseResult {
  servers: ParsedServer[];
  //human readable lines about what could not be taken as-is
  skipped: string[];
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'server';
  }
}

//vscode and claude desktop write ${input:...} and ${env:...} for secrets
function isPlaceholder(value: string): boolean {
  return value.includes('${');
}

function readEntry(name: string, entry: any, skipped: string[]): ParsedServer | null {
  if (!entry || typeof entry !== 'object') {
    skipped.push(`"${name}" is not a server entry.`);
    return null;
  }
  //stdio servers spawn a local process, which only a desktop shell could do
  if (entry.command) {
    skipped.push(`"${name}" runs a local command. Opera only connects to servers over HTTP.`);
    return null;
  }
  if (typeof entry.url !== 'string' || !entry.url.trim()) {
    skipped.push(`"${name}" has no url.`);
    return null;
  }

  let headerName = '';
  let headerValue = '';
  const headers = entry.headers;
  if (headers && typeof headers === 'object') {
    const entries = Object.entries(headers).filter(([, v]) => typeof v === 'string') as [string, string][];
    if (entries.length > 0) {
      [headerName, headerValue] = entries[0];
      if (entries.length > 1) {
        const extra = entries.slice(1).map(([k]) => k).join(', ');
        skipped.push(`"${name}" declares more headers than Opera can store, kept ${headerName} and dropped ${extra}.`);
      }
      if (isPlaceholder(headerValue)) {
        headerValue = '';
        skipped.push(`"${name}" has a placeholder for ${headerName}, fill the header value in yourself.`);
      }
    }
  }

  return { name, url: entry.url.trim(), headerName, headerValue };
}

//accepts the vscode, claude desktop, bare map and single server shapes
export function parseServerConfig(text: string): ParseResult {
  let doc: any;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new Error('That is not valid JSON.');
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error('Paste a configuration object.');
  }

  //a lone server entry carries a url instead of a map of names
  if (typeof doc.url === 'string') {
    const skipped: string[] = [];
    const server = readEntry(hostnameOf(doc.url), doc, skipped);
    return { servers: server ? [server] : [], skipped };
  }

  const map = doc.servers ?? doc.mcpServers ?? doc;
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    throw new Error('No servers found in this configuration.');
  }

  const skipped: string[] = [];
  const servers: ParsedServer[] = [];
  for (const [name, entry] of Object.entries(map)) {
    const server = readEntry(name, entry, skipped);
    if (server) servers.push(server);
  }

  if (servers.length === 0 && skipped.length === 0) {
    throw new Error('No servers found in this configuration.');
  }
  return { servers, skipped };
}

//the add field takes either a plain server link or a pasted configuration
export function parseServerInput(text: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Paste a server link or an mcp.json block.');

  if (/^https?:\/\//i.test(trimmed)) {
    return { servers: [{ name: hostnameOf(trimmed), url: trimmed, headerName: '', headerValue: '' }], skipped: [] };
  }
  if (!trimmed.startsWith('{')) {
    throw new Error('Paste a server link or an mcp.json block.');
  }
  return parseServerConfig(trimmed);
}
