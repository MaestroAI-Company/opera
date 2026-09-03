import { Settings } from '../../settings/SettingsService';

const STORE_KEY = 'model_cache';

//cache per source for instant tab switch
let cache: Record<string, string[]> = {};
let hydrated = false;

function sanitize(parsed: unknown): Record<string, string[]> {
  if (!parsed || typeof parsed !== 'object') return {};
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (Array.isArray(value)) out[key] = value.filter((m): m is string => typeof m === 'string');
  }
  return out;
}

//retried on failure, settings may not be open yet
export async function hydrateModelCache(): Promise<void> {
  if (hydrated) return;
  try {
    const raw = await Settings.getLocal(STORE_KEY);
    cache = raw ? sanitize(JSON.parse(raw)) : {};
    hydrated = true;
  } catch (error) {
    console.warn('[modelCache] could not read the stored model list:', error);
  }
}

export function getCachedModels(sourceKey: string): string[] {
  return cache[sourceKey] ?? [];
}

export function setCachedModels(sourceKey: string, models: string[]): void {
  cache[sourceKey] = models;
  Settings.setLocal(STORE_KEY, JSON.stringify(cache)).catch((error) => {
    console.warn('[modelCache] could not store the model list:', error);
  });
}
