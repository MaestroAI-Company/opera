import { AppState, DeviceEventEmitter } from 'react-native';
import { AIModule } from '../ai/AIModule';
import { CloudSync } from '../CloudSyncService';
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
import { McpService } from '../mcp/McpService';
import { getSecret, setSecret } from '../mcp/mcpStorage';
import { McpServerConfig } from '../mcp/types';
import { BASE_DEFAULTS } from '../settings/schema';
import { AppSettings, Settings } from '../settings/SettingsService';
import { SyncPrefsStore } from '../SyncPrefs';
import { pullRemoteChanges, pushLocalChanges, queueCloudMerge, resetDataSync } from './hubData';
import { HUB_URL_SCHEME, hubErrorCode, HubProvider, SamplerHub, PairedHub, SyncRecord } from './SamplerHubService';

//cursor and per entry fingerprints
const STATE_KEYS = { providers: 'sampler_hub_sync_state', settings: 'sampler_hub_sync_state_settings' } as const;
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

//another sync account was picked
const PAUSED_KEY = 'hubSyncPaused';
//a hub release the user put off
const DECLINED_UPDATE_KEY = 'hubUpdateDeclined';

type ProviderEntry =
  | { kind: 'ollama'; server: OllamaServer }
  | { kind: 'openai'; server: OllamaServer; apiKey: string }
  | { kind: 'mcp'; server: McpServerConfig; headerValue: string; oauth?: Record<string, string | null> };

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

