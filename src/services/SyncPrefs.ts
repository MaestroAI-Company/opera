import { Settings } from './settings/SettingsService';

//what syncs through hub or cloud
export type SyncPrefs = { data: boolean; settings: boolean; providers: boolean };
//old key keeps existing user choices
const SYNC_PREFS_KEY = 'hubSyncPrefs';
const DEFAULT_PREFS: SyncPrefs = { data: true, settings: true, providers: true };

class SyncPrefsStoreImpl {
  private prefs: SyncPrefs = DEFAULT_PREFS;

  async load(): Promise<SyncPrefs> {
    const raw = await Settings.getLocal(SYNC_PREFS_KEY);
    const stored = raw ? JSON.parse(raw) : {};
    this.prefs = {
      data: stored.data ?? DEFAULT_PREFS.data,
      settings: stored.settings ?? DEFAULT_PREFS.settings,
      providers: stored.providers ?? DEFAULT_PREFS.providers,
    };
    return this.prefs;
  }

  get(): SyncPrefs {
    return this.prefs;
  }

  async set(key: keyof SyncPrefs, enabled: boolean): Promise<SyncPrefs> {
    this.prefs = { ...this.prefs, [key]: enabled };
    await Settings.setLocal(SYNC_PREFS_KEY, JSON.stringify(this.prefs));
    return this.prefs;
  }
}

export const SyncPrefsStore = new SyncPrefsStoreImpl();
