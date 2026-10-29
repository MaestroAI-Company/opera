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
  //llama.cpp options an admin set, shown to everyone
  ctxSize?: number | null;
  keepAlive?: number | null;
  parallel?: number | null;
};
export type HubDevice = {
  id: string;
  name: string;
  kind: string;
  scopes: string[];
  pairedAt: number;
  pairedBy: string | null;
  lastSeen?: number;
  profile?: string | null;
};
//one person on the hub
export type HubProfile = { id: string; name: string; role: 'admin' | 'member'; createdAt: number };
//the key only lives in this device's secure store
export type UnlockedProfile = { profile: HubProfile; key: string; lock?: ProfileLock | null };
//what reopens a profile key with its password
export type ProfileLock = { salt: string; memoryKib: number; passes: number; wrapped: string };
//cached lock for backups made while the hub is away
type StoredProfile = { hubId: string; profile: HubProfile; key: string; lock?: ProfileLock };
//a cloud backup of a profile, sealed with its backup key
export type ProfileBackup = {
  header: { hubId: string; profile: HubProfile; lock: ProfileLock };
  backupKey: string;
};
//a device typed a link code, the user compares the digits
export type LinkJoining = { device: string; digits: string };
export type LinkProgress = { digits: string | null; profile: UnlockedProfile | null; denied: boolean };
export type SyncRecord = { id: string; updatedAt: number; deleted: boolean; payload: string | null };
export type PullPage = { records: SyncRecord[]; cursor: number; more: boolean };
//mcp ones are servers the hub hosts
export type HubProvider = { id: string; name: string; kind: 'ollama' | 'openai' | 'mcp' };
//a hub on this computer, desktop only
//installed means it starts with the session
export type HostStatus = { running: boolean; installed: boolean; id: string | null };
//a one time code and the link its qr shows
export type HubInvite = { code: string; link: string };
export type HubSettings = {
  lanDiscovery: boolean;
  shareProviders: boolean;
  mcpServers: boolean;
  models: boolean;
  //newest llama.cpp nightly instead of stable
  modelsNightly: boolean;
  //llama.cpp options, 0 keeps its default
  ctxSize: number;
  keepAlive: number;
  parallel: number;
};
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
  //installed and newest llama.cpp builds
  build?: string | null;
  latest?: string | null;
  channel?: 'stable' | 'nightly' | null;
  message?: string | null;
  installed: InstalledModel[];
  downloads: ModelDownload[];
  //llama-server with its model processes
  cpu?: number | null;
  memory?: number | null;
};
export type HubErrorCode =
  | 'InvalidLink'
  | 'PairingRejected'
  | 'PairingExpired'
  | 'Unauthorized'
  | 'Unreachable'
  | 'Outdated'
  | 'Locked'
  | 'Internal';

