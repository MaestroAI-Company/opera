import * as SQLite from 'expo-sqlite';

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
    } catch (e) {
      console.error('Database init failed:', e);
      this.db = null;
    }
  }

  private getDb(): SQLite.SQLiteDatabase {
    if (!this.db) throw new Error('Database not initialized. Call init() first.');
    return this.db;
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
    return conv;
  }

  //update conversation name
  async renameConversation(id: string, name: string): Promise<void> {
    const db = this.getDb();
    await db.runAsync('UPDATE conversations SET name = ?, updatedAt = ? WHERE id = ?', [name, Date.now(), id]);
  }

  //toggle pin status
  async togglePinConversation(id: string, pinned: boolean): Promise<void> {
    const db = this.getDb();
    await db.runAsync('UPDATE conversations SET pinned = ? WHERE id = ?', [pinned ? 1 : 0, id]);
  }

  //get all conversations ordered by most recent
  async getConversations(): Promise<Conversation[]> {
    const db = this.getDb();
    const rows = await db.getAllAsync<Conversation>(
      'SELECT * FROM conversations ORDER BY updatedAt DESC'
    );
    return rows;
  }

  //delete a conversation and its messages
  async deleteConversation(id: string): Promise<void> {
    const db = this.getDb();
    await db.runAsync('DELETE FROM messages WHERE conversationId = ?', [id]);
    await db.runAsync('DELETE FROM conversations WHERE id = ?', [id]);
  }

  //delete a single message
  async deleteMessage(id: string): Promise<void> {
    const db = this.getDb();
    await db.runAsync('DELETE FROM messages WHERE id = ?', [id]);
  }

  //add a message to a conversation
  async addMessage(conversationId: string, role: 'user' | 'assistant', content: string): Promise<Message> {
    const db = this.getDb();
    const now = Date.now();
    const id = `msg_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const msg: Message = { id, conversationId, role, content, createdAt: now };
    await db.runAsync(
      'INSERT INTO messages (id, conversationId, role, content, createdAt) VALUES (?, ?, ?, ?, ?)',
      [msg.id, msg.conversationId, msg.role, msg.content, msg.createdAt]
    );
    //update conversation timestamp
    await db.runAsync('UPDATE conversations SET updatedAt = ? WHERE id = ?', [now, conversationId]);
    return msg;
  }

  //update last assistant message content (for streaming)
  async updateMessageContent(id: string, content: string): Promise<void> {
    const db = this.getDb();
    await db.runAsync('UPDATE messages SET content = ? WHERE id = ?', [content, id]);
  }

  //get all messages for a conversation
  async getMessages(conversationId: string): Promise<Message[]> {
    const db = this.getDb();
    const rows = await db.getAllAsync<Message>(
      'SELECT * FROM messages WHERE conversationId = ? ORDER BY createdAt ASC',
      [conversationId]
    );
    return rows;
  }

  //get all messages across all conversations (for backup)
  async getAllMessagesAllConversations(): Promise<Message[]> {
    const db = this.getDb();
    return await db.getAllAsync<Message>('SELECT * FROM messages');
  }

  //delete all conversations and messages
  async deleteAllConversations(): Promise<void> {
    const db = this.getDb();
    await db.runAsync('DELETE FROM messages');
    await db.runAsync('DELETE FROM conversations');
  }

  //import backup data (replaces existing conversations and messages)
  async importBackup(conversations: Conversation[], messages: Message[]): Promise<void> {
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
        await db.runAsync(
          'INSERT INTO messages (id, conversationId, role, content, createdAt) VALUES (?, ?, ?, ?, ?)',
          [msg.id, msg.conversationId, msg.role, msg.content, msg.createdAt]
        );
      }
    });
  }
}

//export singleton
export const DB = new DatabaseService();
