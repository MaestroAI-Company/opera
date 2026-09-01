import { useSyncExternalStore } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { AppEvents } from '../services/events';
import { Settings } from '../services/settings/SettingsService';
import {
  CATALOGS,
  FALLBACK_LOCALE,
  defaultLocale,
  isSupportedLocale,
  type SupportedLocale,
  type TranslationKey,
  type Translations,
} from './catalogs';

export type { SupportedLocale, TranslationKey } from './catalogs';

export type TranslationParams = Record<string, string | number>;

//shared by the separate overlay entry
let locale: SupportedLocale = defaultLocale();
let catalog: Translations = CATALOGS[locale];
const listeners = new Set<() => void>();
let started = false;

export function setLocale(next: string): void {
  const resolved = isSupportedLocale(next) ? next : FALLBACK_LOCALE;
  if (resolved === locale) return;

  locale = resolved;
  catalog = CATALOGS[resolved];
  for (const listener of listeners) listener();
}

export function getLocale(): SupportedLocale {
  return locale;
}

//track the saved language setting
export function initI18n(): void {
  if (started) return;
  started = true;

  //other surfaces write through Settings.set
  DeviceEventEmitter.addListener(AppEvents.settingsChanged, () => {
    setLocale(Settings.getCached().language);
  });

  (async () => {
    try {
      await Settings.init();
      const saved = await Settings.load();
      setLocale(saved.language);
    } catch {
      //keep the device locale on failure
    }
  })();
}

//fills {name} placeholders
function format(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in params ? String(params[key]) : match
  );
}

export function t(key: TranslationKey, params?: TranslationParams): string {
  //untranslated keys still read in english
  const template = catalog[key] ?? CATALOGS[FALLBACK_LOCALE][key] ?? key;
  return format(template, params);
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): SupportedLocale {
  return locale;
}

//re-renders on locale change
export function useT(): typeof t {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return t;
}
