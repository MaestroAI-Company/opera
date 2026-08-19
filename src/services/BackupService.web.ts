import { DB, Conversation, Message, SyncTombstone } from './db/DatabaseService';
import { Settings, AppSettings } from './settings/SettingsService';

export type BackupData = {
  version: number;
  settings: AppSettings;
  settingsUpdatedAt?: number;
  conversations: Conversation[];
  messages: Message[];
  tombstones?: SyncTombstone[];
};

//backup file may contain only selected parts
export type BackupFile = {
  version: number;
  settings?: AppSettings;
  settingsUpdatedAt?: number;
  conversations?: Conversation[];
  messages?: Message[];
  tombstones?: SyncTombstone[];
};

export type BackupScope = {
  includeSettings: boolean;
  includeConversations: boolean;
};

export type ImportResult = {
  success: boolean;
  warning?: string;
};

export type ImportInspection = {
  backup: BackupFile;
  hasSettings: boolean;
  hasConversations: boolean;
};

class BackupServiceImpl {
  // export data to json file download
  async exportData(scope?: BackupScope): Promise<boolean> {
    try {
      const includeSettings = scope?.includeSettings ?? true;
      const includeConversations = scope?.includeConversations ?? true;

      const backup: BackupFile = { version: 2 };

      if (includeSettings) {
        backup.settings = Settings.getCached();
        backup.settingsUpdatedAt = await Settings.getSettingsUpdatedAt();
      }

      if (includeConversations) {
        backup.conversations = await DB.getConversations();
        backup.messages = await DB.getAllMessagesAllConversations();
        backup.tombstones = await DB.getTombstones();
      }

      const jsonStr = JSON.stringify(backup, null, 2);
      const filename = `opera_backup_${Date.now()}.json`;

      // trigger browser download
      const blob = new Blob([jsonStr], { type: 'application/json' });

      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
            types: [{
              description: 'JSON Backup',
              accept: { 'application/json': ['.json'] },
            }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return true;
        } catch (err: any) {
          if (err.name === 'AbortError') {
            return false; // user cancelled
          }
          console.error('showSaveFilePicker error, falling back to basic download', err);
        }
      }

      // fallback
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    } catch (e) {
      console.error('failed to export data', e);
      throw e;
    }
  }

  // pick a backup file and detect which parts it contains
  async pickAndReadBackup(): Promise<ImportInspection | null> {
    return new Promise<ImportInspection | null>((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (event: any) => {
        const file = event.target.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        try {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const jsonStr = e.target?.result as string;
              const backup: BackupFile = JSON.parse(jsonStr);
              resolve({
                backup,
                hasSettings: !!backup.settings,
                hasConversations: !!(backup.conversations && backup.messages),
              });
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
  }

  // import data from local json file
  async importData(backup?: BackupFile): Promise<ImportResult> {
    try {
      if (!backup) {
        const inspection = await this.pickAndReadBackup();
        if (!inspection) {
          return { success: false };
        }
        backup = inspection.backup;
      }

      const hasSettings = !!backup.settings;
      const hasConversations = !!(backup.conversations && backup.messages);

      if (!hasSettings && !hasConversations) {
        throw new Error('Backup file contains no valid data');
      }

      //check internal consistency of imported json (warn but still import)
      let warning: string | undefined;
      if (hasConversations && backup.conversations && backup.messages) {
        const convIds = new Set(backup.conversations.map(c => c.id));
        const orphans = backup.messages.filter(m => !convIds.has(m.conversationId));
        if (orphans.length > 0) {
          warning = `Data imported, but the backup file is inconsistent: ${orphans.length} message(s) reference a missing conversation.`;
        }
      }

      // restore settings
      if (hasSettings && backup.settings) {
        await Settings.setMany(backup.settings);
      }

      // restore database
      if (hasConversations && backup.conversations && backup.messages) {
        await DB.importBackup(backup.conversations, backup.messages, backup.tombstones ?? []);
      }

      return { success: true, warning };
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
