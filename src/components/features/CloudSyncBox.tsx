import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { CloudUserInfo } from '../../services/cloud/CloudProvider';

type CloudSyncBoxProps = {
  userInfo: CloudUserInfo | null;
  status: "locked" | "ready";
  hasBackup: boolean;
  lastSyncTime?: number | null;
  lastSyncSize?: number | null;
  onEnterPin: () => void;
  onCreatePin: () => void;
  onDisconnect: () => void;
  onSync: () => void;
  isSyncing: boolean;
};

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export default function CloudSyncBox({
  userInfo,
  status,
  hasBackup,
  lastSyncTime,
  lastSyncSize,
  onEnterPin,
  onCreatePin,
  onDisconnect,
  onSync,
  isSyncing,
}: CloudSyncBoxProps) {
  if (!userInfo) return null;

  const locked = status === "locked";

  return (
    <View style={styles.container}>
      <View style={styles.userInfoRow}>
        {userInfo.picture ? (
          <Image source={{ uri: userInfo.picture }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder} />
        )}
        <View style={styles.userInfoText}>
          {userInfo.name && <Text style={styles.name}>{userInfo.name}</Text>}
          <Text style={styles.email}>{userInfo.email}</Text>
        </View>
      </View>

      <View style={styles.statusRow}>
        <Text style={styles.statusText}>
          {locked ? "Setup not finished" : lastSyncTime ? `Last synced: ${new Date(lastSyncTime).toLocaleString()}` : "Ready to sync"}
        </Text>
        {!locked && lastSyncTime && lastSyncSize != null && (
          <Text style={styles.statusText}>
            Backup size: {formatSize(lastSyncSize)}
          </Text>
        )}
      </View>

      <View style={styles.actionsRow}>
        {locked ? (
          hasBackup ? (
            <Pressable style={styles.actionBtn} onPress={onEnterPin}>
              <Text style={styles.actionBtnText}>Enter PIN</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.actionBtn} onPress={onCreatePin}>
              <Text style={styles.actionBtnText}>Create PIN</Text>
            </Pressable>
          )
        ) : (
          <>
            <Pressable style={[styles.actionBtn, styles.syncBtn]} onPress={onSync} disabled={isSyncing}>
              <Text style={[styles.actionBtnText, { color: "#fff" }]}>
                {isSyncing ? "Syncing..." : "Sync Now"}
              </Text>
            </Pressable>
            <Pressable style={styles.actionBtnDanger} onPress={onDisconnect}>
              <Text style={styles.actionBtnTextDanger}>Disconnect</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginTop: 12,
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ccc',
    marginRight: 12,
  },
  userInfoText: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontFamily: 'IBMPlexMono-Medium',
    color: '#222',
  },
  email: {
    fontSize: 14,
    fontFamily: 'Jakarta',
    color: '#666',
  },
  statusRow: {
    marginBottom: 16,
  },
  statusText: {
    fontSize: 12,
    fontFamily: 'Jakarta',
    color: '#444',
    fontStyle: 'italic',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  syncBtn: {
    backgroundColor: '#FF1A1A',
    borderColor: '#FF1A1A',
  },
  actionBtnDanger: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ffcccc',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff5f5',
  },
  actionBtnText: {
    fontSize: 12,
    fontFamily: 'IBMPlexMono-Medium',
    color: '#222',
  },
  actionBtnTextDanger: {
    fontSize: 12,
    fontFamily: 'IBMPlexMono-Medium',
    color: '#d60e0e',
  },
});
