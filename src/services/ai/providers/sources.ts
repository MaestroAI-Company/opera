import { Settings } from '../../settings/SettingsService';
import { getLocalProviderLabel } from './LocalProvider';

//a pickable model source: a provider, plus the server it runs on for ollama
export type ModelSource = {
  key: string;
  service: string;
  label: string;
  url: string;
};

export const PROVIDER_IDS = ['local', 'ollama', 'beta'] as const;

//shared ollama server offered during the beta
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
  //legacy single-url setting seeds the list
  if (urls.length === 0 && settings.ollamaUrl.trim().length > 0) urls = [settings.ollamaUrl.trim()];
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
    sources.push({ key: BETA_PROVIDER_ID, service: 'ollama', label: 'Opera Beta', url: BETA_SERVER_URL });
  }
  if (enabled.includes('ollama')) {
    const urls = getOllamaUrls();
    for (const url of urls) {
      sources.push({ key: `ollama:${url}`, service: 'ollama', label: urls.length > 1 ? serverLabel(url) : 'Ollama', url });
    }
  }
  return sources;
}