type NativeHub = {
  //missing on builds older than hub 0.5
  deviceId?(deviceKey: string): Promise<string>;
  pair(deviceKey: string, link: string, deviceName: string, kind: string): Promise<PairedHub>;
  pairWithCode(deviceKey: string, code: string, deviceName: string, kind: string): Promise<PairedHub>;
  invite(deviceKey: string, hub: PairedHub): Promise<HubInvite>;
  qrSvg(text: string, dark: string, light: string): Promise<string>;
  //admin profiles only, older clients lack it
  hubSettings?(deviceKey: string, hub: PairedHub): Promise<HubSettings>;
  setHubSettings?(deviceKey: string, hub: PairedHub, settings: HubSettings): Promise<HubSettings>;
  //browsers cannot use multicast
  nearbyHubs?(deviceKey: string, waitMs: number): Promise<NearbyHub[]>;
  updateHub?(deviceKey: string, hub: PairedHub): Promise<string>;
  //admin profiles only, older clients lack it
  modelsCatalog?(deviceKey: string, hub: PairedHub): Promise<CatalogModel[]>;
  modelsSearch?(deviceKey: string, hub: PairedHub, query: string): Promise<ModelRepo[]>;
  modelsFiles?(deviceKey: string, hub: PairedHub, repo: string): Promise<ModelFile[]>;
  modelsDownload?(deviceKey: string, hub: PairedHub, repo: string, file: string): Promise<LlamaStatus>;
  modelsCancel?(deviceKey: string, hub: PairedHub, file: string): Promise<LlamaStatus>;
  modelsDelete?(deviceKey: string, hub: PairedHub, file: string): Promise<LlamaStatus>;
  modelsStatus?(deviceKey: string, hub: PairedHub): Promise<LlamaStatus>;
  mcpJson?(deviceKey: string, hub: PairedHub, request: string): Promise<string>;
  //admin only, every profile's servers
  mcpOverview?(deviceKey: string, hub: PairedHub): Promise<McpServerSummary[]>;
  mcpManage?(deviceKey: string, hub: PairedHub, id: string, action: McpAction): Promise<McpServerSummary[]>;
  status(deviceKey: string, hub: PairedHub): Promise<HubStatus>;
  unpair(deviceKey: string, hub: PairedHub): Promise<void>;
  devices(deviceKey: string, hub: PairedHub): Promise<HubDevice[]>;
  renameDevice(deviceKey: string, hub: PairedHub, id: string, name: string): Promise<void>;
  removeDevice(deviceKey: string, hub: PairedHub, id: string): Promise<void>;
  push(deviceKey: string, hub: PairedHub, collection: string, records: SyncRecord[]): Promise<void>;
  pull(deviceKey: string, hub: PairedHub, collection: string, since: number): Promise<PullPage>;
  watch(deviceKey: string, hub: PairedHub, since: number): Promise<number>;
  setProfile(deviceKey: string, profileId: string, key: string): Promise<void>;
  clearProfile(deviceKey: string): Promise<void>;
  profiles(deviceKey: string, hub: PairedHub): Promise<HubProfile[]>;
  //admin only, desktop for now
  removeProfile?(deviceKey: string, hub: PairedHub, id: string): Promise<void>;
  setProfileRole?(deviceKey: string, hub: PairedHub, id: string, role: HubProfile['role']): Promise<void>;
  createProfile(deviceKey: string, hub: PairedHub, name: string, password: string): Promise<UnlockedProfile>;
  unlockProfile(deviceKey: string, hub: PairedHub, profileId: string, password: string): Promise<UnlockedProfile>;
  changePassword(deviceKey: string, hub: PairedHub, current: string, next: string): Promise<void>;
  renameProfile(deviceKey: string, hub: PairedHub, name: string): Promise<HubProfile>;
  lockedKey(deviceKey: string, hub: PairedHub): Promise<ProfileLock>;
  openLockedKey(lock: ProfileLock, password: string): Promise<string>;
  profileBackupKey(key: string): Promise<string>;
  linkStart(deviceKey: string, hub: PairedHub): Promise<HubInvite>;
  linkWatch(deviceKey: string, hub: PairedHub): Promise<LinkJoining | null>;
  linkApprove(deviceKey: string, hub: PairedHub): Promise<void>;
  linkDeny(deviceKey: string, hub: PairedHub): Promise<void>;
  linkJoin(deviceKey: string, hub: PairedHub): Promise<void>;
  linkFetch(deviceKey: string, hub: PairedHub): Promise<LinkProgress>;
  lease(deviceKey: string, hub: PairedHub, name: string): Promise<boolean>;
  release(deviceKey: string, hub: PairedHub, name: string): Promise<void>;
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
export type McpAction = 'start' | 'stop' | 'restart' | 'remove';
//any profile's server, no values, admins only
export type McpServerSummary = {
  id: string;
  //null for servers from before profiles
  owner?: string | null;
  title: string;
  repository?: string | null;
  enabled: boolean;
  state: McpServerState;
  tools: number;
  cpu?: number | null;
  memory?: number | null;
};

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
  mcpOverview: (deviceKey, hub) => invoke('hub_mcp_overview', { deviceKey, hub }),
  mcpManage: (deviceKey, hub, id, action) => invoke('hub_mcp_manage', { deviceKey, hub, id, action }),
  status: (deviceKey, hub) => invoke('hub_status', { deviceKey, hub }),
  unpair: (deviceKey, hub) => invoke('hub_unpair', { deviceKey, hub }),
  devices: (deviceKey, hub) => invoke('hub_devices', { deviceKey, hub }),
  renameDevice: (deviceKey, hub, id, name) => invoke('hub_rename_device', { deviceKey, hub, id, name }),
  removeDevice: (deviceKey, hub, id) => invoke('hub_remove_device', { deviceKey, hub, id }),
  push: (deviceKey, hub, collection, records) => invoke('hub_push', { deviceKey, hub, collection, records }),
  pull: (deviceKey, hub, collection, since) => invoke('hub_pull', { deviceKey, hub, collection, since }),
  watch: (deviceKey, hub, since) => invoke('hub_watch', { deviceKey, hub, since }),
  setProfile: (deviceKey, profileId, key) => invoke('hub_set_profile', { deviceKey, profileId, key }),
  clearProfile: (deviceKey) => invoke('hub_clear_profile', { deviceKey }),
  profiles: (deviceKey, hub) => invoke('hub_profiles', { deviceKey, hub }),
  removeProfile: (deviceKey, hub, id) => invoke('hub_remove_profile', { deviceKey, hub, id }),
  setProfileRole: (deviceKey, hub, id, role) => invoke('hub_set_profile_role', { deviceKey, hub, id, role }),
  createProfile: (deviceKey, hub, name, password) => invoke('hub_create_profile', { deviceKey, hub, name, password }),
  unlockProfile: (deviceKey, hub, profileId, password) =>
    invoke('hub_unlock_profile', { deviceKey, hub, profileId, password }),
  changePassword: (deviceKey, hub, current, next) => invoke('hub_change_password', { deviceKey, hub, current, next }),
  renameProfile: (deviceKey, hub, name) => invoke('hub_rename_profile', { deviceKey, hub, name }),
  lockedKey: (deviceKey, hub) => invoke('hub_locked_key', { deviceKey, hub }),
  openLockedKey: (lock, password) => invoke('hub_open_locked_key', { lock, password }),
  profileBackupKey: (key) => invoke('hub_profile_backup_key', { key }),
  linkStart: (deviceKey, hub) => invoke('hub_link_start', { deviceKey, hub }),
  linkWatch: (deviceKey, hub) => invoke('hub_link_watch', { deviceKey, hub }),
  linkApprove: (deviceKey, hub) => invoke('hub_link_approve', { deviceKey, hub }),
  linkDeny: (deviceKey, hub) => invoke('hub_link_deny', { deviceKey, hub }),
  linkJoin: (deviceKey, hub) => invoke('hub_link_join', { deviceKey, hub }),
  linkFetch: (deviceKey, hub) => invoke('hub_link_fetch', { deviceKey, hub }),
  lease: (deviceKey, hub, name) => invoke('hub_lease', { deviceKey, hub, name }),
  release: (deviceKey, hub, name) => invoke('hub_release', { deviceKey, hub, name }),
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
  hubSettings(hub: PairedHub): Promise<HubSettings>;
  setHubSettings(hub: PairedHub, settings: HubSettings): Promise<HubSettings>;
  updateHub(hub: PairedHub): Promise<string>;
  removeProfile(hub: PairedHub, id: string): Promise<void>;
  setProfileRole(hub: PairedHub, id: string, role: string): Promise<void>;
  mcpOverview(hub: PairedHub): Promise<McpServerSummary[]>;
  mcpManage(hub: PairedHub, id: string, action: McpAction): Promise<McpServerSummary[]>;
  modelsCatalog(hub: PairedHub): Promise<CatalogModel[]>;
  modelsSearch(hub: PairedHub, query: string): Promise<ModelRepo[]>;
  modelsFiles(hub: PairedHub, repo: string): Promise<ModelFile[]>;
  modelsDownload(hub: PairedHub, repo: string, file: string): Promise<LlamaStatus>;
  modelsCancel(hub: PairedHub, file: string): Promise<LlamaStatus>;
  modelsDelete(hub: PairedHub, file: string): Promise<LlamaStatus>;
  modelsStatus(hub: PairedHub): Promise<LlamaStatus>;
  push(hub: PairedHub, collection: string, records: SyncRecord[]): Promise<void>;
  pull(hub: PairedHub, collection: string, since: number): Promise<PullPage>;
  watch(hub: PairedHub, since: number): Promise<number>;
  setProfile(profileId: string, key: string): void;
  clearProfile(): void;
  profiles(hub: PairedHub): Promise<HubProfile[]>;
  createProfile(hub: PairedHub, name: string, password: string): Promise<UnlockedProfile>;
  unlockProfile(hub: PairedHub, profileId: string, password: string): Promise<UnlockedProfile>;
  changePassword(hub: PairedHub, current: string, next: string): Promise<void>;
  renameProfile(hub: PairedHub, name: string): Promise<HubProfile>;
  lockedKey(hub: PairedHub): Promise<ProfileLock>;
  linkStart(hub: PairedHub): Promise<HubInvite>;
  linkWatch(hub: PairedHub): Promise<LinkJoining | null>;
  linkApprove(hub: PairedHub): Promise<void>;
  linkDeny(hub: PairedHub): Promise<void>;
  linkJoin(hub: PairedHub): Promise<void>;
  linkFetch(hub: PairedHub): Promise<LinkProgress>;
  lease(hub: PairedHub, name: string): Promise<boolean>;
  release(hub: PairedHub, name: string): Promise<void>;
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
  openLockedKey(lock: ProfileLock, password: string): string;
  profileBackupKey(key: string): string;
};

