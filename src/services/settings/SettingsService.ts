import * as SQLite from 'expo-sqlite';
import { DeviceEventEmitter } from 'react-native';
import { AppEvents } from '../events';
import { openSharedDatabase } from '../db/sqlite';

export type AppSettings = {
  language: string;
  theme: string;
  aiService: string;
  ollamaUrl: string;
  ollamaModel: string;
  whisperModel: string;
  whisperLanguage: string;
  instruction: string;
  speaker: boolean;
  autoSpeak: boolean;
  alwaysWhisper: boolean;
  autoStartMic: boolean;
  hasSeenOnboarding: boolean;
  name: string;
  includeDateTime: boolean;
  showTechnicalDetails: boolean;
  dataWarningDismissed: boolean;
  useAppContext: boolean;
};

const DEFAULTS: AppSettings = {
  language: 'fr',
  theme: 'system',
  aiService: 'ollama',
  ollamaUrl: '',
  ollamaModel: '',
  whisperModel: 'base',
  whisperLanguage: (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().locale.split('-')[0] || 'auto';
    } catch {
      return 'auto';
    }
  })(),
  instruction: '',
  speaker: true,
  autoSpeak: true,
  alwaysWhisper: false,
  autoStartMic: true,
  hasSeenOnboarding: false,
  name: '',
  includeDateTime: true,
  showTechnicalDetails: false,
  dataWarningDismissed: false,
  useAppContext: true,
};

const SETTINGS_UPDATED_AT_KEY = '__settings_updated_at';

//text storage needs per-key readers
const BOOLEAN_KEYS = [
  'speaker',
  'autoSpeak',
  'alwaysWhisper',
  'autoStartMic',
  'hasSeenOnboarding',
  'includeDateTime',
  'showTechnicalDetails',
  'dataWarningDismissed',
  'useAppContext',
] as const;

function isBooleanKey(key: string): boolean {
  return (BOOLEAN_KEYS as readonly string[]).includes(key);
}

class SettingsService {
  private db: SQLite.SQLiteDatabase | null = null;
  private cache: AppSettings | null = null;

  //open db and create settings table
  async init(): Promise<void> {
    if (this.db) return; // already initialized
    try {
      this.db = await openSharedDatabase();
      await this.db.runAsync(
        `CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )`
      );
    } catch (e) {
      console.error('SettingsService init failed:', e);
    }
  }

  private getDb(): SQLite.SQLiteDatabase {
    if (!this.db) throw new Error('SettingsService not initialized');
    return this.db;
  }

  //load all settings from db, fill missing keys with defaults
  async load(): Promise<AppSettings> {
    const db = this.getDb();
    const rows = await db.getAllAsync<{ key: string; value: string }>(
      'SELECT key, value FROM settings'
    );

    const storedValues: Record<string, string> = {};
    for (const row of rows) {
      storedValues[row.key] = row.value;
    }

    //one reader rule for all keys
    const settings = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS) as (keyof AppSettings)[]) {
      const stored = storedValues[key];
      if (stored === undefined) continue;
      (settings as any)[key] = isBooleanKey(key) ? stored === 'true' : stored;
    }

    this.cache = settings;
    return settings;
  }

  //check if a setting key was explicitly saved
  async has(key: string): Promise<boolean> {
    const db = this.getDb();
    const row = await db.getFirstAsync<{ key: string }>('SELECT key FROM settings WHERE key = ?', [key]);
    return !!row;
  }

  //save a single setting key-value
  async set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
    const db = this.getDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [key, String(value)]
    );
    await this.bumpSettingsUpdatedAt();
    if (this.cache) {
      (this.cache as any)[key] = value;
    }
    DeviceEventEmitter.emit(AppEvents.settingsChanged);
  }

  //save multiple settings at once
  async setMany(partial: Partial<AppSettings>): Promise<void> {
    await this.writeMany(partial);
    await this.bumpSettingsUpdatedAt();
    DeviceEventEmitter.emit(AppEvents.settingsChanged);
  }

  //cloud apply skips local bump
  async applyCloudSettings(partial: Partial<AppSettings>): Promise<void> {
    await this.writeMany(partial);
  }

  private async writeMany(partial: Partial<AppSettings>): Promise<void> {
    const db = this.getDb();
    await db.withTransactionAsync(async () => {
      for (const [key, value] of Object.entries(partial)) {
        await db.runAsync(
          'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
          [key, String(value)]
        );
      }
    });
    if (this.cache) {
      Object.assign(this.cache, partial);
    }
  }

  //get timestamp of last local settings change
  async getSettingsUpdatedAt(): Promise<number> {
    const db = this.getDb();
    const row = await db.getFirstAsync<{value: string}>('SELECT value FROM settings WHERE key = ?', [SETTINGS_UPDATED_AT_KEY]);
    return row ? (parseInt(row.value, 10) || 0) : 0;
  }

  //force the settings timestamp (used by sync merge, no emit)
  async setSettingsUpdatedAt(value: number): Promise<void> {
    const db = this.getDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [SETTINGS_UPDATED_AT_KEY, String(value)]
    );
  }

  private async bumpSettingsUpdatedAt(): Promise<void> {
    const db = this.getDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [SETTINGS_UPDATED_AT_KEY, String(Date.now())]
    );
  }

  //get cached settings (after load)
  getCached(): AppSettings {
    return this.cache ?? { ...DEFAULTS };
  }
}

export const Settings = new SettingsService();
