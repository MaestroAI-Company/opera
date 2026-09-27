import { DeviceEventEmitter } from 'react-native';
import { AppEvents } from '../events';
import { DEFAULT_OLLAMA_URL } from '../ai/utils/imageToBase64';
import { BASE_DEFAULTS, isBooleanKey, isNumberKey, type AppSettings } from './schema';

export type { AppSettings } from './schema';

//web talks to ollama on the same machine
const DEFAULTS: AppSettings = { ...BASE_DEFAULTS, ollamaUrl: DEFAULT_OLLAMA_URL };

class SettingsService {
  private cache: AppSettings | null = null;

  // init settings
  async init(): Promise<void> {
    try {
      await this.load();
    } catch (e) {
      console.error('settings init failed', e);
    }
  }

  // load settings from localstorage
  async load(): Promise<AppSettings> {
    try {
      const stored = localStorage.getItem('opera_settings');
      const parsed = stored ? JSON.parse(stored) : {};

      //one reader rule for all keys
      const settings = { ...DEFAULTS };
      for (const key of Object.keys(DEFAULTS) as (keyof AppSettings)[]) {
        const value = parsed[key];
        if (value === undefined || value === null) continue;
        const expected = isBooleanKey(key) ? 'boolean' : isNumberKey(key) ? 'number' : 'string';
        if (typeof value === expected) (settings as any)[key] = value;
      }

      this.cache = settings;
      return settings;
    } catch (e) {
      console.error('failed to load settings', e);
      this.cache = { ...DEFAULTS };
      return this.cache;
    }
  }

  // check if a setting key was explicitly saved
  async has(key: string): Promise<boolean> {
    const stored = localStorage.getItem('opera_settings');
    const parsed = stored ? JSON.parse(stored) : {};
    return Object.prototype.hasOwnProperty.call(parsed, key);
  }

  // save to localstorage
  private save(): void {
    if (this.cache) {
      localStorage.setItem('opera_settings', JSON.stringify(this.cache));
    }
  }

  //timestamp of last local settings change
  async getSettingsUpdatedAt(): Promise<number> {
    const stored = localStorage.getItem('opera_settings_updated_at');
    return stored ? (parseInt(stored, 10) || 0) : 0;
  }

  //force the settings timestamp (used by sync merge)
  async setSettingsUpdatedAt(value: number): Promise<void> {
    localStorage.setItem('opera_settings_updated_at', String(value));
  }

  private bumpSettingsUpdatedAt(): void {
    localStorage.setItem('opera_settings_updated_at', String(Date.now()));
  }

  // set single key-value
  async set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
    if (!this.cache) {
      this.cache = { ...DEFAULTS };
    }
    (this.cache as any)[key] = value;
    this.bumpSettingsUpdatedAt();
    this.save();
    DeviceEventEmitter.emit(AppEvents.settingsChanged);
  }

  // set multiple settings
  async setMany(partial: Partial<AppSettings>): Promise<void> {
    if (!this.cache) {
      this.cache = { ...DEFAULTS };
    }
    Object.assign(this.cache, partial);
    this.bumpSettingsUpdatedAt();
    this.save();
    DeviceEventEmitter.emit(AppEvents.settingsChanged);
  }

  //apply cloud settings without bumping local timestamp
  async applyCloudSettings(partial: Partial<AppSettings>): Promise<void> {
    if (!this.cache) {
      this.cache = { ...DEFAULTS };
    }
    Object.assign(this.cache, partial);
    this.save();
  }

  //local-only, excluded from sync
  async getLocal(key: string): Promise<string | null> {
    return localStorage.getItem(`opera_local_${key}`);
  }

  async setLocal(key: string, value: string): Promise<void> {
    localStorage.setItem(`opera_local_${key}`, value);
  }

  // get cached settings
  getCached(): AppSettings {
    return this.cache ?? { ...DEFAULTS };
  }
}

// export settings instance
export const Settings = new SettingsService();
