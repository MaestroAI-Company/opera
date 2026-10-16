import 'react-native-get-random-values';
import * as Device from 'expo-device';
import { NativeModules, Platform } from 'react-native';
import { getSecret, setSecret } from '../mcp/mcpStorage';

export type PairedHub = { id: string; name: string; relays: string[] };
//cpu is a share of the hub machine, memory in bytes
export type HubStatus = {
  name: string;
  version: string;
  direct: boolean;
  update?: string | null;
  cpu?: number | null;
  memory?: number | null;
};
export type HubDevice = {
  id: string;
  name: string;
  kind: string;
  scopes: string[];
  pairedAt: number;
  pairedBy: string | null;
  lastSeen?: number;
};
export type SyncRecord = { id: string; updatedAt: number; deleted: boolean; payload: string | null };
export type PullPage = { records: SyncRecord[]; cursor: number; more: boolean };
export type McpGrant = {
  serverId: string;
  tokenEndpoint: string;
  clientId: string;
  refreshToken: string;
  accessToken: string | null;
  expiresAt: number;
};
export type McpAccessToken = { accessToken: string; expiresAt: number };
//mcp ones are servers the hub hosts
export type HubProvider = { id: string; name: string; kind: 'ollama' | 'openai' | 'mcp' };
//a hub on this computer, desktop only
//installed means it starts with the session
export type HostStatus = { running: boolean; installed: boolean; id: string | null };
//a one time code and the link its qr shows
export type HubInvite = { code: string; link: string };
export type HubSettings = { lanDiscovery: boolean; shareProviders: boolean };
export type NearbyHub = { id: string; name: string; addrs: string[] };
//llama.cpp models on the hub
export type CatalogModel = { repo: string; file: string; name: string; size: number };
export type ModelRepo = { repo: string; downloads: number };
export type ModelFile = { file: string; size: number };
//repo is unknown for files copied by hand
export type InstalledModel = ModelFile & { repo?: string | null };
export type ModelDownload = { repo: string; file: string; received: number; total: number; error?: string | null };
export type LlamaStatus = {
  state: 'idle' | 'installing' | 'running' | 'failed';
  backend?: string | null;
  message?: string | null;
  installed: InstalledModel[];
  downloads: ModelDownload[];
};
export type HubErrorCode =
  | 'InvalidLink'
  | 'PairingRejected'
  | 'PairingExpired'
  | 'Unauthorized'
  | 'Unreachable'
  | 'Outdated'
  | 'Internal';

type NativeHub = {
  //missing on builds older than hub 0.5
  deviceId?(deviceKey: string): Promise<string>;
  pair(deviceKey: string, link: string, deviceName: string, kind: string): Promise<PairedHub>;
  pairWithCode(deviceKey: string, code: string, deviceName: string, kind: string): Promise<PairedHub>;
  invite(deviceKey: string, hub: PairedHub): Promise<HubInvite>;
  qrSvg(text: string, dark: string, light: string): Promise<string>;
  //admin only, browsers lack it
  hubSettings?(deviceKey: string, hub: PairedHub): Promise<HubSettings>;
  setHubSettings?(deviceKey: string, hub: PairedHub, settings: HubSettings): Promise<HubSettings>;
  //browsers cannot use multicast
  nearbyHubs?(deviceKey: string, waitMs: number): Promise<NearbyHub[]>;
  updateHub?(deviceKey: string, hub: PairedHub): Promise<string>;
  //admin only, browsers lack it
  modelsCatalog?(deviceKey: string, hub: PairedHub): Promise<CatalogModel[]>;
  modelsSearch?(deviceKey: string, hub: PairedHub, query: string): Promise<ModelRepo[]>;
  modelsFiles?(deviceKey: string, hub: PairedHub, repo: string): Promise<ModelFile[]>;
  modelsDownload?(deviceKey: string, hub: PairedHub, repo: string, file: string): Promise<LlamaStatus>;
  modelsCancel?(deviceKey: string, hub: PairedHub, file: string): Promise<LlamaStatus>;
  modelsDelete?(deviceKey: string, hub: PairedHub, file: string): Promise<LlamaStatus>;
  modelsStatus?(deviceKey: string, hub: PairedHub): Promise<LlamaStatus>;
  mcpJson?(deviceKey: string, hub: PairedHub, request: string): Promise<string>;
  status(deviceKey: string, hub: PairedHub): Promise<HubStatus>;
  unpair(deviceKey: string, hub: PairedHub): Promise<void>;
  devices(deviceKey: string, hub: PairedHub): Promise<HubDevice[]>;
  renameDevice(deviceKey: string, hub: PairedHub, id: string, name: string): Promise<void>;
  removeDevice(deviceKey: string, hub: PairedHub, id: string): Promise<void>;
  push(deviceKey: string, hub: PairedHub, collection: string, records: SyncRecord[]): Promise<void>;
  pull(deviceKey: string, hub: PairedHub, collection: string, since: number): Promise<PullPage>;
  watch(deviceKey: string, hub: PairedHub, since: number): Promise<number>;
  putGrant(deviceKey: string, hub: PairedHub, grant: McpGrant): Promise<void>;
  accessToken(deviceKey: string, hub: PairedHub, serverId: string): Promise<McpAccessToken | null>;
  dropGrant(deviceKey: string, hub: PairedHub, serverId: string): Promise<void>;
  providers(deviceKey: string, hub: PairedHub): Promise<HubProvider[]>;
  startProxy(deviceKey: string, hub: PairedHub): Promise<{ port: number; token: string }>;
};