//public files, built or downloaded before the web bundle
const WEB_MODULE_URL = '/sampler-hub/sampler-hub-client-web.js';
const WEB_WASM_URL = '/sampler-hub/sampler-hub-client-web.wasm';
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
  //the hub only answers admin profiles
  hubSettings: async (deviceKey, hub) => (await loadWebClient(deviceKey)).hubSettings(hub),
  setHubSettings: async (deviceKey, hub, settings) => (await loadWebClient(deviceKey)).setHubSettings(hub, settings),
  updateHub: async (deviceKey, hub) => (await loadWebClient(deviceKey)).updateHub(hub),
  removeProfile: async (deviceKey, hub, id) => (await loadWebClient(deviceKey)).removeProfile(hub, id),
  setProfileRole: async (deviceKey, hub, id, role) => (await loadWebClient(deviceKey)).setProfileRole(hub, id, role),
  mcpOverview: async (deviceKey, hub) => (await loadWebClient(deviceKey)).mcpOverview(hub),
  mcpManage: async (deviceKey, hub, id, action) => (await loadWebClient(deviceKey)).mcpManage(hub, id, action),
  modelsCatalog: async (deviceKey, hub) => (await loadWebClient(deviceKey)).modelsCatalog(hub),
  modelsSearch: async (deviceKey, hub, query) => (await loadWebClient(deviceKey)).modelsSearch(hub, query),
  modelsFiles: async (deviceKey, hub, repo) => (await loadWebClient(deviceKey)).modelsFiles(hub, repo),
  modelsDownload: async (deviceKey, hub, repo, file) =>
    (await loadWebClient(deviceKey)).modelsDownload(hub, repo, file),
  modelsCancel: async (deviceKey, hub, file) => (await loadWebClient(deviceKey)).modelsCancel(hub, file),
  modelsDelete: async (deviceKey, hub, file) => (await loadWebClient(deviceKey)).modelsDelete(hub, file),
  modelsStatus: async (deviceKey, hub) => (await loadWebClient(deviceKey)).modelsStatus(hub),
  push: async (deviceKey, hub, collection, records) =>
    (await loadWebClient(deviceKey)).push(hub, collection, records),
  pull: async (deviceKey, hub, collection, since) => (await loadWebClient(deviceKey)).pull(hub, collection, since),
  watch: async (deviceKey, hub, since) => (await loadWebClient(deviceKey)).watch(hub, since),
  setProfile: async (deviceKey, profileId, key) => (await loadWebClient(deviceKey)).setProfile(profileId, key),
  clearProfile: async (deviceKey) => (await loadWebClient(deviceKey)).clearProfile(),
  profiles: async (deviceKey, hub) => (await loadWebClient(deviceKey)).profiles(hub),
  createProfile: async (deviceKey, hub, name, password) =>
    (await loadWebClient(deviceKey)).createProfile(hub, name, password),
  unlockProfile: async (deviceKey, hub, profileId, password) =>
    (await loadWebClient(deviceKey)).unlockProfile(hub, profileId, password),
  changePassword: async (deviceKey, hub, current, next) =>
    (await loadWebClient(deviceKey)).changePassword(hub, current, next),
  renameProfile: async (deviceKey, hub, name) => (await loadWebClient(deviceKey)).renameProfile(hub, name),
  lockedKey: async (deviceKey, hub) => (await loadWebClient(deviceKey)).lockedKey(hub),
  openLockedKey: async (lock, password) => (await loadWebModule()).openLockedKey(lock, password),
  profileBackupKey: async (key) => (await loadWebModule()).profileBackupKey(key),
  linkStart: async (deviceKey, hub) => (await loadWebClient(deviceKey)).linkStart(hub),
  linkWatch: async (deviceKey, hub) => (await loadWebClient(deviceKey)).linkWatch(hub),
  linkApprove: async (deviceKey, hub) => (await loadWebClient(deviceKey)).linkApprove(hub),
  linkDeny: async (deviceKey, hub) => (await loadWebClient(deviceKey)).linkDeny(hub),
  linkJoin: async (deviceKey, hub) => (await loadWebClient(deviceKey)).linkJoin(hub),
  linkFetch: async (deviceKey, hub) => (await loadWebClient(deviceKey)).linkFetch(hub),
  lease: async (deviceKey, hub, name) => (await loadWebClient(deviceKey)).lease(hub, name),
  release: async (deviceKey, hub, name) => (await loadWebClient(deviceKey)).release(hub, name),
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
  Platform.OS === 'android' ? NativeModules.SamplerHubModule : isTauri ? tauriHub : isBrowser ? webHub : undefined;
