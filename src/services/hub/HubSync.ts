import { AppState, DeviceEventEmitter } from 'react-native';
import { AIModule } from '../ai/AIModule';
import {
  getOllamaServers,
  getOllamaTuning,
  getOpenAIApiKeyById,
  getOpenAIServers,
  HUB_PREFS_KEY,
  isProviderSupported,
  OllamaServer,
  serializeServers,
  setHubProviders,
  setHubServerPrefs,
  setOpenAIApiKey,
} from '../ai/providers/sources';
import { DB } from '../db/DatabaseService';
import { AppEvents } from '../events';
import { McpAuth } from '../mcp/McpAuth';
import { getSecret, setSecret } from '../mcp/mcpStorage';
import { McpServerConfig } from '../mcp/types';
import { BASE_DEFAULTS } from '../settings/schema';
import { AppSettings, Settings } from '../settings/SettingsService';
import { pullRemoteChanges, pushLocalChanges, resetDataSync } from './hubData';
import { HUB_URL_SCHEME, HubProvider, OperaHub, PairedHub, SyncRecord } from './OperaHubService';

//cursor and per entry fingerprints
const STATE_KEYS = { providers: 'opera_hub_sync_state', settings: 'opera_hub_sync_state_settings' } as const;
const CHANGE_DEBOUNCE_MS = 3000;
const WATCH_RETRY_MS = 10000;
//survives restarts while offline
const PROVIDERS_KEY = 'hubProviders';
//server lists travel with their keys in providers
const PROVIDER_LISTS: readonly string[] = ['ollamaUrls', 'openaiUrls', 'mcpServers'];
//every other setting follows the user
const SHARED_SETTINGS = (Object.keys(BASE_DEFAULTS) as (keyof AppSettings)[]).filter(
  (key) => !PROVIDER_LISTS.includes(key),
);
//changes here retune the ai module
const ACTIVE_MODEL_KEYS: readonly string[] = ['aiService', 'ollamaUrl', 'ollamaContextLength', 'ollamaKeepAlive'];

type CachedProviders = { hubName: string; providers: HubProvider[] };

type ProviderEntry =
  | { kind: 'ollama'; server: OllamaServer }
  | { kind: 'openai'; server: OllamaServer; apiKey: string }
  | { kind: 'mcp'; server: McpServerConfig; headerValue: string };

type FingerprintState = {
  cursor: number;
  entries: Record<string, { hash: string; updatedAt: number }>;
};

type Lists = { ollama: OllamaServer[]; openai: OllamaServer[]; mcp: McpServerConfig[] };

function isHubUrl(url: string): boolean {
  return url.startsWith(HUB_URL_SCHEME);
}

//djb2 spots changed entries
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

