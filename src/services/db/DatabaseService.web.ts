import { DeviceEventEmitter } from 'react-native';

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
};

export type Message = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  images?: string[];
  metrics?: MessageMetrics;
};

export type SyncTombstone = {
  kind: 'conversation' | 'message';
  id: string;
  deletedAt: number;
};

class DatabaseService {
  private conversations: Conversation[] = [];
  private messages: Message[] = [];

  // init database
  async init(): Promise<void> {
    try {
      const storedConvs = localStorage.getItem('opera_conversations');
      const storedMsgs = localStorage.getItem('opera_messages');
      
      this.conversations = storedConvs ? JSON.parse(storedConvs) : [];
      this.messages = storedMsgs ? JSON.parse(storedMsgs) : [];
    } catch (e) {
      console.error('database init failed', e);
    }
  }

  // save conversations to localstorage
  private saveConversations(): void {
    localStorage.setItem('opera_conversations', JSON.stringify(this.conversations));
  }

  // save messages to localstorage
  private saveMessages(): void {
    localStorage.setItem('opera_messages', JSON.stringify(this.messages));
  }

  //get tombstones from localstorage
  async getTombstones(): Promise<SyncTombstone[]> {
    try {
      const stored = localStorage.getItem('opera_tombstones');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  }

  //replace local tombstone registry
  async setTombstones(items: SyncTombstone[]): Promise<void> {
    localStorage.setItem('opera_tombstones', JSON.stringify(items));
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
    localStorage.removeItem('opera_tombstones');
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
    DeviceEventEmitter.emit('DATA_CHANGED');
    return conv;
  }

  // update conversation name
  async renameConversation(id: string, name: string): Promise<void> {
    this.conversations = this.conversations.map(c => 
      c.id === id ? { ...c, name, updatedAt: Date.now() } : c
    );
    this.saveConversations();
    DeviceEventEmitter.emit('DATA_CHANGED');
  }

  // toggle pin status
  async togglePinConversation(id: string, pinned: boolean): Promise<void> {
    this.conversations = this.conversations.map(c => 
      c.id === id ? { ...c, pinned: pinned ? 1 : 0, updatedAt: Date.now() } : c
    );
    this.saveConversations();
    DeviceEventEmitter.emit('DATA_CHANGED');
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
    DeviceEventEmitter.emit('DATA_CHANGED');
  }

  // delete single message
  async deleteMessage(id: string, opts?: { recordTombstone?: boolean }): Promise<void> {
    if (opts?.recordTombstone !== false) {
      await this.recordTombstones([{ kind: 'message', id, deletedAt: Date.now() }]);
    }
    this.messages = this.messages.filter(m => m.id !== id);
    this.saveMessages();
    DeviceEventEmitter.emit('DATA_CHANGED');
  }

  // add message to conversation
  async addMessage(conversationId: string, role: 'user' | 'assistant', content: string, images?: string[]): Promise<Message> {
    const now = Date.now();
    const id = `msg_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const msg: Message = { id, conversationId, role, content, createdAt: now, images };
    
    this.messages.push(msg);
    this.conversations = this.conversations.map(c => 
      c.id === conversationId ? { ...c, updatedAt: now } : c
    );
    
    this.saveConversations();
    this.saveMessages();
    DeviceEventEmitter.emit('DATA_CHANGED');
    return msg;
  }

  // update message content
  async updateMessageContent(id: string, content: string): Promise<void> {
    this.messages = this.messages.map(m => 
      m.id === id ? { ...m, content } : m
    );
    this.saveMessages();
    DeviceEventEmitter.emit('DATA_CHANGED');
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
    DeviceEventEmitter.emit('DATA_CHANGED');
  }

  // import backup data
  async importBackup(conversations: Conversation[], messages: Message[], tombstones?: SyncTombstone[]): Promise<void> {
    this.conversations = conversations;
    this.messages = messages;
    this.saveConversations();
    this.saveMessages();
    await this.setTombstones(tombstones ?? []);
    DeviceEventEmitter.emit('DATA_CHANGED');
  }

  //replace a conversation and its messages (used by sync merge)
  async replaceConversationWithMessages(conv: Conversation, messages: Message[]): Promise<void> {
    this.conversations = this.conversations.filter(c => c.id !== conv.id);
    this.messages = this.messages.filter(m => m.conversationId !== conv.id);
    this.conversations.push(conv);
    this.messages.push(...messages);
    this.saveConversations();
    this.saveMessages();
    DeviceEventEmitter.emit('DATA_CHANGED');
  }
}

// export database instance
export const DB = new DatabaseService();