//devices that added the same server before pairing
function oneServerPerUrl(servers: OllamaServer[]): OllamaServer[] {
  const key = (server: OllamaServer) => server.url.trim().replace(/\/+$/, '').toLowerCase();
  const kept = new Map<string, OllamaServer>();
  for (const server of servers) {
    const known = kept.get(key(server));
    //the smallest id wins the same way everywhere
    if (!known || server.id! < known.id!) kept.set(key(server), server);
  }
  return servers.filter((server) => kept.get(key(server)) === server);
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
  private paused = false;
  private offeredUpdate: string | null = null;

  //cache loads before the model is picked
  async init(): Promise<void> {
    if (this.initialized || !SamplerHub.isSupported()) return;
    this.initialized = true;
    await this.readCached();
    this.request(0);
    this.watch();
    const onLocalChange = () => {
      if (!this.applying) this.request(CHANGE_DEBOUNCE_MS);
    };
    DeviceEventEmitter.addListener(AppEvents.settingsChanged, onLocalChange);
    DeviceEventEmitter.addListener(AppEvents.conversationsChanged, onLocalChange);
    DeviceEventEmitter.addListener(AppEvents.cloudMerged, async (touched) => {
      //a later pairing pushes everything anyway
      if (!(await SamplerHub.getPairedHub())) return;
      queueCloudMerge(touched)
        .then(() => this.request(CHANGE_DEBOUNCE_MS))
        .catch((e) => console.warn('[HubSync] cloud merge not queued:', e));
    });
    AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      this.request(0);
      this.watch();
    });
  }

  //what init loads, also for a window that only reads and changes hub settings
  async readCached(): Promise<void> {
    await SyncPrefsStore.load();
    await this.isPaused();
    const cached = await Settings.getLocal(PROVIDERS_KEY);
    if (cached) {
      const { hubName, providers } = JSON.parse(cached) as CachedProviders;
      setHubProviders(providers, hubName);
      McpService.setHubServers(providers).catch((e) => console.warn('[HubSync] hub mcp servers not loaded:', e));
    }
    setHubServerPrefs(JSON.parse((await Settings.getLocal(HUB_PREFS_KEY)) ?? '{}'));
  }

  async isPaused(): Promise<boolean> {
    this.paused = (await Settings.getLocal(PAUSED_KEY)) === 'true';
    return this.paused;
  }

  //hub stays paired for shared models
  async setPaused(paused: boolean): Promise<void> {
    this.paused = paused;
    await Settings.setLocal(PAUSED_KEY, String(paused));
    if (!paused) this.request(0);
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
    //a new hub syncs by default
    await this.setPaused(false);
  }

  //a profile on a fresh hub gets everything again
  async joinedProfile(): Promise<void> {
    for (const key of Object.values(STATE_KEYS)) await setSecret(key, null);
    await resetDataSync();
    //an older build paused it for the cloud
    await this.setPaused(false);
    //the cloud backup moves to the profile key
    await CloudSync.refreshSecret();
    this.request(0);
    this.watch();
  }

  //the hub answers as soon as another device writes
  private async watch(): Promise<void> {
    if (this.watching) return;
    this.watching = true;
    let since = 0;
    try {
      while (AppState.currentState === 'active') {
        const hub = await SamplerHub.getPairedHub();
        //an unbound device reaches no data
        if (!hub || !(await SamplerHub.getProfile())) break;
        try {
          const cursor = await SamplerHub.watch(hub, since);
          if (since > 0 && cursor > since) this.request(0);
          since = Math.max(since, cursor);
          //servers started elsewhere show up within a watch
          await this.refreshProviders().catch(() => {});
        } catch (e) {
          //offline networks may still reach a hub nearby
          if (hubErrorCode(e) === 'Unreachable' && SamplerHub.canDiscover()) {
            await SamplerHub.nearbyHubs().catch(() => []);
          }
          await new Promise((resolve) => setTimeout(resolve, WATCH_RETRY_MS));
        }
      }
    } finally {
      this.watching = false;
    }
  }

  private async run(): Promise<void> {
    const hub = await SamplerHub.getPairedHub();
    if (!hub || !(await SamplerHub.getProfile())) return;
    await this.dropInjectedServers();
    await this.storeProviders(await SamplerHub.providers(hub), hub.name);
    await this.offerUpdate(hub);
    //a cloud sync account replaces sampler, a backup does not
    if (this.paused || (CloudSync.getProviderName() !== 'none' && !CloudSync.isBackupMode())) return;
    const prefs = SyncPrefsStore.get();
    if (prefs.providers) {
      await this.syncFingerprinted(hub, 'providers', await this.providerEntries(), (r) => this.applyProviders(r));
    }
    if (prefs.settings) {
      await this.syncFingerprinted(hub, 'settings', this.settingEntries(), (r) => this.applySettings(r));
    }
    if (!prefs.data) return;
    await pushLocalChanges(hub);
    if (await this.write(() => pullRemoteChanges(hub))) {
      await this.write(async () => DB.notifySynced());
    }
  }

  //once per version, admins only
  private async offerUpdate(hub: PairedHub): Promise<void> {
    if (!SamplerHub.canUpdateHub()) return;
    const status = await SamplerHub.status(hub).catch(() => null);
    const version = status?.update;
    if (!status || !version || version === this.offeredUpdate) return;
    if ((await Settings.getLocal(DECLINED_UPDATE_KEY)) === version) return;
    this.offeredUpdate = version;
    DeviceEventEmitter.emit(AppEvents.hubUpdateAvailable, { hub, version, current: status.version });
  }

  async declineUpdate(version: string): Promise<void> {
    await Settings.setLocal(DECLINED_UPDATE_KEY, version);
  }

  //what the hub serves now, mcp servers included
  async refreshProviders(): Promise<void> {
    const hub = await SamplerHub.getPairedHub();
    if (!hub) return;
    await this.storeProviders(await SamplerHub.providers(hub), hub.name);
  }

  private async storeProviders(providers: HubProvider[], hubName: string): Promise<void> {
    const json = JSON.stringify({ hubName, providers } satisfies CachedProviders);
    if (json === (await Settings.getLocal(PROVIDERS_KEY))) return;
    setHubProviders(providers, hubName);
    await McpService.setHubServers(providers);
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
    //returns the ids it refused to apply
    apply: (winners: SyncRecord[]) => Promise<string[] | void>,
  ): Promise<void> {
    const raw = await getSecret(STATE_KEYS[collection]);
    const state: FingerprintState = raw ? JSON.parse(raw) : { cursor: 0, entries: {} };

    const pullAll = async () => {
      const incoming: SyncRecord[] = [];
      let more = true;
      while (more) {
        const page = await SamplerHub.pull(hub, collection, state.cursor);
        incoming.push(...page.records);
        state.cursor = page.cursor;
        more = page.more;
      }
      return incoming;
    };
    const settle = async (records: SyncRecord[]) => {
      const refused = new Set((await apply(records)) ?? []);
      for (const record of records) {
        //a refused value stays local and unshared
        const json = refused.has(record.id) ? local.get(record.id) : record.deleted ? null : record.payload;
        state.entries[record.id] = { hash: json ? hash(json) : '', updatedAt: record.updatedAt };
      }
    };

    //a new device takes what the others already share
    const adopted = new Set<string>();
    if (!raw) {
      const remote = await pullAll();
      if (remote.length > 0) await settle(remote);
      for (const record of remote) adopted.add(record.id);
    }

    const now = Date.now();
    const outgoing: SyncRecord[] = [];
    for (const [id, json] of local) {
      const fingerprint = hash(json);
      if (adopted.has(id) || state.entries[id]?.hash === fingerprint) continue;
      outgoing.push({ id, updatedAt: now, deleted: false, payload: json });
      state.entries[id] = { hash: fingerprint, updatedAt: now };
    }
    for (const [id, known] of Object.entries(state.entries)) {
      if (adopted.has(id) || local.has(id) || known.hash === '') continue;
      outgoing.push({ id, updatedAt: now, deleted: true, payload: null });
      state.entries[id] = { hash: '', updatedAt: now };
    }
    if (outgoing.length > 0) await SamplerHub.push(hub, collection, outgoing);

    //the hub already settled conflicts
    const winners = (await pullAll()).filter((record) => {
      const known = state.entries[record.id];
      const fingerprint = record.deleted ? '' : hash(record.payload ?? '');
      return !known || (record.updatedAt >= known.updatedAt && known.hash !== fingerprint);
    });
    if (winners.length > 0) await settle(winners);
    await setSecret(STATE_KEYS[collection], JSON.stringify(state));
  }

  private settingEntries(): Map<string, string> {
    const settings = Settings.getCached();
    return new Map(SHARED_SETTINGS.map((key) => [key, JSON.stringify(settings[key])]));
  }

  private async applySettings(records: SyncRecord[]): Promise<string[]> {
    const patch: Record<string, unknown> = {};
    for (const record of records) {
      if (record.payload && (SHARED_SETTINGS as readonly string[]).includes(record.id)) {
        patch[record.id] = JSON.parse(record.payload);
      }
    }
    //a provider or server this device lacks keeps the local model
    const url = typeof patch.ollamaUrl === 'string' ? patch.ollamaUrl.trim() : '';
    const knownUrl =
      !url || isHubUrl(url) || [...getOllamaServers(), ...getOpenAIServers()].some((s) => s.url === url);
    const refused: string[] = [];
    if (!knownUrl || (typeof patch.aiService === 'string' && !isProviderSupported(patch.aiService))) {
      for (const key of ['aiService', 'ollamaUrl', 'ollamaModel']) {
        if (key in patch) refused.push(key);
        delete patch[key];
      }
    }
    if (Object.keys(patch).length === 0) return refused;
    await this.write(() => Settings.setMany(patch as Partial<AppSettings>));
    DeviceEventEmitter.emit(AppEvents.settingsSynced);
    if (ACTIVE_MODEL_KEYS.some((key) => key in patch)) {
      const settings = Settings.getCached();
      AIModule.setMode(settings.aiService);
      if (settings.ollamaUrl) {
        const tuning = getOllamaTuning(settings.ollamaUrl);
        AIModule.configure(settings.ollamaUrl, tuning.contextLength, tuning.keepAlive);
      }
    }
    return refused;
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
        oauth: await McpAuth.exportSession(server.id),
      });
    }
    return new Map([...entries].map(([id, entry]) => [id, JSON.stringify(entry)]));
  }

  //older entries had no stable id
  private async withIds(): Promise<Lists> {
    const allOllama = getOllamaServers();
    const openai = getOpenAIServers();
    const missing = [...allOllama, ...openai].filter((s) => !s.id);
    for (const server of missing) server.id = newServerId();
    const ollama = oneServerPerUrl(allOllama);
    if (missing.length > 0 || ollama.length !== allOllama.length) {
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
        if (entry.oauth) await McpAuth.importSession(record.id, entry.oauth);
      }
    }

    await this.write(() =>
      Settings.setMany({
        ollamaUrls: serializeServers(ollama),
        openaiUrls: serializeServers(openai),
        mcpServers: JSON.stringify(mcp),
      }),
    );
    DeviceEventEmitter.emit(AppEvents.settingsSynced);
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