//mcp servers hosted on the hub, opera/mcp/1 shapes
export type McpSource =
  | { type: 'mcpb'; url: string; sha256: string }
  | { type: 'npm'; package: string; version: string }
  | { type: 'pypi'; package: string; version: string };
export type McpField = {
  key: string;
  label: string;
  description: string;
  kind: 'text' | 'number' | 'boolean' | 'folder' | 'file';
  required: boolean;
  secret: boolean;
  default?: string | null;
};
export type McpListing = {
  id: string;
  title: string;
  description: string;
  version: string;
  publisher: string;
  repository?: string | null;
  license?: string | null;
  source: McpSource;
  fields: McpField[];
  arguments: { flag?: string | null; value?: string | null; field?: string | null }[];
  env: { name: string; value?: string | null; field?: string | null }[];
  offline: boolean;
  registry?: string | null;
};
export type McpServerState = 'installing' | 'starting' | 'running' | 'failed' | 'stopped';
export type HostedMcpServer = {
  id: string;
  listing: McpListing;
  enabled: boolean;
  state: McpServerState;
  message?: string | null;
  values: Record<string, string>;
  secrets_set: string[];
  tools: string[];
  update?: string | null;
  usage?: { cpu: number; memory: number } | null;
};
export type McpStatus = { isolation: 'full' | 'partial'; servers: HostedMcpServer[] };
export type McpFolders = { path: string; parent?: string | null; folders: string[] };

export type HubMcp = {
  catalog(): Promise<McpListing[]>;
  search(query: string): Promise<McpListing[]>;
  prepare(listing: McpListing): Promise<McpListing>;
  install(listing: McpListing, values: Record<string, string>): Promise<string>;
  configure(id: string, values: Record<string, string>): Promise<McpStatus>;
  enable(id: string, on: boolean): Promise<McpStatus>;
  restart(id: string): Promise<McpStatus>;
  update(id: string): Promise<McpStatus>;
  remove(id: string): Promise<McpStatus>;
  status(): Promise<McpStatus>;
  logs(id: string): Promise<string[]>;
  folders(path?: string): Promise<McpFolders>;
  registries(): Promise<string[]>;
  setRegistries(urls: string[]): Promise<string[]>;
};

export type HubModels = {
  catalog(): Promise<CatalogModel[]>;
  search(query: string): Promise<ModelRepo[]>;
  files(repo: string): Promise<ModelFile[]>;
  download(repo: string, file: string): Promise<LlamaStatus>;
  cancel(file: string): Promise<LlamaStatus>;
  remove(file: string): Promise<LlamaStatus>;
  status(): Promise<LlamaStatus>;
};

type HubHost = {
  status(): Promise<HostStatus>;
  start(): Promise<void>;
  stop(): Promise<void>;
  pairingLink(): Promise<string>;
  computerName(): Promise<string>;
};

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const isBrowser = Platform.OS === 'web' && !isTauri;

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import('@tauri-apps/api/core');
  return core.invoke<T>(command, args);
}