function newServerId(): string {
  return `srv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function readMcpServers(): McpServerConfig[] {
  try {
    const parsed = JSON.parse(Settings.getCached().mcpServers || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

class HubSyncImpl {
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  //pull writes must not push back
  private applying = false;
  private initialized = false;
  private watching = false;

  //cache loads before the model is picked
  async init(): Promise<void> {
    if (this.initialized || !OperaHub.isSupported()) return;
    this.initialized = true;
    const cached = await Settings.getLocal(PROVIDERS_KEY);
    if (cached) {
      const { hubName, providers } = JSON.parse(cached) as CachedProviders;
      setHubProviders(providers, hubName);
    }
    setHubServerPrefs(JSON.parse((await Settings.getLocal(HUB_PREFS_KEY)) ?? '{}'));
    this.request(0);
    this.watch();
    const onLocalChange = () => {
      if (!this.applying) this.request(CHANGE_DEBOUNCE_MS);
    };
    DeviceEventEmitter.addListener(AppEvents.settingsChanged, onLocalChange);
    DeviceEventEmitter.addListener(AppEvents.conversationsChanged, onLocalChange);
    AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      this.request(0);
      this.watch();
    });
  }

  request(delay: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.syncNow().catch((e) => console.warn('[HubSync] sync failed:', e));
    }, delay);
  }

  //one run at a time
  async syncNow(): Promise<void> {
    while (this.running) await this.running;
    this.running = this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  //drops hub providers after unpairing
  async forgetHub(): Promise<void> {
    await this.storeProviders([], '');
    for (const key of Object.values(STATE_KEYS)) await setSecret(key, null);
    await resetDataSync();
  }

  //the hub answers as soon as another device writes
  private async watch(): Promise<void> {
    if (this.watching) return;
    this.watching = true;
    let since = 0;
    try {
      while (AppState.currentState === 'active') {
        const hub = await OperaHub.getPairedHub();
        if (!hub) break;
        try {
          const cursor = await OperaHub.watch(hub, since);
          if (since > 0 && cursor > since) this.request(0);
          since = Math.max(since, cursor);
        } catch {
          await new Promise((resolve) => setTimeout(resolve, WATCH_RETRY_MS));
        }
      }
    } finally {
      this.watching = false;
    }
  }

  private async run(): Promise<void> {
    const hub = await OperaHub.getPairedHub();
    if (!hub) return;
    await this.dropInjectedServers();
    await this.storeProviders(await OperaHub.providers(hub), hub.name);
    await this.syncFingerprinted(hub, 'providers', await this.providerEntries(), (r) => this.applyProviders(r));
    await this.syncFingerprinted(hub, 'settings', this.settingEntries(), (r) => this.applySettings(r));
    await pushLocalChanges(hub);
    if (await this.write(() => pullRemoteChanges(hub))) {
      await this.write(async () => DB.notifySynced());
    }
  }

  private async storeProviders(providers: HubProvider[], hubName: string): Promise<void> {
    const json = JSON.stringify({ hubName, providers } satisfies CachedProviders);
    if (json === (await Settings.getLocal(PROVIDERS_KEY))) return;
    setHubProviders(providers, hubName);
    await Settings.setLocal(PROVIDERS_KEY, json);
    //model pickers rebuild their sources
    await this.write(async () => {
      DeviceEventEmitter.emit(AppEvents.settingsChanged);
    });
  }

  //an earlier build injected hub servers
  private async dropInjectedServers(): Promise<void> {
    const ollama = getOllamaServers();
    const openai = getOpenAIServers();
    if (![...ollama, ...openai].some((s) => isHubUrl(s.url))) return;
    await this.write(() =>
      Settings.setMany({
        ollamaUrls: serializeServers(ollama.filter((s) => !isHubUrl(s.url))),
        openaiUrls: serializeServers(openai.filter((s) => !isHubUrl(s.url))),
      }),
    );
  }

  //small collections compared entry by entry
  private async syncFingerprinted(
    hub: PairedHub,
    collection: keyof typeof STATE_KEYS,
    local: Map<string, string>,
    apply: (winners: SyncRecord[]) => Promise<void>,
  ): Promise<void> {
    const raw = await getSecret(STATE_KEYS[collection]);
    const state: FingerprintState = raw ? JSON.parse(raw) : { cursor: 0, entries: {} };

    const now = Date.now();
    const outgoing: SyncRecord[] = [];
    for (const [id, json] of local) {
      const fingerprint = hash(json);
      if (state.entries[id]?.hash === fingerprint) continue;
      outgoing.push({ id, updatedAt: now, deleted: false, payload: json });
      state.entries[id] = { hash: fingerprint, updatedAt: now };
    }
    for (const [id, known] of Object.entries(state.entries)) {
      if (local.has(id) || known.hash === '') continue;
      outgoing.push({ id, updatedAt: now, deleted: true, payload: null });
      state.entries[id] = { hash: '', updatedAt: now };
    }
    if (outgoing.length > 0) await OperaHub.push(hub, collection, outgoing);

    const incoming: SyncRecord[] = [];
    let more = true;
    while (more) {
      const page = await OperaHub.pull(hub, collection, state.cursor);
      incoming.push(...page.records);
      state.cursor = page.cursor;
      more = page.more;
    }
    //the hub already settled conflicts
    const winners = incoming.filter((record) => {
      const known = state.entries[record.id];
      const fingerprint = record.deleted ? '' : hash(record.payload ?? '');
      return !known || (record.updatedAt >= known.updatedAt && known.hash !== fingerprint);
    });
    if (winners.length > 0) await apply(winners);
    for (const record of winners) {
      state.entries[record.id] = {
        hash: record.deleted ? '' : hash(record.payload ?? ''),
        updatedAt: record.updatedAt,
      };
    }
    await setSecret(STATE_KEYS[collection], JSON.stringify(state));
  }

  private settingEntries(): Map<string, string> {
    const settings = Settings.getCached();
    return new Map(SHARED_SETTINGS.map((key) => [key, JSON.stringify(settings[key])]));
  }

  private async applySettings(records: SyncRecord[]): Promise<void> {
    const patch: Record<string, unknown> = {};
    for (const record of records) {
      if (record.payload && (SHARED_SETTINGS as readonly string[]).includes(record.id)) {
        patch[record.id] = JSON.parse(record.payload);
      }
    }
    //a provider this device lacks keeps the local model
    if (typeof patch.aiService === 'string' && !isProviderSupported(patch.aiService)) {
      delete patch.aiService;
      delete patch.ollamaUrl;
      delete patch.ollamaModel;
    }
    if (Object.keys(patch).length === 0) return;
    await this.write(() => Settings.setMany(patch as Partial<AppSettings>));
    if (ACTIVE_MODEL_KEYS.some((key) => key in patch)) {
      const settings = Settings.getCached();
      AIModule.setMode(settings.aiService);
      if (settings.ollamaUrl) {
        const tuning = getOllamaTuning(settings.ollamaUrl);
        AIModule.configure(settings.ollamaUrl, tuning.contextLength, tuning.keepAlive);
      }
    }
  }

  private async providerEntries(): Promise<Map<string, string>> {
    const lists = await this.withIds();
    const entries = new Map<string, ProviderEntry>();
    for (const server of lists.ollama) {
      if (!isHubUrl(server.url)) entries.set(server.id!, { kind: 'ollama', server });
    }
    for (const server of lists.openai) {
      if (isHubUrl(server.url)) continue;
      entries.set(server.id!, { kind: 'openai', server, apiKey: await getOpenAIApiKeyById(server.id!) });
    }
    for (const server of lists.mcp) {
      entries.set(server.id, {
        kind: 'mcp',
        server,
        headerValue: (await getSecret(`${server.id}_header`)) ?? '',
      });
    }
    return new Map([...entries].map(([id, entry]) => [id, JSON.stringify(entry)]));
  }

  //older entries had no stable id
  private async withIds(): Promise<Lists> {
    const ollama = getOllamaServers();
    const openai = getOpenAIServers();
    const missing = [...ollama, ...openai].filter((s) => !s.id);
    for (const server of missing) server.id = newServerId();
    if (missing.length > 0) {
      await this.write(() =>
        Settings.setMany({ ollamaUrls: serializeServers(ollama), openaiUrls: serializeServers(openai) }),
      );
    }
    return { ollama, openai, mcp: readMcpServers() };
  }

  private async applyProviders(records: SyncRecord[]): Promise<void> {
    const ollama = getOllamaServers();
    const openai = getOpenAIServers();
    const mcp = readMcpServers();
    const drop = <T extends { id?: string }>(list: T[], id: string) => {
      const index = list.findIndex((s) => s.id === id);
      if (index >= 0) list.splice(index, 1);
    };
    const upsert = <T extends { id?: string }>(list: T[], item: T) => {
      const index = list.findIndex((s) => s.id === item.id);
      if (index >= 0) list[index] = item;
      else list.push(item);
    };

    for (const record of records) {
      drop(ollama, record.id);
      drop(openai, record.id);
      if (record.deleted || !record.payload) {
        drop(mcp, record.id);
        await setOpenAIApiKey(record.id, '');
        await McpAuth.forget(record.id);
        continue;
      }
      const entry = JSON.parse(record.payload) as ProviderEntry;
      if (entry.kind === 'ollama') {
        upsert(ollama, entry.server);
      } else if (entry.kind === 'openai') {
        upsert(openai, entry.server);
        await setOpenAIApiKey(record.id, entry.apiKey);
      } else {
        upsert(mcp, entry.server);
        await setSecret(`${record.id}_header`, entry.headerValue || null);
      }
    }

    await this.write(() =>
      Settings.setMany({
        ollamaUrls: serializeServers(ollama),
        openaiUrls: serializeServers(openai),
        mcpServers: JSON.stringify(mcp),
      }),
    );
    //mcp service reconnects what arrived
    DeviceEventEmitter.emit(AppEvents.syncCompleted);
  }

  private async write<T>(action: () => Promise<T>): Promise<T> {
    this.applying = true;
    try {
      return await action();
    } finally {
      this.applying = false;
    }
  }
}

export const HubSync = new HubSyncImpl();
