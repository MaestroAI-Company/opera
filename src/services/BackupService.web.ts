import { DB, Conversation, Message } from './db/DatabaseService';
import { Settings, AppSettings } from './settings/SettingsService';

export type BackupData = {
  version: number;
  settings: AppSettings;
  conversations: Conversation[];
  messages: Message[];
};

class BackupServiceImpl {
  // export data to json file download
  async exportData(): Promise<void> {
    try {
      const settings = Settings.getCached();
      const conversations = await DB.getConversations();
      const messages = await DB.getAllMessagesAllConversations();

      const backup: BackupData = {
        version: 1,
        settings,
        conversations,
        messages,
      };

      const jsonStr = JSON.stringify(backup, null, 2);
      const filename = `opera_backup_${Date.now()}.json`;

      // trigger browser download
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('failed to export data', e);
      throw e;
    }
  }

  // import data from local json file
  async importData(): Promise<boolean> {
    try {
      return new Promise<boolean>((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (event: any) => {
          const file = event.target.files?.[0];
          if (!file) {
            resolve(false);
            return;
          }
          try {
            const reader = new FileReader();
            reader.onload = async (e) => {
              try {
                const jsonStr = e.target?.result as string;
                const backup: BackupData = JSON.parse(jsonStr);

                if (!backup.settings || !backup.conversations || !backup.messages) {
                  throw new Error('invalid backup file format');
                }

                // restore settings
                await Settings.setMany(backup.settings);

                // restore database
                await DB.importBackup(backup.conversations, backup.messages);
                
                resolve(true);
              } catch (err) {
                reject(err);
              }
            };
            reader.readAsText(file);
          } catch (err) {
            reject(err);
          }
        };
        input.click();
      });
    } catch (e) {
      console.error('failed to import data', e);
      throw e;
    }
  }

  // delete all conversations
  async deleteAllConversations(): Promise<void> {
    try {
      await DB.deleteAllConversations();
    } catch (e) {
      console.error('failed to delete conversations', e);
      throw e;
    }
  }
}

// export backup service instance
export const BackupService = new BackupServiceImpl();