//desktop runs the same rust client natively
const tauriHub: NativeHub = {
  deviceId: (deviceKey) => invoke('hub_device_id', { deviceKey }),
  pair: (deviceKey, link, deviceName, kind) => invoke('hub_pair', { deviceKey, link, deviceName, kind }),
  pairWithCode: (deviceKey, code, deviceName, kind) =>
    invoke('hub_pair_with_code', { deviceKey, code, deviceName, kind }),
  invite: (deviceKey, hub) => invoke('hub_invite', { deviceKey, hub }),
  qrSvg: (text, dark, light) => invoke('hub_qr_svg', { text, dark, light }),
  hubSettings: (deviceKey, hub) => invoke('hub_settings', { deviceKey, hub }),
  setHubSettings: (deviceKey, hub, settings) => invoke('hub_set_settings', { deviceKey, hub, settings }),
  nearbyHubs: (deviceKey, waitMs) => invoke('hub_nearby', { deviceKey, waitMs }),
  updateHub: (deviceKey, hub) => invoke('hub_update', { deviceKey, hub }),
  modelsCatalog: (deviceKey, hub) => invoke('hub_models_catalog', { deviceKey, hub }),
  modelsSearch: (deviceKey, hub, query) => invoke('hub_models_search', { deviceKey, hub, query }),
  modelsFiles: (deviceKey, hub, repo) => invoke('hub_models_files', { deviceKey, hub, repo }),
  modelsDownload: (deviceKey, hub, repo, file) => invoke('hub_models_download', { deviceKey, hub, repo, file }),
  modelsCancel: (deviceKey, hub, file) => invoke('hub_models_cancel', { deviceKey, hub, file }),
  modelsDelete: (deviceKey, hub, file) => invoke('hub_models_delete', { deviceKey, hub, file }),
  modelsStatus: (deviceKey, hub) => invoke('hub_models_status', { deviceKey, hub }),
  mcpJson: (deviceKey, hub, request) => invoke('hub_mcp_json', { deviceKey, hub, request }),
  status: (deviceKey, hub) => invoke('hub_status', { deviceKey, hub }),
  unpair: (deviceKey, hub) => invoke('hub_unpair', { deviceKey, hub }),
  devices: (deviceKey, hub) => invoke('hub_devices', { deviceKey, hub }),
  renameDevice: (deviceKey, hub, id, name) => invoke('hub_rename_device', { deviceKey, hub, id, name }),
  removeDevice: (deviceKey, hub, id) => invoke('hub_remove_device', { deviceKey, hub, id }),
  push: (deviceKey, hub, collection, records) => invoke('hub_push', { deviceKey, hub, collection, records }),
  pull: (deviceKey, hub, collection, since) => invoke('hub_pull', { deviceKey, hub, collection, since }),
  watch: (deviceKey, hub, since) => invoke('hub_watch', { deviceKey, hub, since }),
  putGrant: (deviceKey, hub, grant) => invoke('hub_put_grant', { deviceKey, hub, grant }),
  accessToken: (deviceKey, hub, serverId) => invoke('hub_access_token', { deviceKey, hub, serverId }),
  dropGrant: (deviceKey, hub, serverId) => invoke('hub_drop_grant', { deviceKey, hub, serverId }),
  providers: (deviceKey, hub) => invoke('hub_providers', { deviceKey, hub }),
  startProxy: (deviceKey, hub) => invoke('hub_start_proxy', { deviceKey, hub }),
};

const tauriHost: HubHost = {
  status: () => invoke('hub_host_status'),
  start: () => invoke('hub_host_start'),
  stop: () => invoke('hub_host_stop'),
  pairingLink: () => invoke('hub_host_pairing_link'),
  computerName: () => invoke('hub_computer_name'),
};

type WebResponse = {
  status: number;
  headers: [string, string][];
  read(): Promise<Uint8Array | undefined>;
  cancel(): void;
};

