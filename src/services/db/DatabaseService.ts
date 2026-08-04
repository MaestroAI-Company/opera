import * as SQLite from 'expo-sqlite';
import { DeviceEventEmitter } from 'react-native';

export type Conversation = {
  id: string;
  name: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  pinned?: number;
};

export type Message = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  images?: string[];
};

export type SyncTombstone = {
  kind: 'conversation' | 'message';
  id: string;
  deletedAt: number;
};

class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;

  //open db and create tables if needed
  async init(): Promise<void> {
    if (this.db) return; // already initialized
    try {
      this.db = await SQLite.openDatabaseAsync('opera.db');
      await this.db.runAsync(
        `CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          model TEXT NOT NULL,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL,
          pinned INTEGER DEFAULT 0
        )`
      );
      
      try {
        await this.db.runAsync('ALTER TABLE conversations ADD COLUMN pinned INTEGER DEFAULT 0');
      } catch (e) {
        // ignore, column might already exist
      }

      await this.db.runAsync(
        `CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversationId TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          createdAt INTEGER NOT NULL,
          FOREIGN KEY (conversationId) REFERENCES conversations(id)
        )`
      );
      
      try {
        await this.db.runAsync('ALTER TABLE messages ADD COLUMN images TEXT');
      } catch (e) {
        // ignore, column might already exist
      }

      await this.db.runAsync(
        `CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
          content,
          conversationId UNINDEXED
        )`
      );

      await this.db.runAsync(`DROP TRIGGER IF EXISTS messages_ai`);
      await this.db.runAsync(
        `CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
          INSERT INTO messages_fts(rowid, content, conversationId) VALUES (new.rowid, new.content, new.conversationId);
        END;`
      );

      await this.db.runAsync(`DROP TRIGGER IF EXISTS messages_ad`);
      await this.db.runAsync(
        `CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
          DELETE FROM messages_fts WHERE rowid = old.rowid;
        END;`
      );

      await this.db.runAsync(`DROP TRIGGER IF EXISTS messages_au`);
      await this.db.runAsync(
        `CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
          DELETE FROM messages_fts WHERE rowid = old.rowid;
          INSERT INTO messages_fts(rowid, content, conversationId) VALUES (new.rowid, new.content, new.conversationId);
        END;`
      );

      const ftsCount = await this.db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM messages_fts');
      if (ftsCount && ftsCount.count === 0) {
        await this.db.runAsync('INSERT INTO messages_fts(rowid, content, conversationId) SELECT rowid, content, conversationId FROM messages');
      }

      await this.db.runAsync(
        `CREATE TABLE IF NOT EXISTS sync_state (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )`
      );

    } catch (e) {
      console.error('Database init failed:', e);
      this.db = null;
    }
  }

  getDb(): SQLite.SQLiteDatabase {
    if (!this.db) throw new Error('Database not initialized. Call init() first.');
    return this.db;
  }

  //get tombstones (deleted items waiting to propagate via sync)
  async getTombstones(): Promise<SyncTombstone[]> {
    const db = this.getDb();
    const row = await db.getFirstAsync<{value: string}>('SELECT value FROM sync_state WHERE key = ?', ['tombstones']);
    if (!row) return [];
    try {
      return JSON.parse(row.value);
    } catch (e) {
      return [];
    }
  }

  //replace local tombstone registry
  async setTombstones(items: SyncTombstone[]): Promise<void> {
    const db = this.getDb();
    await db.runAsync('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)', ['tombstones', JSON.stringify(items)]);
  }

  //merge items into the local tombstone registry (keep newest deletedAt)
  async recordTombstones(items: SyncTombstone[]): Promise<void> {
    const existing = await this.getTombstones();
    const map = new Map<string, SyncTombstone>();
    for (const t of existing) map.set(t.kind + ':' + t.id, t);
    for (const t of items) {
      const key = t.kind + ':' + t.id;
      const cur = map.get(key);
      if (!cur || t.deletedAt > cur.deletedAt) map.set(key, t);
    }
    await this.setTombstones(Array.from(map.values()));
  }

  //clear all tombstones (used on full backup restore)
  async clearTombstones(): Promise<void> {
    const db = this.getDb();
    await db.runAsync('DELETE FROM sync_state WHERE key = ?', ['tombstones']);
  }

  //create a new conversation
  async createConversation(model: string, firstName: string): Promise<Conversation> {
    const db = this.getDb();
    const now = Date.now();
    const id = `conv_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const conv: Conversation = { id, name: firstName, model, createdAt: now, updatedAt: now, pinned: 0 };
    await db.runAsync(
      'INSERT INTO conversations (id, name, model, createdAt, updatedAt, pinned) VALUES (?, ?, ?, ?, ?, ?)',
      [conv.id, conv.name, conv.model, conv.createdAt, conv.updatedAt, conv.pinned ?? 0]
    );
    DeviceEventEmitter.emit('DATA_CHANGED');
    return conv;
  }

  //update conversation name
  async renameConversation(id: string, name: string): Promise<void> {
    const db = this.getDb();
    await db.runAsync('UPDATE conversations SET name = ?, updatedAt = ? WHERE id = ?', [name, Date.now(), id]);
    DeviceEventEmitter.emit('DATA_CHANGED');
  }

  //toggle pin status
  async togglePinConversation(id: string, pinned: boolean): Promise<void> {
    const db = this.getDb();
    const now = Date.now();
    await db.runAsync('UPDATE conversations SET pinned = ?, updatedAt = ? WHERE id = ?', [pinned ? 1 : 0, now, id]);
    DeviceEventEmitter.emit('DATA_CHANGED');
  }

  //get all conversations ordered by most recent
  async getConversations(): Promise<Conversation[]> {
    const db = this.getDb();
    const rows = await db.getAllAsync<Conversation>(
      'SELECT * FROM conversations ORDER BY updatedAt DESC'
    );
    return rows;
  }

  //search conversations and messages
  async searchConversations(query: string): Promise<Conversation[]> {
    const db = this.getDb();
    if (!query.trim()) return [];

    //format query for fts
    const ftsQuery = query.replace(/"/g, '""') + '*';

    const rows = await db.getAllAsync<Conversation>(
      `SELECT DISTINCT c.* 
       FROM conversations c
       LEFT JOIN messages_fts m_fts ON c.id = m_fts.conversationId
       WHERE c.name LIKE ? OR m_fts.content MATCH ?
       ORDER BY c.updatedAt DESC
       LIMIT 50`,
       [`%${query}%`, ftsQuery]
    );
    return rows;
  }

  //delete a conversation and its messages
  async deleteConversation(id: string, opts?: { recordTombstone?: boolean }): Promise<void> {
    const db = this.getDb();
    if (opts?.recordTombstone !== false) {
      await this.recordTombstones([{ kind: 'conversation', id, deletedAt: Date.now() }]);
    }
    await db.runAsync('DELETE FROM messages WHERE conversationId = ?', [id]);
    await db.runAsync('DELETE FROM conversations WHERE id = ?', [id]);
    DeviceEventEmitter.emit('DATA_CHANGED');
  }

  //delete a single message
  async deleteMessage(id: string, opts?: { recordTombstone?: boolean }): Promise<void> {
    const db = this.getDb();
    if (opts?.recordTombstone !== false) {
      await this.recordTombstones([{ kind: 'message', id, deletedAt: Date.now() }]);
    }
    await db.runAsync('DELETE FROM messages WHERE id = ?', [id]);
    DeviceEventEmitter.emit('DATA_CHANGED');
  }

  //add a message to a conversation
  async addMessage(conversationId: string, role: 'user' | 'assistant', content: string, images?: string[]): Promise<Message> {
    const db = this.getDb();
    const now = Date.now();
    const id = `msg_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const msg: Message = { id, conversationId, role, content, createdAt: now, images };
    const imagesJson = images ? JSON.stringify(images) : null;
    await db.runAsync(
      'INSERT INTO messages (id, conversationId, role, content, createdAt, images) VALUES (?, ?, ?, ?, ?, ?)',
      [msg.id, msg.conversationId, msg.role, msg.content, msg.createdAt, imagesJson]
    );
    //update conversation timestamp
    await db.runAsync('UPDATE conversations SET updatedAt = ? WHERE id = ?', [now, conversationId]);
    DeviceEventEmitter.emit('DATA_CHANGED');
    return msg;
  }

  //update last assistant message content (for streaming)
  async updateMessageContent(id: string, content: string): Promise<void> {
    const db = this.getDb();
    await db.runAsync('UPDATE messages SET content = ? WHERE id = ?', [content, id]);
    DeviceEventEmitter.emit('DATA_CHANGED');
  }

  //get all messages for a conversation
  async getMessages(conversationId: string): Promise<Message[]> {
    const db = this.getDb();
    const rows = await db.getAllAsync<any>(
      'SELECT * FROM messages WHERE conversationId = ? ORDER BY createdAt ASC',
      [conversationId]
    );
    return rows.map(row => ({
      ...row,
      images: row.images ? JSON.parse(row.images) : undefined
    }));
  }

  //get all messages across all conversations (for backup)
  async getAllMessagesAllConversations(): Promise<Message[]> {
    const db = this.getDb();
    const rows = await db.getAllAsync<any>('SELECT * FROM messages');
    return rows.map(row => ({
      ...row,
      images: row.images ? JSON.parse(row.images) : undefined
    }));
  }

  //delete all conversations and messages
  async deleteAllConversations(): Promise<void> {
    const db = this.getDb();
    const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM conversations');
    await this.recordTombstones(rows.map(r => ({ kind: 'conversation', id: r.id, deletedAt: Date.now() })));
    await db.runAsync('DELETE FROM messages');
    await db.runAsync('DELETE FROM conversations');
    DeviceEventEmitter.emit('DATA_CHANGED');
  }

  //import backup data (replaces existing conversations and messages)
  async importBackup(conversations: Conversation[], messages: Message[], tombstones?: SyncTombstone[]): Promise<void> {
    const db = this.getDb();
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM messages');
      await db.runAsync('DELETE FROM conversations');

      for (const conv of conversations) {
        await db.runAsync(
          'INSERT INTO conversations (id, name, model, createdAt, updatedAt, pinned) VALUES (?, ?, ?, ?, ?, ?)',
          [conv.id, conv.name, conv.model, conv.createdAt, conv.updatedAt, conv.pinned ?? 0]
        );
      }

      for (const msg of messages) {
        const imagesJson = msg.images ? JSON.stringify(msg.images) : null;
        await db.runAsync(
          'INSERT INTO messages (id, conversationId, role, content, createdAt, images) VALUES (?, ?, ?, ?, ?, ?)',
          [msg.id, msg.conversationId, msg.role, msg.content, msg.createdAt, imagesJson]
        );
      }
    });
    await this.setTombstones(tombstones ?? []);
    DeviceEventEmitter.emit('DATA_CHANGED');
  }

  //replace a conversation and its messages (used by sync merge)
  async replaceConversationWithMessages(conv: Conversation, messages: Message[]): Promise<void> {
    const db = this.getDb();
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM messages WHERE conversationId = ?', [conv.id]);
      await db.runAsync('DELETE FROM conversations WHERE id = ?', [conv.id]);
      await db.runAsync(
        'INSERT INTO conversations (id, name, model, createdAt, updatedAt, pinned) VALUES (?, ?, ?, ?, ?, ?)',
        [conv.id, conv.name, conv.model, conv.createdAt, conv.updatedAt, conv.pinned ?? 0]
      );
      for (const msg of messages) {
        const imagesJson = msg.images ? JSON.stringify(msg.images) : null;
        await db.runAsync(
          'INSERT INTO messages (id, conversationId, role, content, createdAt, images) VALUES (?, ?, ?, ?, ?, ?)',
          [msg.id, msg.conversationId, msg.role, msg.content, msg.createdAt, imagesJson]
        );
      }
    });
    DeviceEventEmitter.emit('DATA_CHANGED');
  }
}

//export singleton
export const DB = new DatabaseService();