const host: HubHost | undefined = isTauri ? tauriHost : undefined;

//per device so never cloud synced
const DEVICE_KEY = 'sampler_hub_device_key';
const PAIRED_HUB_KEY = 'sampler_hub_paired';
//never synced, it unlocks this device's sealed data
const PROFILE_KEY = 'sampler_hub_profile';
//every hub nearby answers within it
const NEARBY_WAIT_MS = 2500;
//a fresh hub publishes its address slowly
const SELF_PAIR_ATTEMPTS = 5;
const SELF_PAIR_DELAY_MS = 2000;
//an unreachable hub takes the whole connect timeout
const UNPAIR_WAIT_MS = 3000;
//providers reached through the hub tunnel
export const HUB_URL_SCHEME = 'sampler-hub://';

export function hubErrorCode(e: unknown): HubErrorCode {
  const code = (e as { code?: string })?.code;
  const known: HubErrorCode[] = [
    'InvalidLink',
    'PairingRejected',
    'PairingExpired',
    'Unauthorized',
    'Unreachable',
    'Outdated',
    'Locked',
  ];
  return known.includes(code as HubErrorCode) ? (code as HubErrorCode) : 'Internal';
}

class SamplerHubServiceImpl {
  //the native client forgets it on reload
  private profileLoaded = false;