type WebClient = {
  deviceId(): string;
  pair(link: string, deviceName: string, kind: string): Promise<PairedHub>;
  pairWithCode(code: string, deviceName: string, kind: string): Promise<PairedHub>;
  invite(hub: PairedHub): Promise<HubInvite>;
  status(hub: PairedHub): Promise<HubStatus>;
  unpair(hub: PairedHub): Promise<void>;
  devices(hub: PairedHub): Promise<HubDevice[]>;
  renameDevice(hub: PairedHub, id: string, name: string): Promise<void>;
  removeDevice(hub: PairedHub, id: string): Promise<void>;
  push(hub: PairedHub, collection: string, records: SyncRecord[]): Promise<void>;
  pull(hub: PairedHub, collection: string, since: number): Promise<PullPage>;
  watch(hub: PairedHub, since: number): Promise<number>;
  putGrant(hub: PairedHub, grant: McpGrant): Promise<void>;
  accessToken(hub: PairedHub, serverId: string): Promise<McpAccessToken | null>;
  dropGrant(hub: PairedHub, serverId: string): Promise<void>;
  providers(hub: PairedHub): Promise<HubProvider[]>;
  forward(
    hub: PairedHub,
    provider: string,
    method: string,
    path: string,
    headers: [string, string][],
    body: Uint8Array,
  ): Promise<WebResponse>;
};

type WebModule = {
  default(options: { module_or_path: string }): Promise<unknown>;
  WebHubClient: new (secretKey: Uint8Array) => WebClient;
  qrSvg(text: string, dark: string, light: string): string;
};

//public files, built or downloaded before the web bundle
const WEB_MODULE_URL = '/opera-hub/opera-hub-client-web.js';
const WEB_WASM_URL = '/opera-hub/opera-hub-client-web.wasm';
//statuses a response body is not allowed for
const BODYLESS_STATUSES = [204, 205, 304];

let webModule: Promise<WebModule> | null = null;
let webClient: { key: string; client: WebClient } | null = null;

async function loadWebModule(): Promise<WebModule> {
  //metro must not bundle it, hermes cannot even parse it
  const importAtRuntime = new Function('url', 'return import(url)') as (url: string) => Promise<WebModule>;
  webModule ??= importAtRuntime(WEB_MODULE_URL).then(async (mod) => {
    await mod.default({ module_or_path: WEB_WASM_URL });
    return mod;
  });
  return webModule.catch((e) => {
    webModule = null;
    throw Object.assign(new Error(`Sampler web client missing: ${e}`), { code: 'Internal' });
  });
}

async function loadWebClient(deviceKey: string): Promise<WebClient> {
  if (webClient?.key === deviceKey) return webClient.client;
  const mod = await loadWebModule();
  const bytes = Uint8Array.from(deviceKey.match(/../g) ?? [], (byte) => parseInt(byte, 16));
  webClient = { key: deviceKey, client: new mod.WebHubClient(bytes) };
  return webClient.client;
}

//browsers run the same rust client in wasm, over relays
const webHub: NativeHub = {
  deviceId: async (deviceKey) => (await loadWebClient(deviceKey)).deviceId(),
  pair: async (deviceKey, link, deviceName, kind) => (await loadWebClient(deviceKey)).pair(link, deviceName, kind),
  pairWithCode: async (deviceKey, code, deviceName, kind) =>
    (await loadWebClient(deviceKey)).pairWithCode(code, deviceName, kind),
  invite: async (deviceKey, hub) => (await loadWebClient(deviceKey)).invite(hub),
  qrSvg: async (text, dark, light) => (await loadWebModule()).qrSvg(text, dark, light),
  status: async (deviceKey, hub) => (await loadWebClient(deviceKey)).status(hub),
  unpair: async (deviceKey, hub) => (await loadWebClient(deviceKey)).unpair(hub),
  devices: async (deviceKey, hub) => (await loadWebClient(deviceKey)).devices(hub),
  renameDevice: async (deviceKey, hub, id, name) => (await loadWebClient(deviceKey)).renameDevice(hub, id, name),
  removeDevice: async (deviceKey, hub, id) => (await loadWebClient(deviceKey)).removeDevice(hub, id),
  push: async (deviceKey, hub, collection, records) =>
    (await loadWebClient(deviceKey)).push(hub, collection, records),
  pull: async (deviceKey, hub, collection, since) => (await loadWebClient(deviceKey)).pull(hub, collection, since),
  watch: async (deviceKey, hub, since) => (await loadWebClient(deviceKey)).watch(hub, since),
  putGrant: async (deviceKey, hub, grant) => (await loadWebClient(deviceKey)).putGrant(hub, grant),
  accessToken: async (deviceKey, hub, serverId) => (await loadWebClient(deviceKey)).accessToken(hub, serverId),
  dropGrant: async (deviceKey, hub, serverId) => (await loadWebClient(deviceKey)).dropGrant(hub, serverId),
  providers: async (deviceKey, hub) => (await loadWebClient(deviceKey)).providers(hub),
  startProxy: () => Promise.reject(Object.assign(new Error('No local proxy in a browser'), { code: 'Internal' })),
};

