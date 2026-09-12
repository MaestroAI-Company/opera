import { AppSettings, Settings } from '../../settings/SettingsService';
import { getLocalProviderLabel } from './LocalProvider';

//a pickable model source: a provider, plus the server it runs on for ollama
export type ModelSource = {
  key: string;
  service: string;
  label: string;
  url: string;
};

export const PROVIDER_IDS = ['local', 'ollama', 'beta'] as const;

//hosted server offered during the beta, a provider of its own
export const BETA_PROVIDER_ID = 'beta';
export const BETA_SERVER_URL = process.env.EXPO_PUBLIC_BETA_SERVER_URL ?? '';

//configured ollama server entry
export type OllamaServer = {
  url: string;
  name: string;
  contextLength?: number;
  keepAlive?: number;
};

//legacy entries are plain url strings
function readServer(entry: unknown): OllamaServer | null {
  if (typeof entry === 'string') return entry.trim().length > 0 ? { url: entry.trim(), name: '' } : null;
  if (!entry || typeof entry !== 'object') return null;
  const raw = entry as Record<string, unknown>;
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (url.length === 0 && name.length === 0) return null;
  const server: OllamaServer = { url, name };
  if (typeof raw.contextLength === 'number') server.contextLength = raw.contextLength;
  if (typeof raw.keepAlive === 'number') server.keepAlive = raw.keepAlive;
  return server;
}

//stored as a json array
export function getOllamaServers(): OllamaServer[] {
  const settings = Settings.getCached();
  let servers: OllamaServer[] = [];
  try {
    const parsed = JSON.parse(settings.ollamaUrls || '[]');
    if (Array.isArray(parsed)) servers = parsed.map(readServer).filter((s): s is OllamaServer => s !== null);
  } catch {}
  //legacy single-url setting seeds the list, never the beta server
  const active = settings.ollamaUrl.trim();
  if (servers.length === 0 && active.length > 0 && active !== BETA_SERVER_URL) servers = [{ url: active, name: '' }];
  return servers;
}

export function serializeOllamaServers(servers: OllamaServer[]): string {
  const kept = servers
    .map((s) => ({ ...s, url: s.url.trim(), name: s.name.trim() }))
    .filter((s) => s.url.length > 0 || s.name.length > 0);
  return JSON.stringify(kept);
}

//undefined falls back to global
export function getOllamaTuning(url: string): { contextLength: number; keepAlive: number } {
  const settings = Settings.getCached();
  const server = getOllamaServers().find((s) => s.url === url.trim());
  return {
    contextLength: server?.contextLength ?? settings.ollamaContextLength,
    keepAlive: server?.keepAlive ?? settings.ollamaKeepAlive,
  };
}

//generated key matches buildSources
export function activeSourceKey(service: string, url: string): string {
  return service === 'ollama' ? `ollama:${url.trim()}` : service;
}

export function getEnabledProviders(): string[] {
  return Settings.getCached().enabledProviders.split(',').map((p) => p.trim()).filter(Boolean);
}

export function serializeProviders(ids: string[]): string {
  return ids.join(',');
}

//strip the scheme so a tab label stays short
function serverLabel(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

//one entry per enabled provider, one per ollama server
export function buildSources(localAvailable: boolean): ModelSource[] {
  const enabled = getEnabledProviders();
  const sources: ModelSource[] = [];
  if (localAvailable && enabled.includes('local')) {
    sources.push({ key: 'local', service: 'local', label: getLocalProviderLabel(), url: '' });
  }
  if (BETA_SERVER_URL && enabled.includes(BETA_PROVIDER_ID)) {
    //the provider owns its url, nothing to store
    sources.push({ key: BETA_PROVIDER_ID, service: BETA_PROVIDER_ID, label: 'Opera Beta', url: '' });
  }
  if (enabled.includes('ollama')) {
    const servers = getOllamaServers().filter((s) => s.url.length > 0);
    for (const server of servers) {
      //name wins over host then provider
      const label = server.name || (servers.length > 1 ? serverLabel(server.url) : 'Ollama');
      sources.push({ key: `ollama:${server.url}`, service: 'ollama', label, url: server.url });
    }
  }
  return sources;
}

//one-off cleanup of the settings the beta used to share with ollama
export function migrateModelSources(settings: AppSettings): AppSettings {
  const patch: Partial<AppSettings> = {};
  //the legacy seed only lived in the active url, keep it before beta clears it
  const legacy = settings.ollamaUrl.trim();
  const stored = settings.ollamaUrls.trim();
  if ((!stored || stored === '[]') && legacy.length > 0 && legacy !== BETA_SERVER_URL) {
    patch.ollamaUrls = serializeOllamaServers([{ url: legacy, name: '' }]);
  }
  if (!BETA_SERVER_URL) return applyPatch(settings, patch);
  if (settings.aiService === 'ollama' && legacy === BETA_SERVER_URL) {
    patch.aiService = BETA_PROVIDER_ID;
    patch.ollamaUrl = '';
  }
  if (settings.quickFlowService === 'ollama' && settings.quickFlowUrl.trim() === BETA_SERVER_URL) {
    patch.quickFlowService = BETA_PROVIDER_ID;
    patch.quickFlowUrl = '';
  }
  return applyPatch(settings, patch);
}

function applyPatch(settings: AppSettings, patch: Partial<AppSettings>): AppSettings {
  if (Object.keys(patch).length === 0) return settings;
  Settings.setMany(patch);
  return { ...settings, ...patch };
}