  isSupported(): boolean {
    return !!native;
  }

  //the profile this device unlocked on its hub
  async getProfile(): Promise<HubProfile | null> {
    const stored = await this.storedProfile();
    return stored?.profile ?? null;
  }

  async profiles(hub: PairedHub): Promise<HubProfile[]> {
    return this.native().profiles(await this.deviceKey(), hub);
  }

  //an admin may have changed the role or name since the unlock
  async refreshProfile(hub: PairedHub): Promise<HubProfile | null> {
    const stored = await this.storedProfile();
    if (!stored) return null;
    const live = (await this.profiles(hub)).find((p) => p.id === stored.profile.id);
    if (!live) return stored.profile;
    if (live.role !== stored.profile.role || live.name !== stored.profile.name) {
      await setSecret(PROFILE_KEY, JSON.stringify({ ...stored, profile: live }));
    }
    return live;
  }

  canManageProfiles(): boolean {
    return !!native?.removeProfile;
  }

  //its data, devices and mcp servers go too
  async removeProfile(hub: PairedHub, id: string): Promise<void> {
    const remove = this.native().removeProfile;
    if (!remove) throw Object.assign(new Error('Profiles are managed from the app'), { code: 'Unauthorized' });
    return remove(await this.deviceKey(), hub, id);
  }