function headerPairs(headers: HeadersInit | undefined): [string, string][] {
  if (!headers) return [];
  if (headers instanceof Headers) return [...headers.entries()];
  if (Array.isArray(headers)) return headers.map(([name, value]) => [name, value]);
  return Object.entries(headers);
}

async function bodyBytes(body: BodyInit | null | undefined): Promise<Uint8Array> {
  if (body == null) return new Uint8Array();
  if (typeof body === 'string') return new TextEncoder().encode(body);
  return new Uint8Array(await new Response(body).arrayBuffer());
}

//absent without the rust client
const native: NativeHub | undefined =
  Platform.OS === 'android' ? NativeModules.OperaHubModule : isTauri ? tauriHub : isBrowser ? webHub : undefined;
const host: HubHost | undefined = isTauri ? tauriHost : undefined;

//per device so never cloud synced
const DEVICE_KEY = 'opera_hub_device_key';
const PAIRED_HUB_KEY = 'opera_hub_paired';
//every hub nearby answers within it
const NEARBY_WAIT_MS = 2500;
//a fresh hub publishes its address slowly
const SELF_PAIR_ATTEMPTS = 5;
const SELF_PAIR_DELAY_MS = 2000;
//providers reached through the hub tunnel
export const HUB_URL_SCHEME = 'opera-hub://';

export function hubErrorCode(e: unknown): HubErrorCode {
  const code = (e as { code?: string })?.code;
  const known: HubErrorCode[] = [
    'InvalidLink',
    'PairingRejected',
    'PairingExpired',
    'Unauthorized',
    'Unreachable',
    'Outdated',
  ];
  return known.includes(code as HubErrorCode) ? (code as HubErrorCode) : 'Internal';
}

class OperaHubServiceImpl {
  isSupported(): boolean {
    return !!native;
  }

  async getPairedHub(): Promise<PairedHub | null> {
    const raw = await getSecret(PAIRED_HUB_KEY);
    return raw ? (JSON.parse(raw) as PairedHub) : null;
  }

  async pair(link: string): Promise<PairedHub> {
    const { name, kind } = await this.identity();
    const hub = await this.native().pair(await this.deviceKey(), link, name, kind);
    await setSecret(PAIRED_HUB_KEY, JSON.stringify(hub));
    return hub;
  }

  //what a hub or paired device shows, a code or a pairing link
  async pairWithCode(input: string): Promise<PairedHub> {
    const value = input.trim();
    if (value.startsWith('opera://')) return this.pair(value);
    const { name, kind } = await this.identity();
    const hub = await this.native().pairWithCode(await this.deviceKey(), value, name, kind);
    await setSecret(PAIRED_HUB_KEY, JSON.stringify(hub));
    return hub;
  }

  //a code for another device, needs the admin scope
  async invite(hub: PairedHub): Promise<HubInvite> {
    return this.native().invite(await this.deviceKey(), hub);
  }

  async qrSvg(text: string, dark: string, light: string): Promise<string> {
    return this.native().qrSvg(text, dark, light);
  }

  canDiscover(): boolean {
    return !!native?.nearbyHubs;
  }

  //hubs announcing themselves on this network
  async nearbyHubs(waitMs = NEARBY_WAIT_MS): Promise<NearbyHub[]> {
    const nearby = this.native().nearbyHubs;
    return nearby ? nearby(await this.deviceKey(), waitMs) : [];
  }

  canManageModels(): boolean {
    return !!native?.modelsStatus;
  }

  //llama.cpp models on the hub, admins only
  async models(): Promise<HubModels> {
    const native = this.native();
    const key = await this.deviceKey();
    const hub = await this.getPairedHub();
    if (!hub || !native.modelsStatus) throw Object.assign(new Error('No Sampler paired'), { code: 'Unauthorized' });
    return {
      catalog: () => native.modelsCatalog!(key, hub),
      search: (query) => native.modelsSearch!(key, hub, query),
      files: (repo) => native.modelsFiles!(key, hub, repo),
      download: (repo, file) => native.modelsDownload!(key, hub, repo, file),
      cancel: (file) => native.modelsCancel!(key, hub, file),
      remove: (file) => native.modelsDelete!(key, hub, file),
      status: () => native.modelsStatus!(key, hub),
    };
  }

