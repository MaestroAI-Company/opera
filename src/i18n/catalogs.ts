import { en, type Translations } from './en';
import { fr } from './fr';
import { es } from './es';
import { de } from './de';
import { it } from './it';
import { pt } from './pt';

export type { TranslationKey, Translations } from './en';

export const FALLBACK_LOCALE = 'en';

//register new locales here
export const CATALOGS = { en, fr, es, de, it, pt } satisfies Record<string, Translations>;

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
