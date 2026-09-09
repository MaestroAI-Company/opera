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

//stored as a json array of server urls
export function getOllamaUrls(): string[] {
  const settings = Settings.getCached();
  let urls: string[] = [];
  try {
    const parsed = JSON.parse(settings.ollamaUrls || '[]');
    if (Array.isArray(parsed)) urls = parsed.filter((u) => typeof u === 'string' && u.trim().length > 0);
  } catch {}
  //legacy single-url setting seeds the list, never the beta server
  const active = settings.ollamaUrl.trim();
  if (urls.length === 0 && active.length > 0 && active !== BETA_SERVER_URL) urls = [active];
  return urls;
}

export function serializeOllamaUrls(urls: string[]): string {
  return JSON.stringify(urls.map((u) => u.trim()).filter((u) => u.length > 0));
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
    const urls = getOllamaUrls();
    for (const url of urls) {
      sources.push({ key: `ollama:${url}`, service: 'ollama', label: urls.length > 1 ? serverLabel(url) : 'Ollama', url });
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
    patch.ollamaUrls = serializeOllamaUrls([legacy]);
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