  //the hub keeps at least one admin
  async setProfileRole(hub: PairedHub, id: string, role: HubProfile['role']): Promise<void> {
    const set = this.native().setProfileRole;
    if (!set) throw Object.assign(new Error('Profiles are managed from the app'), { code: 'Unauthorized' });
    return set(await this.deviceKey(), hub, id, role);
  }

  canSeeMcpServers(): boolean {
    return !!native?.mcpOverview;
  }

  //every profile's mcp servers, admins only
  //any profile's server, its settings stay private
  async mcpManage(hub: PairedHub, id: string, action: McpAction): Promise<McpServerSummary[]> {
    const manage = this.native().mcpManage;
    if (!manage) throw Object.assign(new Error('Needs the app'), { code: 'Unauthorized' });
    return manage(await this.deviceKey(), hub, id, action);
  }

  async mcpOverview(hub: PairedHub): Promise<McpServerSummary[]> {
    const overview = this.native().mcpOverview;
    if (!overview) throw Object.assign(new Error('Needs the app'), { code: 'Unauthorized' });
    return overview(await this.deviceKey(), hub);
  }

  async createProfile(hub: PairedHub, name: string, password: string): Promise<HubProfile> {
    const unlocked = await this.native().createProfile(await this.deviceKey(), hub, name, password);
    return this.keepProfile(hub, unlocked);
  }

  async unlockProfile(hub: PairedHub, profileId: string, password: string): Promise<HubProfile> {
    const unlocked = await this.native().unlockProfile(await this.deviceKey(), hub, profileId, password);
    return this.keepProfile(hub, unlocked);
  }

  async changePassword(hub: PairedHub, current: string, next: string): Promise<void> {
    await this.ensureProfile();
    return this.native().changePassword(await this.deviceKey(), hub, current, next);
  }

  async renameProfile(hub: PairedHub, name: string): Promise<HubProfile> {
    await this.ensureProfile();
    const profile = await this.native().renameProfile(await this.deviceKey(), hub, name);
    const stored = await this.storedProfile();
    if (stored) await setSecret(PROFILE_KEY, JSON.stringify({ ...stored, profile }));
    return profile;
  }

  //null without a profile or any known lock
  async profileBackup(): Promise<ProfileBackup | null> {
    const stored = await this.storedProfile();
    const hub = await this.getPairedHub();
    if (!stored || !hub) return null;
    //the hub copy follows password changes
    const lock = await this.native()
      .lockedKey(await this.deviceKey(), hub)
      .catch(() => stored.lock);
    if (!lock) return null;
    if (JSON.stringify(lock) !== JSON.stringify(stored.lock)) {
      await setSecret(PROFILE_KEY, JSON.stringify({ ...stored, lock }));
    }
    return {
      header: { hubId: stored.hubId, profile: stored.profile, lock },
      backupKey: await this.native().profileBackupKey(stored.key),
    };
  }

  //a cloud restore has only the password
  async openBackupKey(lock: ProfileLock, password: string): Promise<string> {
    const key = await this.native().openLockedKey(lock, password);
    return this.native().profileBackupKey(key);
  }

  //a code for another device of this profile
  async linkStart(hub: PairedHub): Promise<HubInvite> {
    await this.ensureProfile();
    return this.native().linkStart(await this.deviceKey(), hub);
  }

  async linkWatch(hub: PairedHub): Promise<LinkJoining | null> {
    return this.native().linkWatch(await this.deviceKey(), hub);
  }

  async linkApprove(hub: PairedHub): Promise<void> {
    await this.ensureProfile();
    return this.native().linkApprove(await this.deviceKey(), hub);
  }

  async linkDeny(hub: PairedHub): Promise<void> {
    return this.native().linkDeny(await this.deviceKey(), hub);
  }

  //false when the code came from an admin, not a device
  async linkJoin(hub: PairedHub): Promise<boolean> {
    try {
      await this.native().linkJoin(await this.deviceKey(), hub);
      return true;
    } catch (e) {
      if (hubErrorCode(e) === 'Internal') return false;
      throw e;
    }
  }

