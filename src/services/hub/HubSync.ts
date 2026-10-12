import { AppState, DeviceEventEmitter } from 'react-native';
import {
  getOllamaServers,
  getOpenAIApiKeyById,
  getOpenAIServers,
  HUB_PREFS_KEY,
  OllamaServer,
  serializeServers,
  setHubProviders,
  setHubServerPrefs,
  setOpenAIApiKey,
} from '../ai/providers/sources';
import { AppEvents } from '../events';
import { McpAuth } from '../mcp/McpAuth';
import { getSecret, setSecret } from '../mcp/mcpStorage';
import { McpServerConfig } from '../mcp/types';
import { Settings } from '../settings/SettingsService';
import { HUB_URL_SCHEME, HubProvider, OperaHub, PairedHub, SyncRecord } from './OperaHubService';

const COLLECTION = 'providers';
//cursor and per entry fingerprints
const STATE_KEY = 'opera_hub_sync_state';
const CHANGE_DEBOUNCE_MS = 3000;
//survives restarts while offline
const PROVIDERS_KEY = 'hubProviders';

type CachedProviders = { hubName: string; providers: HubProvider[] };

type ProviderEntry =
  | { kind: 'ollama'; server: OllamaServer }
  | { kind: 'openai'; server: OllamaServer; apiKey: string }
  | { kind: 'mcp'; server: McpServerConfig; headerValue: string };

type SyncState = {
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
    DeviceEventEmitter.addListener(AppEvents.settingsChanged, () => {
      if (!this.applying) this.request(CHANGE_DEBOUNCE_MS);
    });
    AppState.addEventListener('change', (state) => {
      if (state === 'active') this.request(0);
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
    await setSecret(STATE_KEY, null);
  }

  private async run(): Promise<void> {
    const hub = await OperaHub.getPairedHub();
    if (!hub) return;
    await this.dropInjectedServers();
    await this.storeProviders(await OperaHub.providers(hub), hub.name);
    await this.syncProviders(hub);
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

  private async syncProviders(hub: PairedHub): Promise<void> {
    const state = await this.loadState();
    const local = await this.localEntries();

    const now = Date.now();
    const outgoing: SyncRecord[] = [];
    for (const [id, entry] of local) {
      const json = JSON.stringify(entry);
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
    if (outgoing.length > 0) await OperaHub.push(hub, COLLECTION, outgoing);

    const incoming: SyncRecord[] = [];
    let more = true;
    while (more) {
      const page = await OperaHub.pull(hub, COLLECTION, state.cursor);
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
    if (winners.length > 0) await this.apply(winners);
    for (const record of winners) {
      state.entries[record.id] = {
        hash: record.deleted ? '' : hash(record.payload ?? ''),
        updatedAt: record.updatedAt,
      };
    }
    await setSecret(STATE_KEY, JSON.stringify(state));
  }

  private async localEntries(): Promise<Map<string, ProviderEntry>> {
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
    return entries;
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

  private async apply(records: SyncRecord[]): Promise<void> {
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

  private async write(action: () => Promise<void>): Promise<void> {
    this.applying = true;
    try {
      await action();
    } finally {
      this.applying = false;
    }
  }

  private async loadState(): Promise<SyncState> {
    const raw = await getSecret(STATE_KEY);
    return raw ? (JSON.parse(raw) as SyncState) : { cursor: 0, entries: {} };
  }
}

export const HubSync = new HubSyncImpl();
