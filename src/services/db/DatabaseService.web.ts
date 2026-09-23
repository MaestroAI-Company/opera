import { DeviceEventEmitter } from 'react-native';
import { AppEvents } from '../events';

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

export type Message = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  images?: string[];
  metrics?: MessageMetrics;
  //app context at send time
  screenContext?: { appPackage: string | null; hasScreenText: boolean; icon?: string | null; label?: string | null };
};

export type SyncTombstone = {
  kind: 'conversation' | 'message';
  id: string;
  deletedAt: number;
};

const DB_NAME = 'opera';
const DB_VERSION = 1;
const STORE = 'kv';

type StoreKey = 'conversations' | 'messages' | 'tombstones';

//legacy keys kept for migration
const LEGACY_KEYS: Record<StoreKey, string> = {
  conversations: 'opera_conversations',
  messages: 'opera_messages',
  tombstones: 'opera_tombstones',
};

//indexeddb exceeds localstorage quota
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(db: IDBDatabase, key: StoreKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, entries: [StoreKey, unknown][]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    for (const [key, value] of entries) tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

class DatabaseService {
  private conversations: Conversation[] = [];
  private messages: Message[] = [];
  private tombstones: SyncTombstone[] = [];
  private db: IDBDatabase | null = null;
  //keys waiting to be written
  private dirty = new Set<StoreKey>();
  private flushScheduled = false;
  //serializes writes so batches never overlap
  private writeChain: Promise<void> = Promise.resolve();
  //batch writes count above zero
  private silentDepth = 0;

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

  // init database
  async init(): Promise<void> {
    try {
      this.db = await openDatabase();
      const [convs, msgs, tombs] = await Promise.all([
        idbGet<Conversation[]>(this.db, 'conversations'),
        idbGet<Message[]>(this.db, 'messages'),
        idbGet<SyncTombstone[]>(this.db, 'tombstones'),
      ]);

      if (convs === undefined && msgs === undefined) {
        await this.migrateFromLocalStorage();
        return;
      }

      this.conversations = convs ?? [];
      this.messages = msgs ?? [];
      this.tombstones = tombs ?? [];
    } catch (e) {
      console.error('database init failed', e);
    }
  }

  //migrate data and free quota
  private async migrateFromLocalStorage(): Promise<void> {
    const read = <T>(key: StoreKey): T[] => {
      try {
        const stored = localStorage.getItem(LEGACY_KEYS[key]);
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    };

    this.conversations = read<Conversation>('conversations');
    this.messages = read<Message>('messages');
    this.tombstones = read<SyncTombstone>('tombstones');

    await this.flushNow(['conversations', 'messages', 'tombstones']);
    for (const key of Object.values(LEGACY_KEYS)) localStorage.removeItem(key);
  }

  //write current state for keys
  private async flushNow(keys: StoreKey[]): Promise<void> {
    if (!this.db || keys.length === 0) return;
    const values: Record<StoreKey, unknown> = {
      conversations: this.conversations,
      messages: this.messages,
      tombstones: this.tombstones,
    };
    await idbPut(this.db, keys.map(k => [k, values[k]] as [StoreKey, unknown]));
  }

  //one transaction per batch
  private scheduleSave(key: StoreKey): void {
    this.dirty.add(key);
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    setTimeout(() => {
      this.flushScheduled = false;
      const keys = Array.from(this.dirty);
      this.dirty.clear();
      this.writeChain = this.writeChain
        .then(() => this.flushNow(keys))
        .catch(e => console.error('database write failed', e));
    }, 0);
  }

  //save conversations
  private saveConversations(): void {
    this.scheduleSave('conversations');
  }

  //save messages
  private saveMessages(): void {
    this.scheduleSave('messages');
  }

  //get tombstones
  async getTombstones(): Promise<SyncTombstone[]> {
    return this.tombstones;
  }

  //replace local tombstone registry
  async setTombstones(items: SyncTombstone[]): Promise<void> {
    this.tombstones = items;
    this.scheduleSave('tombstones');
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

  //clear all tombstones
  async clearTombstones(): Promise<void> {
    this.tombstones = [];
    this.scheduleSave('tombstones');
  }

  //check saved data for inconsistencies that can appear after an update or partial import
  async detectDataIssues(): Promise<boolean> {
    const convIds = new Set(this.conversations.map(c => c.id));
    return this.messages.some(m => !convIds.has(m.conversationId));
  }

  // create conversation
  async createConversation(model: string, firstName: string): Promise<Conversation> {
    const now = Date.now();
    const id = `conv_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const conv: Conversation = { id, name: firstName, model, createdAt: now, updatedAt: now, pinned: 0 };
    
    this.conversations.push(conv);
    this.saveConversations();
    this.notifyDataChanged();
    return conv;
  }

  // update conversation name
  async renameConversation(id: string, name: string): Promise<void> {
    this.conversations = this.conversations.map(c => 
      c.id === id ? { ...c, name, updatedAt: Date.now() } : c
    );
    this.saveConversations();
    this.notifyDataChanged();
  }

  // toggle pin status
  async togglePinConversation(id: string, pinned: boolean): Promise<void> {
    this.conversations = this.conversations.map(c => 
      c.id === id ? { ...c, pinned: pinned ? 1 : 0, updatedAt: Date.now() } : c
    );
    this.saveConversations();
    this.notifyDataChanged();
  }

  // get conversations ordered by updated time
  async getConversations(): Promise<Conversation[]> {
    return [...this.conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // search conversations and messages
  async searchConversations(query: string): Promise<Conversation[]> {
    if (!query.trim()) return [];
    
    const lowerQuery = query.toLowerCase();
    
    // find conversation IDs that have matching messages
    const matchingMessageConvIds = new Set(
      this.messages
        .filter(m => m.content.toLowerCase().includes(lowerQuery))
        .map(m => m.conversationId)
    );
    
    // filter conversations
    const filteredConvs = this.conversations.filter(c => 
      c.name.toLowerCase().includes(lowerQuery) || matchingMessageConvIds.has(c.id)
    );
    
    return filteredConvs
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 50);
  }

  // delete conversation and messages
  async deleteConversation(id: string, opts?: { recordTombstone?: boolean }): Promise<void> {
    if (opts?.recordTombstone !== false) {
      await this.recordTombstones([{ kind: 'conversation', id, deletedAt: Date.now() }]);
    }
    this.conversations = this.conversations.filter(c => c.id !== id);
    this.messages = this.messages.filter(m => m.conversationId !== id);
    this.saveConversations();
    this.saveMessages();
    this.notifyDataChanged();
  }

  // delete single message
  async deleteMessage(id: string, opts?: { recordTombstone?: boolean }): Promise<void> {
    if (opts?.recordTombstone !== false) {
      await this.recordTombstones([{ kind: 'message', id, deletedAt: Date.now() }]);
    }
    this.messages = this.messages.filter(m => m.id !== id);
    this.saveMessages();
    this.notifyDataChanged();
  }

  // add message to conversation
  async addMessage(conversationId: string, role: 'user' | 'assistant', content: string, images?: string[], screenContext?: Message['screenContext']): Promise<Message> {
    const now = Date.now();
    const id = `msg_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const msg: Message = { id, conversationId, role, content, createdAt: now, images, screenContext };

    this.messages.push(msg);
    this.conversations = this.conversations.map(c =>
      c.id === conversationId ? { ...c, updatedAt: now } : c
    );

    this.saveConversations();
    this.saveMessages();
    this.notifyDataChanged();
    return msg;
  }

  //patch async screen context
  async updateMessageScreenContext(id: string, screenContext: Message['screenContext']): Promise<void> {
    this.messages = this.messages.map(m => m.id === id ? { ...m, screenContext } : m);
    this.saveMessages();
  }

  // update message content
  async updateMessageContent(id: string, content: string): Promise<void> {
    this.messages = this.messages.map(m => 
      m.id === id ? { ...m, content } : m
    );
    this.saveMessages();
    this.notifyDataChanged();
  }

  //store generation metrics for a message
  async updateMessageMetrics(id: string, metrics: MessageMetrics): Promise<void> {
    this.messages = this.messages.map(m => 
      m.id === id ? { ...m, metrics } : m
    );
    this.saveMessages();
  }

  // get messages for conversation
  async getMessages(conversationId: string): Promise<Message[]> {
    return this.messages
      .filter(m => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  // get all messages for backup
  async getAllMessagesAllConversations(): Promise<Message[]> {
    return this.messages;
  }

  // delete all data
  async deleteAllConversations(): Promise<void> {
    await this.recordTombstones(this.conversations.map(c => ({ kind: 'conversation', id: c.id, deletedAt: Date.now() })));
    this.conversations = [];
    this.messages = [];
    this.saveConversations();
    this.saveMessages();
    this.notifyDataChanged();
  }

  // import backup data
  async importBackup(conversations: Conversation[], messages: Message[], tombstones?: SyncTombstone[]): Promise<void> {
    this.conversations = conversations;
    this.messages = messages;
    this.saveConversations();
    this.saveMessages();
    await this.setTombstones(tombstones ?? []);
    this.notifyDataChanged();
  }

  //replace a conversation and its messages (used by sync merge)
  async replaceConversationWithMessages(conv: Conversation, messages: Message[]): Promise<void> {
    this.conversations = this.conversations.filter(c => c.id !== conv.id);
    this.messages = this.messages.filter(m => m.conversationId !== conv.id);
    this.conversations.push(conv);
    this.messages.push(...messages);
    this.saveConversations();
    this.saveMessages();
    this.notifyDataChanged();
  }
}

// export database instance
export const DB = new DatabaseService();
