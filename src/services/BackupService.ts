import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
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

//snapshots written by the app itself
const SNAPSHOT_DIR = `${FileSystem.documentDirectory}backups/`;
const MAX_SNAPSHOTS = 3;

class BackupServiceImpl {
  private async collectBackup(): Promise<BackupFile> {
    return {
      version: 2,
      settings: Settings.getCached(),
      settingsUpdatedAt: await Settings.getSettingsUpdatedAt(),
      conversations: await DB.getConversations(),
      messages: await DB.getAllMessagesAllConversations(),
      tombstones: await DB.getTombstones(),
    };
  }

  //silent safety copy, null on failure
  async saveLocalSnapshot(label: string): Promise<string | null> {
    try {
      const backup = await this.collectBackup();
      const filename = `opera_${label}_${Date.now()}.json`;

      const dir = await FileSystem.getInfoAsync(SNAPSHOT_DIR);
      if (!dir.exists) {
        await FileSystem.makeDirectoryAsync(SNAPSHOT_DIR, { intermediates: true });
      }

      await FileSystem.writeAsStringAsync(`${SNAPSHOT_DIR}${filename}`, JSON.stringify(backup), {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await this.pruneSnapshots();
      return filename;
    } catch (e) {
      console.warn('Could not write a local snapshot', e);
      return null;
    }
  }

  //keep recent full copies only
  private async pruneSnapshots(): Promise<void> {
    const entries = await FileSystem.readDirectoryAsync(SNAPSHOT_DIR);
    const stale = entries.filter(name => name.endsWith('.json')).sort().slice(0, -MAX_SNAPSHOTS);
    for (const name of stale) {
      await FileSystem.deleteAsync(`${SNAPSHOT_DIR}${name}`, { idempotent: true });
    }
  }

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
      
      if (Platform.OS === 'android') {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            filename,
            'application/json'
          );
          await FileSystem.writeAsStringAsync(fileUri, jsonStr, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          return true;
        }
        return false;
      }
      
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, jsonStr, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      //sandbox hides the file from users
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Export Opera data',
        });
      }
      return true;

    } catch (e) {
      console.error('Failed to export data', e);
      throw e;
    }
  }

  //pick a backup file and detect which parts it contains
  async pickAndReadBackup(): Promise<ImportInspection | null> {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const fileUri = result.assets[0].uri;
    const jsonStr = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const backup: BackupFile = JSON.parse(jsonStr);
    return {
      backup,
      hasSettings: !!backup.settings,
      hasConversations: !!(backup.conversations && backup.messages),
    };
  }

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

      //restore settings
      if (hasSettings && backup.settings) {
        await Settings.setMany(backup.settings);
      }

      //restore conversations and messages
      if (hasConversations && backup.conversations && backup.messages) {
        await DB.importBackup(backup.conversations, backup.messages, backup.tombstones ?? []);
      }

      return { success: true, warning };
    } catch (e) {
      console.error('Failed to import data', e);
      throw e;
    }
  }

  async deleteAllConversations(): Promise<void> {
    try {
      await DB.deleteAllConversations();
    } catch (e) {
      console.error('Failed to delete all conversations', e);
      throw e;
    }
  }
}

export const BackupService = new BackupServiceImpl();
