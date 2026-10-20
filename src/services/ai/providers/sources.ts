import { Platform } from 'react-native';
import { t } from '../../../i18n';
import { AppSettings, Settings } from '../../settings/SettingsService';
import { getSecret, setSecret } from '../../mcp/mcpStorage';

//provider plus its server if any
export type ModelSource = {
  key: string;
  service: string;
  label: string;
  url: string;
};

export const PROVIDER_IDS = ['local', 'litert', 'ollama', 'openai', 'beta'] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

//tauri ships the web bundle, detect it
export type ProviderPlatform = 'android' | 'ios' | 'web' | 'desktop';

//providers with a reachable backend
const PROVIDER_PLATFORMS: Record<ProviderId, readonly ProviderPlatform[]> = {
  local: ['android', 'ios', 'web', 'desktop'],
  //litert-lm is native arm64, mobile only
  litert: ['android', 'ios'],
  ollama: ['android', 'ios', 'web', 'desktop'],
  openai: ['android', 'ios', 'web', 'desktop'],
  beta: ['android', 'ios', 'web', 'desktop'],
};

export function currentPlatform(): ProviderPlatform {
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'ios') return 'ios';
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? 'desktop' : 'web';
}

//unsupported providers stay out of ui
export function isProviderSupported(id: string): boolean {
  const platforms = PROVIDER_PLATFORMS[id as ProviderId];
  return !!platforms && platforms.includes(currentPlatform());
}

//hosted server offered during the beta, a provider of its own
export const BETA_PROVIDER_ID = 'beta';
export const BETA_SERVER_URL = process.env.EXPO_PUBLIC_BETA_SERVER_URL ?? '';

//any server speaking the openai protocol
export const OPENAI_PROVIDER_ID = 'openai';

//tuning fields apply to ollama only
export type OllamaServer = {
  url: string;
  name: string;
  contextLength?: number;
  keepAlive?: number;
  //names the stored openai api key
  id?: string;
  //disabled ones hidden from pickers
  disabledModels?: string[];
  //user set caps win over detection
  capabilities?: Record<string, string[]>;
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
  if (typeof raw.id === 'string' && raw.id.length > 0) server.id = raw.id;
  if (Array.isArray(raw.disabledModels)) {
    const disabled = raw.disabledModels.filter((m): m is string => typeof m === 'string');
    if (disabled.length > 0) server.disabledModels = disabled;
  }
  if (raw.capabilities && typeof raw.capabilities === 'object') {
    const caps = Object.entries(raw.capabilities as Record<string, unknown>)
      .filter((e): e is [string, string[]] => Array.isArray(e[1]) && e[1].every((c) => typeof c === 'string'));
    if (caps.length > 0) server.capabilities = Object.fromEntries(caps);
  }
  return server;
}

//stored as a json array
function parseServers(raw: string): OllamaServer[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (Array.isArray(parsed)) return parsed.map(readServer).filter((s): s is OllamaServer => s !== null);
  } catch {}
  return [];
}

//legacy url only seeds ollama
function isLegacyOllamaSeed(settings: AppSettings): boolean {
  const active = settings.ollamaUrl.trim();
  return settings.aiService === 'ollama' && active.length > 0 && active !== BETA_SERVER_URL;
}

export function getOllamaServers(): OllamaServer[] {
  const settings = Settings.getCached();
  const servers = parseServers(settings.ollamaUrls);
  //legacy single-url setting seeds the list
  if (servers.length === 0 && isLegacyOllamaSeed(settings)) return [{ url: settings.ollamaUrl.trim(), name: '' }];
  return servers;
}

export function getOpenAIServers(): OllamaServer[] {
  return parseServers(Settings.getCached().openaiUrls);
}

