import * as SQLite from 'expo-sqlite';
import { openSharedDatabase } from '../db/sqlite';

// manages enabled/disabled state for tools and widgets
class PluginRegistryService {
  private db: SQLite.SQLiteDatabase | null = null;
  // key: "tool:name" or "widget:id", value: enabled boolean
  private cache: Map<string, boolean> = new Map();

  async init(): Promise<void> {
    if (this.db) return;
    try {
      this.db = await openSharedDatabase();
      await this.db.runAsync(
        `CREATE TABLE IF NOT EXISTS plugin_registry (
          key TEXT PRIMARY KEY,
          enabled INTEGER NOT NULL
        )`
      );
    } catch (e) {
      console.error('PluginRegistry init failed:', e);
    }
  }

  private getDb(): SQLite.SQLiteDatabase {
    if (!this.db) throw new Error('PluginRegistry not initialized');
    return this.db;
  }

  // load all stored states from db into cache
  async loadAll(): Promise<void> {
    try {
      const db = this.getDb();
      const rows = await db.getAllAsync<{ key: string; enabled: number }>(
        'SELECT key, enabled FROM plugin_registry'
      );
      for (const row of rows) {
        this.cache.set(row.key, row.enabled === 1);
      }
    } catch (e) {
      console.error('PluginRegistry loadAll failed:', e);
    }
  }

  // check if a plugin is enabled; falls back to defaultEnabled if no stored value
  isEnabled(type: 'tool' | 'widget', id: string, defaultEnabled: boolean): boolean {
    const key = `${type}:${id}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    return defaultEnabled;
  }

  // persist and cache a new enabled state
  async setEnabled(type: 'tool' | 'widget', id: string, enabled: boolean): Promise<void> {
    const key = `${type}:${id}`;
    this.cache.set(key, enabled);
    try {
      const db = this.getDb();
      await db.runAsync(
        'INSERT OR REPLACE INTO plugin_registry (key, enabled) VALUES (?, ?)',
        [key, enabled ? 1 : 0]
      );
    } catch (e) {
      console.error('PluginRegistry setEnabled failed:', e);
    }
  }
}

export const PluginRegistry = new PluginRegistryService();
