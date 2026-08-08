import React from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { CloudUserInfo } from '../../services/cloud/CloudProvider';
import { Colors, Fonts, FontSizes, Radius } from "../../../constants/theme";

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
            <Pressable style={({ pressed, hovered }) => [styles.actionBtn, (pressed || hovered) && { backgroundColor: Colors.surfacePressed }]} onPress={onEnterPin}>
              <Text style={styles.actionBtnText}>Enter PIN</Text>
            </Pressable>
          ) : (
            <Pressable style={({ pressed, hovered }) => [styles.actionBtn, (pressed || hovered) && { backgroundColor: Colors.surfacePressed }]} onPress={onCreatePin}>
              <Text style={styles.actionBtnText}>Create PIN</Text>
            </Pressable>
          )
        ) : (
          <>
            <Pressable style={({ pressed, hovered }) => [styles.actionBtn, styles.syncBtn, (pressed || hovered) && { backgroundColor: Colors.primaryPressed }]} onPress={onSync} disabled={isSyncing}>
              <Text style={[styles.actionBtnText, { color: Colors.surface }]}>
                {isSyncing ? "Syncing..." : "Sync Now"}
              </Text>
            </Pressable>
            <Pressable style={({ pressed, hovered }) => [styles.actionBtnDanger, (pressed || hovered) && { backgroundColor: Colors.dangerBg }]} onPress={onDisconnect}>
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
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.codeBlockText,
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
    borderRadius: Radius.pill,
    marginRight: 12,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Colors.textMuted,
    marginRight: 12,
  },
  userInfoText: {
    flex: 1,
  },
  name: {
    fontSize: FontSizes.md,
    fontFamily: Fonts.mono,
    color: Colors.textSecondary,
  },
  email: {
    fontSize: FontSizes.bodyMd,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
  },
  statusRow: {
    marginBottom: 16,
  },
  statusText: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
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
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  syncBtn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  actionBtnDanger: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.dangerBorderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dangerBgSoft,
  },
  actionBtnText: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.mono,
    color: Colors.textSecondary,
  },
  actionBtnTextDanger: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.mono,
    color: Colors.primaryPressed,
  },
});
