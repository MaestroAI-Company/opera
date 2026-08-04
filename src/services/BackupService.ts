import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
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

class BackupServiceImpl {
  async exportData(): Promise<boolean> {
    try {
      const settings = Settings.getCached();
      const conversations = await DB.getConversations();
      const messages = await DB.getAllMessagesAllConversations();
      const tombstones = await DB.getTombstones();

      const backup: BackupData = {
        version: 2,
        settings,
        settingsUpdatedAt: await Settings.getSettingsUpdatedAt(),
        conversations,
        messages,
        tombstones,
      };

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
      return true;

    } catch (e) {
      console.error('Failed to export data', e);
      throw e;
    }
  }

  async importData(): Promise<boolean> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return false;
      }

      const fileUri = result.assets[0].uri;
      const jsonStr = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const backup: BackupData = JSON.parse(jsonStr);

      if (!backup.settings || !backup.conversations || !backup.messages) {
        throw new Error('Invalid backup file format');
      }

      //restore settings
      await Settings.setMany(backup.settings);

      //restore conversations and messages
      await DB.importBackup(backup.conversations, backup.messages, backup.tombstones ?? []);
      
      return true;
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