  async linkFetch(hub: PairedHub): Promise<{ digits: string | null; profile: HubProfile | null; denied: boolean }> {
    const progress = await this.native().linkFetch(await this.deviceKey(), hub);
    const profile = progress.profile ? await this.keepProfile(hub, progress.profile) : null;
    return { digits: progress.digits, profile, denied: progress.denied };
  }

  async getPairedHub(): Promise<PairedHub | null> {
    const raw = await getSecret(PAIRED_HUB_KEY);
    return raw ? (JSON.parse(raw) as PairedHub) : null;
  }

  async pair(link: string): Promise<PairedHub> {
    //a new pairing starts without a profile
    await this.forgetProfile();
    const { name, kind } = await this.identity();
    const hub = await this.native().pair(await this.deviceKey(), link, name, kind);
    await setSecret(PAIRED_HUB_KEY, JSON.stringify(hub));
    return hub;
  }

  //what a hub or paired device shows, a code or a pairing link
  async pairWithCode(input: string): Promise<PairedHub> {
    const value = input.trim();
    if (value.startsWith('opera://')) return this.pair(value);
    await this.forgetProfile();
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

  //older clients lack it
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

  //the desktop app turns on the hub it hosts, never off
  async startHostedHub(): Promise<void> {
    if (!host) return;
    const [hub, local] = await Promise.all([this.getPairedHub(), host.status()]);
    if (hub && local.id === hub.id && !local.running) await host.start();
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
    await this.ensureProfile();
    return this.native().push(await this.deviceKey(), hub, collection, records);
  }

  async pull(hub: PairedHub, collection: string, since: number): Promise<PullPage> {
    await this.ensureProfile();
    return this.native().pull(await this.deviceKey(), hub, collection, since);
  }

  //hub cursor once something newer than since lands
  async watch(hub: PairedHub, since: number): Promise<number> {
    return this.native().watch(await this.deviceKey(), hub, since);
  }

  //false while another device of the profile holds it
  async lease(hub: PairedHub, name: string): Promise<boolean> {
    return this.native().lease(await this.deviceKey(), hub, name);
  }

  async release(hub: PairedHub, name: string): Promise<void> {
    return this.native().release(await this.deviceKey(), hub, name);
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
    const key = await this.deviceKey();
    const told = this.native()
      .unpair(key, hub)
      .catch((e) => console.warn('[SamplerHub] hub not told about unpairing:', e));
    //the hub may still hear it later, the device does not wait
    await Promise.race([told, new Promise((resolve) => setTimeout(resolve, UNPAIR_WAIT_MS))]);
    await this.forget();
  }

  async forget(): Promise<void> {
    await setSecret(PAIRED_HUB_KEY, null);
    await this.forgetProfile();
  }

  //the key stays only as long as the pairing
  private async forgetProfile(): Promise<void> {
    await setSecret(PROFILE_KEY, null);
    this.profileLoaded = false;
    await this.native()
      .clearProfile(await this.deviceKey())
      .catch(() => {});
  }

  private async storedProfile(): Promise<StoredProfile | null> {
    const raw = await getSecret(PROFILE_KEY);
    const hub = await this.getPairedHub();
    if (!raw || !hub) return null;
    const stored = JSON.parse(raw) as StoredProfile;
    //a profile of another hub unlocks nothing here
    return stored.hubId === hub.id ? stored : null;
  }

  private async keepProfile(hub: PairedHub, unlocked: UnlockedProfile): Promise<HubProfile> {
    const stored: StoredProfile = {
      hubId: hub.id,
      profile: unlocked.profile,
      key: unlocked.key,
      lock: unlocked.lock ?? undefined,
    };
    await setSecret(PROFILE_KEY, JSON.stringify(stored));
    //the client already holds it after unlocking
    this.profileLoaded = true;
    return unlocked.profile;
  }

  //sealing needs the key in the native client
  private async ensureProfile(): Promise<void> {
    if (this.profileLoaded) return;
    const stored = await this.storedProfile();
    if (!stored) return;
    await this.native().setProfile(await this.deviceKey(), stored.profile.id, stored.key);
    this.profileLoaded = true;
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

export const SamplerHub = new SamplerHubServiceImpl();
