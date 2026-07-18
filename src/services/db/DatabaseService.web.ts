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

  // create conversation
  async createConversation(model: string, firstName: string): Promise<Conversation> {
    const now = Date.now();
    const id = `conv_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const conv: Conversation = { id, name: firstName, model, createdAt: now, updatedAt: now, pinned: 0 };
    
    this.conversations.push(conv);
    this.saveConversations();
    return conv;
  }

  // update conversation name
  async renameConversation(id: string, name: string): Promise<void> {
    this.conversations = this.conversations.map(c => 
      c.id === id ? { ...c, name, updatedAt: Date.now() } : c
    );
    this.saveConversations();
  }

  // toggle pin status
  async togglePinConversation(id: string, pinned: boolean): Promise<void> {
    this.conversations = this.conversations.map(c => 
      c.id === id ? { ...c, pinned: pinned ? 1 : 0 } : c
    );
    this.saveConversations();
  }

  // get conversations ordered by updated time
  async getConversations(): Promise<Conversation[]> {
    return [...this.conversations].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // delete conversation and messages
  async deleteConversation(id: string): Promise<void> {
    this.conversations = this.conversations.filter(c => c.id !== id);
    this.messages = this.messages.filter(m => m.conversationId !== id);
    this.saveConversations();
    this.saveMessages();
  }

  // delete single message
  async deleteMessage(id: string): Promise<void> {
    this.messages = this.messages.filter(m => m.id !== id);
    this.saveMessages();
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
    return msg;
  }

  // update message content
  async updateMessageContent(id: string, content: string): Promise<void> {
    this.messages = this.messages.map(m => 
      m.id === id ? { ...m, content } : m
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
    this.conversations = [];
    this.messages = [];
    this.saveConversations();
    this.saveMessages();
  }

  // import backup data
  async importBackup(conversations: Conversation[], messages: Message[]): Promise<void> {
    this.conversations = conversations;
    this.messages = messages;
    this.saveConversations();
    this.saveMessages();
  }
}

// export database instance
export const DB = new DatabaseService();