  canManageMcp(): boolean {
    return !!native?.mcpJson;
  }

  //mcp servers the hub runs, admins only
  async mcp(): Promise<HubMcp> {
    const native = this.native();
    const key = await this.deviceKey();
    const hub = await this.getPairedHub();
    if (!hub || !native.mcpJson) throw Object.assign(new Error('No Sampler paired'), { code: 'Unauthorized' });
    const send = async (request: Record<string, unknown>) => JSON.parse(await native.mcpJson!(key, hub, JSON.stringify(request)));
    const status = async (request: Record<string, unknown>): Promise<McpStatus> => {
      const { isolation, servers } = await send(request);
      return { isolation, servers };
    };
    return {
      catalog: async () => (await send({ type: 'catalog' })).listings,
      search: async (query) => (await send({ type: 'search', query })).listings,
      prepare: async (listing) => (await send({ type: 'prepare', listing })).listing,
      install: async (listing, values) => (await send({ type: 'install', listing, values })).id,
      configure: (id, values) => status({ type: 'configure', id, values }),
      enable: (id, on) => status({ type: 'enable', id, on }),
      restart: (id) => status({ type: 'restart', id }),
      update: (id) => status({ type: 'update', id }),
      remove: (id) => status({ type: 'remove', id }),
      status: () => status({ type: 'status' }),
      logs: async (id) => (await send({ type: 'logs', id })).lines,
      folders: async (path) => {
        const { path: current, parent, folders } = await send({ type: 'folders', path: path ?? null });
        return { path: current, parent, folders };
      },
      registries: async () => (await send({ type: 'registries' })).urls,
      setRegistries: async (urls) => (await send({ type: 'set_registries', urls })).urls,
    };
  }

  //browsers lack the admin scope
  canUpdateHub(): boolean {
    return !!native?.updateHub;
  }

  //the hub on this computer opens its installer, others update themselves
  async updateHub(hub: PairedHub, version: string): Promise<void> {
    if (host) {
      const local = await host.status().catch(() => null);
      const onThisComputer = local?.id === hub.id && local.running;
      if (onThisComputer && (await invoke<boolean>('hub_install_update', { version }))) return;
    }
    const update = this.native().updateHub;
    if (!update) throw Object.assign(new Error('Hub updates need the app'), { code: 'Unauthorized' });
    await update(await this.deviceKey(), hub);
  }

  async hubSettings(hub: PairedHub): Promise<HubSettings | null> {
    const read = this.native().hubSettings;
    return read ? read(await this.deviceKey(), hub) : null;
  }

  async setHubSettings(hub: PairedHub, settings: HubSettings): Promise<HubSettings> {
    const write = this.native().setHubSettings;
    if (!write) throw Object.assign(new Error('Hub settings need the app'), { code: 'Unauthorized' });
    return write(await this.deviceKey(), hub, settings);
  }

  //null when the client predates it
  async deviceId(): Promise<string | null> {
    const native = this.native();
    return native.deviceId ? native.deviceId(await this.deviceKey()) : null;
  }

  canHost(): boolean {
    return !!host;
  }

  async hostStatus(): Promise<HostStatus> {
    return this.host().status();
  }

  //a background hub with its tray icon, closing the app leaves it running
  async setHosting(enabled: boolean): Promise<void> {
    if (enabled) await this.host().start();
    else await this.host().stop();
  }

