import * as SQLite from 'expo-sqlite';
import { DeviceEventEmitter } from 'react-native';
import { AppEvents } from '../events';
import { openSharedDatabase } from '../db/sqlite';
import { BASE_DEFAULTS, isBooleanKey, isNumberKey, type AppSettings } from './schema';

export type { AppSettings } from './schema';

const DEFAULTS = BASE_DEFAULTS;

const SETTINGS_UPDATED_AT_KEY = '__settings_updated_at';

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
      if (isNumberKey(key)) {
        const parsed = parseInt(stored, 10);
        //keep alive of zero stays loaded
        (settings as any)[key] = isNaN(parsed) ? (DEFAULTS as any)[key] : parsed;
      } else {
        (settings as any)[key] = isBooleanKey(key) ? stored === 'true' : stored;
      }
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
    //emit may fire during the await
    if (this.cache) {
      (this.cache as any)[key] = value;
    }
    const db = this.getDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [key, String(value)]
    );
    await this.bumpSettingsUpdatedAt();
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
    //emit may fire during the await
    if (this.cache) {
      Object.assign(this.cache, partial);
    }
    const db = this.getDb();
    //avoid nested transaction from shared db
    for (const [key, value] of Object.entries(partial)) {
      await db.runAsync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        [key, String(value)]
      );
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

  //local-only, excluded from sync
  async getLocal(key: string): Promise<string | null> {
    const db = this.getDb();
    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [`__${key}`]);
    return row ? row.value : null;
  }

  async setLocal(key: string, value: string): Promise<void> {
    const db = this.getDb();
    await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [`__${key}`, value]);
  }

  //get cached settings (after load)
  getCached(): AppSettings {
    return this.cache ?? { ...DEFAULTS };
  }
}

export const Settings = new SettingsService();
