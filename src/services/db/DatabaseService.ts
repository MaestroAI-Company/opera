import * as SQLite from 'expo-sqlite';
import { DeviceEventEmitter } from 'react-native';
import { AppEvents } from '../events';
import { openSharedDatabase } from './sqlite';

export type Conversation = {
  id: string;
  name: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  pinned?: number;
};

export type MessageMetrics = {
  model?: string;
  timeSec?: number;
  tokens?: number;
  tokensPerSec?: number;
  //reflection level sent to the model
  thinking?: string;
  //prompt tier the model received
  systemPrompt?: string;
};

//web page consulted during generation
export type MessageSource = {
  url: string;
  title?: string;
  favicon?: string;
};

export type Message = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  images?: string[];
  metrics?: MessageMetrics;
  sources?: MessageSource[];
  //app context at send time
  screenContext?: { appPackage: string | null; hasScreenText: boolean; icon?: string | null; label?: string | null };
};

export type SyncTombstone = {
  kind: 'conversation' | 'message';
  id: string;
  deletedAt: number;
};

//old deletions reached every device
const TOMBSTONE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;
  //batch writes count above zero
  private silentDepth = 0;
  //init dedupes concurrent calls
  private initPromise: Promise<void> | null = null;

  //serialize writes on one connection
  private writeChain: Promise<unknown> = Promise.resolve();

  private transaction(work: () => Promise<void>): Promise<void> {
    const db = this.getDb();
    const next = this.writeChain.then(() => db.withTransactionAsync(work));
    //rejected transaction must not stall
    this.writeChain = next.catch(() => undefined);
    return next;
  }

  //one notification per write batch
  async runSilently<T>(work: () => Promise<T>): Promise<T> {
    this.silentDepth++;
    try {
      return await work();
    } finally {
      this.silentDepth--;
    }
  }

  private notifyDataChanged(): void {
    if (this.silentDepth > 0) return;
    DeviceEventEmitter.emit(AppEvents.conversationsChanged);
  }

  //open db and create tables if needed
  async init(): Promise<void> {
    if (this.db) return; // already initialized
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async doInit(): Promise<void> {
    try {
      this.db = await openSharedDatabase();
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
      } catch {
        //column may already exist
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
      } catch {
        //column may already exist
      }

      try {
        await this.db.runAsync('ALTER TABLE messages ADD COLUMN metrics TEXT');
      } catch {
        //column may already exist
      }

      try {
        await this.db.runAsync('ALTER TABLE messages ADD COLUMN screenContext TEXT');
      } catch {
        //column may already exist
      }

      try {
        await this.db.runAsync('ALTER TABLE messages ADD COLUMN sources TEXT');
      } catch {
        //column may already exist
      }

      //conversation open filters on column
      await this.db.runAsync(
        'CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversationId, createdAt)'
      );

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

      await this.db.runAsync(
        `CREATE TABLE IF NOT EXISTS tombstones (
          kind TEXT NOT NULL,
          id TEXT NOT NULL,
          deletedAt INTEGER NOT NULL,
          PRIMARY KEY (kind, id)
        )`
      );
      await this.migrateTombstonesFromSyncState();

    } catch (e) {
      //fail loudly on half-open db
      this.db = null;
      console.error('Database init failed:', e);
      throw e;
    }
  }

  getDb(): SQLite.SQLiteDatabase {
    if (!this.db) throw new Error('Database not initialized. Call init() first.');
    return this.db;
  }

  //check saved data for inconsistencies that can appear after an update or partial import
  //sqlite counts beats json parsing
  async detectDataIssues(): Promise<boolean> {
    const db = this.getDb();
    try {
      const issues = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM messages m
         LEFT JOIN conversations c ON m.conversationId = c.id
         WHERE c.id IS NULL
            OR (m.images IS NOT NULL AND json_valid(m.images) = 0)
            OR (m.metrics IS NOT NULL AND json_valid(m.metrics) = 0)
            OR (m.screenContext IS NOT NULL AND json_valid(m.screenContext) = 0)
            OR (m.sources IS NOT NULL AND json_valid(m.sources) = 0)`
      );
      return !!issues && issues.count > 0;
    } catch (e) {
      //json1 missing orphan check only
      console.warn('Full data check unavailable, checking orphans only:', e);
      const orphan = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM messages m LEFT JOIN conversations c ON m.conversationId = c.id WHERE c.id IS NULL'
      );
      return !!orphan && orphan.count > 0;
    }
  }

  //get tombstones (deleted items waiting to propagate via sync)
  async getTombstones(): Promise<SyncTombstone[]> {
    const db = this.getDb();
    await this.pruneExpiredTombstones();
    return db.getAllAsync<SyncTombstone>('SELECT kind, id, deletedAt FROM tombstones');
  }

  //replace local tombstone registry
  async setTombstones(items: SyncTombstone[]): Promise<void> {
    const db = this.getDb();
    await this.transaction(async () => {
      await db.runAsync('DELETE FROM tombstones');
      for (const item of items) {
        await db.runAsync(
          'INSERT OR REPLACE INTO tombstones (kind, id, deletedAt) VALUES (?, ?, ?)',
          [item.kind, item.id, item.deletedAt]
        );
      }
    });
  }

  //merge items into the local tombstone registry (keep newest deletedAt)
  async recordTombstones(items: SyncTombstone[]): Promise<void> {
    if (items.length === 0) return;
    const db = this.getDb();
    //upsert per item not whole registry
    await this.transaction(async () => {
      for (const item of items) {
        await db.runAsync(
          `INSERT INTO tombstones (kind, id, deletedAt) VALUES (?, ?, ?)
           ON CONFLICT(kind, id) DO UPDATE SET deletedAt = MAX(deletedAt, excluded.deletedAt)`,
          [item.kind, item.id, item.deletedAt]
        );
      }
    });
  }

  //clear all tombstones (used on full backup restore)
  async clearTombstones(): Promise<void> {
    const db = this.getDb();
    await db.runAsync('DELETE FROM tombstones');
  }

  //retention-old deletions seen everywhere
  private async pruneExpiredTombstones(): Promise<void> {
    const db = this.getDb();
    await db.runAsync('DELETE FROM tombstones WHERE deletedAt < ?', [Date.now() - TOMBSTONE_RETENTION_MS]);
  }

  //migrate json registry to table
  private async migrateTombstonesFromSyncState(): Promise<void> {
    const db = this.getDb();
    const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM sync_state WHERE key = ?', ['tombstones']);
    if (!row) return;
    try {
      const legacyItems: SyncTombstone[] = JSON.parse(row.value);
      if (Array.isArray(legacyItems)) {
        await this.recordTombstones(legacyItems);
      }
    } catch (e) {
      console.warn('Could not migrate the legacy tombstone registry:', e);
    }
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
    this.notifyDataChanged();
    return conv;
  }

  //update conversation name
  async renameConversation(id: string, name: string): Promise<void> {
    const db = this.getDb();
    await db.runAsync('UPDATE conversations SET name = ?, updatedAt = ? WHERE id = ?', [name, Date.now(), id]);
    this.notifyDataChanged();
  }

  //toggle pin status
  async togglePinConversation(id: string, pinned: boolean): Promise<void> {
    const db = this.getDb();
    const now = Date.now();
    await db.runAsync('UPDATE conversations SET pinned = ?, updatedAt = ? WHERE id = ?', [pinned ? 1 : 0, now, id]);
    this.notifyDataChanged();
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

    //format fts query
    const ftsQuery = '"' + query.replace(/"/g, '""') + '"*';

    const rows = await db.getAllAsync<Conversation>(
      `SELECT DISTINCT c.*
       FROM conversations c
       WHERE c.name LIKE ?
         OR c.id IN (
           SELECT conversationId FROM messages_fts WHERE content MATCH ?
         )
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
    this.notifyDataChanged();
  }

  //delete a single message
  async deleteMessage(id: string, opts?: { recordTombstone?: boolean }): Promise<void> {
    const db = this.getDb();
    if (opts?.recordTombstone !== false) {
      await this.recordTombstones([{ kind: 'message', id, deletedAt: Date.now() }]);
    }
    await db.runAsync('DELETE FROM messages WHERE id = ?', [id]);
    this.notifyDataChanged();
  }

  //add a message to a conversation
  async addMessage(conversationId: string, role: 'user' | 'assistant', content: string, images?: string[], screenContext?: Message['screenContext']): Promise<Message> {
    const db = this.getDb();
    const now = Date.now();
    const id = `msg_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const msg: Message = { id, conversationId, role, content, createdAt: now, images, screenContext };
    const imagesJson = images ? JSON.stringify(images) : null;
    const screenContextJson = screenContext ? JSON.stringify(screenContext) : null;
    await db.runAsync(
      'INSERT INTO messages (id, conversationId, role, content, createdAt, images, screenContext) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [msg.id, msg.conversationId, msg.role, msg.content, msg.createdAt, imagesJson, screenContextJson]
    );
    //update conversation timestamp
    await db.runAsync('UPDATE conversations SET updatedAt = ? WHERE id = ?', [now, conversationId]);
    this.notifyDataChanged();
    return msg;
  }

  //patch async screen context
  async updateMessageScreenContext(id: string, screenContext: Message['screenContext']): Promise<void> {
    const db = this.getDb();
    await db.runAsync('UPDATE messages SET screenContext = ? WHERE id = ?', [screenContext ? JSON.stringify(screenContext) : null, id]);
  }

  //update last assistant message content (for streaming)
  async updateMessageContent(id: string, content: string): Promise<void> {
    const db = this.getDb();
    await db.runAsync('UPDATE messages SET content = ? WHERE id = ?', [content, id]);
    this.notifyDataChanged();
  }

  //store generation metrics for a message
  async updateMessageMetrics(id: string, metrics: MessageMetrics): Promise<void> {
    const db = this.getDb();
    await db.runAsync('UPDATE messages SET metrics = ? WHERE id = ?', [JSON.stringify(metrics), id]);
  }

  //store sources consulted for a message
  async updateMessageSources(id: string, sources: Message['sources']): Promise<void> {
    const db = this.getDb();
    await db.runAsync('UPDATE messages SET sources = ? WHERE id = ?', [sources && sources.length > 0 ? JSON.stringify(sources) : null, id]);
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
      images: row.images ? JSON.parse(row.images) : undefined,
      metrics: row.metrics ? JSON.parse(row.metrics) : undefined,
      screenContext: row.screenContext ? JSON.parse(row.screenContext) : undefined,
      sources: row.sources ? JSON.parse(row.sources) : undefined
    }));
  }

  //get all messages across all conversations (for backup)
  async getAllMessagesAllConversations(): Promise<Message[]> {
    const db = this.getDb();
    const rows = await db.getAllAsync<any>('SELECT * FROM messages');
    return rows.map(row => ({
      ...row,
      images: row.images ? JSON.parse(row.images) : undefined,
      metrics: row.metrics ? JSON.parse(row.metrics) : undefined,
      screenContext: row.screenContext ? JSON.parse(row.screenContext) : undefined,
      sources: row.sources ? JSON.parse(row.sources) : undefined
    }));
  }

  //delete all conversations and messages
  async deleteAllConversations(): Promise<void> {
    const db = this.getDb();
    const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM conversations');
    await this.recordTombstones(rows.map(r => ({ kind: 'conversation', id: r.id, deletedAt: Date.now() })));
    await db.runAsync('DELETE FROM messages');
    await db.runAsync('DELETE FROM conversations');
    this.notifyDataChanged();
  }

  //import backup data (replaces existing conversations and messages)
  async importBackup(conversations: Conversation[], messages: Message[], tombstones?: SyncTombstone[]): Promise<void> {
    const db = this.getDb();
    await this.transaction(async () => {
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
        const metricsJson = msg.metrics ? JSON.stringify(msg.metrics) : null;
        const screenContextJson = msg.screenContext ? JSON.stringify(msg.screenContext) : null;
        const sourcesJson = msg.sources ? JSON.stringify(msg.sources) : null;
        await db.runAsync(
          'INSERT INTO messages (id, conversationId, role, content, createdAt, images, metrics, screenContext, sources) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [msg.id, msg.conversationId, msg.role, msg.content, msg.createdAt, imagesJson, metricsJson, screenContextJson, sourcesJson]
        );
      }
    });
    await this.setTombstones(tombstones ?? []);
    this.notifyDataChanged();
  }

  //replace a conversation and its messages (used by sync merge)
  async replaceConversationWithMessages(conv: Conversation, messages: Message[]): Promise<void> {
    const db = this.getDb();
    await this.transaction(async () => {
      await db.runAsync('DELETE FROM messages WHERE conversationId = ?', [conv.id]);
      await db.runAsync('DELETE FROM conversations WHERE id = ?', [conv.id]);
      await db.runAsync(
        'INSERT INTO conversations (id, name, model, createdAt, updatedAt, pinned) VALUES (?, ?, ?, ?, ?, ?)',
        [conv.id, conv.name, conv.model, conv.createdAt, conv.updatedAt, conv.pinned ?? 0]
      );
      for (const msg of messages) {
        const imagesJson = msg.images ? JSON.stringify(msg.images) : null;
        const metricsJson = msg.metrics ? JSON.stringify(msg.metrics) : null;
        const screenContextJson = msg.screenContext ? JSON.stringify(msg.screenContext) : null;
        const sourcesJson = msg.sources ? JSON.stringify(msg.sources) : null;
        await db.runAsync(
          'INSERT INTO messages (id, conversationId, role, content, createdAt, images, metrics, screenContext, sources) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [msg.id, msg.conversationId, msg.role, msg.content, msg.createdAt, imagesJson, metricsJson, screenContextJson, sourcesJson]
        );
      }
    });
    this.notifyDataChanged();
  }
}

//export singleton
export const DB = new DatabaseService();