  //pairs with the hub running on this computer
  async pairWithThisComputer(): Promise<PairedHub> {
    const link = await this.host().pairingLink();
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.pair(link);
      } catch (e) {
        if (hubErrorCode(e) !== 'Unreachable' || attempt >= SELF_PAIR_ATTEMPTS) throw e;
        await new Promise((resolve) => setTimeout(resolve, SELF_PAIR_DELAY_MS));
      }
    }
  }


  async status(hub: PairedHub): Promise<HubStatus> {
    return this.native().status(await this.deviceKey(), hub);
  }

  async devices(hub: PairedHub): Promise<HubDevice[]> {
    return this.native().devices(await this.deviceKey(), hub);
  }

  async renameDevice(hub: PairedHub, id: string, name: string): Promise<void> {
    return this.native().renameDevice(await this.deviceKey(), hub, id, name);
  }

  //it loses access at once
  async removeDevice(hub: PairedHub, id: string): Promise<void> {
    return this.native().removeDevice(await this.deviceKey(), hub, id);
  }

  async push(hub: PairedHub, collection: string, records: SyncRecord[]): Promise<void> {
    return this.native().push(await this.deviceKey(), hub, collection, records);
  }

  async pull(hub: PairedHub, collection: string, since: number): Promise<PullPage> {
    return this.native().pull(await this.deviceKey(), hub, collection, since);
  }

  //hub cursor once something newer than since lands
  async watch(hub: PairedHub, since: number): Promise<number> {
    return this.native().watch(await this.deviceKey(), hub, since);
  }

  async putGrant(hub: PairedHub, grant: McpGrant): Promise<void> {
    return this.native().putGrant(await this.deviceKey(), hub, grant);
  }

  async accessToken(hub: PairedHub, serverId: string): Promise<McpAccessToken | null> {
    return this.native().accessToken(await this.deviceKey(), hub, serverId);
  }

  async dropGrant(hub: PairedHub, serverId: string): Promise<void> {
    return this.native().dropGrant(await this.deviceKey(), hub, serverId);
  }

  async providers(hub: PairedHub): Promise<HubProvider[]> {
    return this.native().providers(await this.deviceKey(), hub);
  }

  //true where requests cannot use the local proxy
  needsTunnelFetch(): boolean {
    return isBrowser;
  }

  //browsers send provider requests through the tunnel
  async fetchThroughHub(url: string, init?: RequestInit): Promise<Response> {
    const hub = await this.getPairedHub();
    if (!hub) throw Object.assign(new Error('No Sampler paired'), { code: 'Unauthorized' });
    const client = await loadWebClient(await this.deviceKey());
    const [provider, ...rest] = url.slice(HUB_URL_SCHEME.length).split('/');
    const response = await client.forward(
      hub,
      provider,
      (init?.method ?? 'GET').toUpperCase(),
      `/${rest.join('/')}`,
      headerPairs(init?.headers),
      await bodyBytes(init?.body),
    );
    init?.signal?.addEventListener('abort', () => response.cancel());
    const body = BODYLESS_STATUSES.includes(response.status)
      ? null
      : new ReadableStream<Uint8Array>({
          async pull(controller) {
            const chunk = await response.read();
            if (chunk) controller.enqueue(chunk);
            else controller.close();
          },
          cancel: () => response.cancel(),
        });
    return new Response(body, { status: response.status, headers: response.headers });
  }

  //maps hub urls to the local proxy
  async resolveUrl(url: string): Promise<string> {
    const hub = await this.getPairedHub();
    if (!hub) throw Object.assign(new Error('No Sampler paired'), { code: 'Unauthorized' });
    const { port, token } = await this.native().startProxy(await this.deviceKey(), hub);
    return `http://127.0.0.1:${port}/${token}/${url.slice(HUB_URL_SCHEME.length)}`;
  }

  //forgets locally even if unreachable
  async unpair(hub: PairedHub): Promise<void> {
    try {
      await this.native().unpair(await this.deviceKey(), hub);
    } catch (e) {
      console.warn('[OperaHub] hub not told about unpairing:', e);
    }
    await setSecret(PAIRED_HUB_KEY, null);
  }

  async forget(): Promise<void> {
    await setSecret(PAIRED_HUB_KEY, null);
  }

  private async identity(): Promise<{ name: string; kind: string }> {
    if (host) return { name: await host.computerName(), kind: 'desktop' };
    if (isBrowser) return { name: Device.osName ? `Opera Web (${Device.osName})` : 'Opera Web', kind: 'web' };
    return { name: Device.deviceName ?? Device.modelName ?? 'Android', kind: 'phone' };
  }

  private host(): HubHost {
    if (!host) throw Object.assign(new Error('Hosting needs the desktop app'), { code: 'Internal' });
    return host;
  }

  private native(): NativeHub {
    if (!native) throw Object.assign(new Error('Sampler is not available'), { code: 'Internal' });
    return native;
  }

  //the hub knows its public key
  private async deviceKey(): Promise<string> {
    const existing = await getSecret(DEVICE_KEY);
    if (existing) return existing;
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    await setSecret(DEVICE_KEY, key);
    return key;
  }
}

export const OperaHub = new OperaHubServiceImpl();
