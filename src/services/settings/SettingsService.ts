import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

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
  alwaysWhisper: boolean;
  autoStartMic: boolean;
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
  speaker: false,
  alwaysWhisper: false,
  autoStartMic: true,
};

class SettingsService {
  private db: SQLite.SQLiteDatabase | null = null;
  private cache: AppSettings | null = null;

  //open db and create settings table
  async init(): Promise<void> {
    if (this.db) return; // already initialized
    try {
      this.db = await SQLite.openDatabaseAsync('opera.db');
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
    const map: Record<string, string> = {};
    for (const row of rows) {
      map[row.key] = row.value;
    }
    const settings: AppSettings = {
      language: map['language'] ?? DEFAULTS.language,
      theme: map['theme'] ?? DEFAULTS.theme,
      aiService: map['aiService'] ?? DEFAULTS.aiService,
      ollamaUrl: map['ollamaUrl'] ?? DEFAULTS.ollamaUrl,
      ollamaModel: map['ollamaModel'] ?? DEFAULTS.ollamaModel,
      whisperModel: map['whisperModel'] ?? DEFAULTS.whisperModel,
      whisperLanguage: map['whisperLanguage'] ?? DEFAULTS.whisperLanguage,
      instruction: map['instruction'] ?? DEFAULTS.instruction,
      speaker: map['speaker'] === 'true' ? true : (map['speaker'] === 'false' ? false : DEFAULTS.speaker),
      alwaysWhisper: map['alwaysWhisper'] === 'true' ? true : (map['alwaysWhisper'] === 'false' ? false : DEFAULTS.alwaysWhisper),
    };
    this.cache = settings;
    return settings;
  }

  //save a single setting key-value
  async set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
    const db = this.getDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [key, String(value)]
    );
    if (this.cache) {
      (this.cache as any)[key] = value;
    }
  }

  //save multiple settings at once
  async setMany(partial: Partial<AppSettings>): Promise<void> {
    const db = this.getDb();
    for (const [key, value] of Object.entries(partial)) {
      await db.runAsync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        [key, String(value)]
      );
    }
    if (this.cache) {
      Object.assign(this.cache, partial);
    }
  }

  //get cached settings (after load)
  getCached(): AppSettings {
    return this.cache ?? { ...DEFAULTS };
  }
}

export const Settings = new SettingsService();
