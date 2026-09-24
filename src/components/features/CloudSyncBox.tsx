import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import { CloudUserInfo } from '../../services/cloud/CloudProvider';
import { pressStyle } from "../ui/pressStyle";

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
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const t = useT();
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
          {locked ? t("cloudSync.setupIncomplete") : lastSyncTime ? t("cloudSync.lastSynced", { date: new Date(lastSyncTime).toLocaleString() }) : t("cloudSync.ready")}
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
            <Pressable style={pressStyle(styles.actionBtn, "surface")} onPress={onEnterPin}>
              <Text style={styles.actionBtnText}>{t("cloudSync.enterPin")}</Text>
            </Pressable>
          ) : (
            <Pressable style={pressStyle(styles.actionBtn, "surface")} onPress={onCreatePin}>
              <Text style={styles.actionBtnText}>{t("cloudSync.createPin")}</Text>
            </Pressable>
          )
        ) : (
          <>
            <Pressable style={pressStyle(styles.actionBtn, "surface")} onPress={onDisconnect}>
              <Text style={styles.actionBtnText}>{t("cloudSync.disconnect")}</Text>
            </Pressable>
            <Pressable style={pressStyle([styles.actionBtn, styles.syncBtn], "primary")} onPress={onSync} disabled={isSyncing}>
              <Text style={[styles.actionBtnText, { color: Colors.textOnPrimary }]}>
                {isSyncing ? t("cloudSync.syncing") : t("cloudSync.syncNow")}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    padding: Spacing.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    marginTop: Spacing.lg2,
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    marginRight: Spacing.lg2,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    backgroundColor: Colors.textMuted,
    marginRight: Spacing.lg2,
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
    marginBottom: Spacing.lg2,
  },
  statusText: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.body,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  actionsRow: {
    flexDirection: 'column',
    gap: Spacing.md,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg2,
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  syncBtn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.borderOnPrimary,
  },
  actionBtnText: {
    fontSize: FontSizes.bodyMd,
    fontFamily: Fonts.mono,
    color: Colors.textSecondary,
  },
});