export function newOpenAIServerId(): string {
  return `openai_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

//keep secrets out of cloud sync
const apiKeySecret = (id: string) => `${id}_key`;

export async function getOpenAIApiKey(url: string): Promise<string> {
  const server = getOpenAIServers().find((s) => s.url === url.trim());
  return server?.id ? ((await getSecret(apiKeySecret(server.id))) ?? '') : '';
}

export async function getOpenAIApiKeyById(id: string): Promise<string> {
  return (await getSecret(apiKeySecret(id))) ?? '';
}

export async function setOpenAIApiKey(id: string, value: string): Promise<void> {
  await setSecret(apiKeySecret(id), value.trim() || null);
}

export function serializeServers(servers: OllamaServer[]): string {
  const kept = servers
    .map((s) => ({ ...s, url: s.url.trim(), name: s.name.trim() }))
    .filter((s) => s.url.length > 0 || s.name.length > 0);
  return JSON.stringify(kept);
}

function findServer(service: string, url: string): OllamaServer | undefined {
  const servers = service === 'ollama' ? getOllamaServers() : service === OPENAI_PROVIDER_ID ? getOpenAIServers() : [];
  return servers.find((s) => s.url === url.trim());
}

export function getDisabledModels(service: string, url: string): string[] {
  return findServer(service, url)?.disabledModels ?? [];
}

export function getCapabilityOverride(service: string, url: string, model: string): string[] | undefined {
  return findServer(service, url)?.capabilities?.[model];
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
  return url.trim().length > 0 ? `${service}:${url.trim()}` : service;
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

//domain name like api.mistral.ai gives Mistral
function apiNameFromUrl(url: string): string | null {
  const parts = serverLabel(url.trim()).split(/[/:]/)[0].toLowerCase().split('.');
  //skip ips and bare hosts like localhost
  if (parts.length < 2 || parts.every((p) => /^\d+$/.test(p))) return null;
  const domain = parts[parts.length - 2];
  return domain ? domain.charAt(0).toUpperCase() + domain.slice(1) : null;
}

//user name, else service name numbered on repeats
export function openAIServerNames(servers: OllamaServer[]): (string | null)[] {
  const seen: Record<string, number> = {};
  return servers.map((server) => {
    if (server.name) return server.name;
    const known = apiNameFromUrl(server.url);
    if (!known) return null;
    seen[known] = (seen[known] ?? 0) + 1;
    return seen[known] > 1 ? `${known} #${seen[known]}` : known;
  });
}

//one tab per configured server
function serverSources(service: string, servers: OllamaServer[], fallback: string): ModelSource[] {
  const kept = servers.filter((s) => s.url.length > 0);
  const names = service === OPENAI_PROVIDER_ID ? openAIServerNames(kept) : kept.map((s) => s.name || null);
  return kept.map((server, i) => ({
    key: `${service}:${server.url}`,
    service,
    //name wins over host then provider
    label: names[i] || (kept.length > 1 ? serverLabel(server.url) : fallback),
    url: server.url,
  }));
}

//one entry per provider and server
export function buildSources(localAvailable: boolean): ModelSource[] {
  const enabled = getEnabledProviders();
  const sources: ModelSource[] = [];
  if (localAvailable && isProviderSupported('local') && enabled.includes('local')) {
    sources.push({ key: 'local', service: 'local', label: t('settings.service.local'), url: '' });
  }
  if (isProviderSupported('litert') && enabled.includes('litert')) {
    sources.push({ key: 'litert', service: 'litert', label: t('settings.service.litert'), url: '' });
  }
  if (BETA_SERVER_URL && enabled.includes(BETA_PROVIDER_ID)) {
    //the provider owns its url, nothing to store
    sources.push({ key: BETA_PROVIDER_ID, service: BETA_PROVIDER_ID, label: 'Opera Beta', url: '' });
  }
  if (isProviderSupported('ollama') && enabled.includes('ollama')) {
    sources.push(...serverSources('ollama', getOllamaServers(), 'Ollama'));
  }
  if (isProviderSupported(OPENAI_PROVIDER_ID) && enabled.includes(OPENAI_PROVIDER_ID)) {
    sources.push(...serverSources(OPENAI_PROVIDER_ID, getOpenAIServers(), t('settings.service.cloudapi')));
  }
  return sources;
}

//one-off cleanup of the settings the beta used to share with ollama
export function migrateModelSources(settings: AppSettings): AppSettings {
  const patch: Partial<AppSettings> = {};
  //the legacy seed only lived in the active url, keep it before beta clears it
  const legacy = settings.ollamaUrl.trim();
  const stored = settings.ollamaUrls.trim();
  if ((!stored || stored === '[]') && isLegacyOllamaSeed(settings)) {
    patch.ollamaUrls = serializeServers([{ url: legacy, name: '' }]);
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
