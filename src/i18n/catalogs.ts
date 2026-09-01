import { en, type Translations } from './en';
import { fr } from './fr';

export type { TranslationKey, Translations } from './en';

export const FALLBACK_LOCALE = 'en';

//register new locales here
export const CATALOGS = { en, fr } satisfies Record<string, Translations>;

export type SupportedLocale = keyof typeof CATALOGS;

export function isSupportedLocale(code: string): code is SupportedLocale {
  return code in CATALOGS;
}

//device language, english when unsupported
export function defaultLocale(): SupportedLocale {
  try {
    const code = Intl.DateTimeFormat().resolvedOptions().locale.split('-')[0];
    return isSupportedLocale(code) ? code : FALLBACK_LOCALE;
  } catch {
    return FALLBACK_LOCALE;
  }
}
