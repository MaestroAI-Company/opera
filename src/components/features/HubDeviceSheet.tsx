import { useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts, FontSizes, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import { HubDevice, OperaHub, PairedHub } from "../../services/hub/OperaHubService";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import NotificationModal from "../ui/NotificationModal";
import TextInputField from "../ui/TextInputField";
import DrawerSheet from "./DrawerSheet";

const pencilIcon = require("../../../assets/icons/pencil.png");
const binIcon = require("../../../assets/icons/bin.png");
const cancelIcon = require("../../../assets/icons/cancel.png");

const DESKTOP_CARD_WIDTH = 380;
const KINDS = ["phone", "desktop", "web"] as const;

type HubDeviceSheetProps = {
  device: HubDevice | null;
  hub: PairedHub | null;
  isSelf: boolean;
  //admins manage every device
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
  onUnpairSelf: () => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
};

//rename, inspect or remove one paired device
export default function HubDeviceSheet({
  device,
  hub,
  isSelf,
  canManage,
  onClose,
  onChanged,
  onUnpairSelf,
  isLargeScreen = false,
  isDesktop = false,
}: HubDeviceSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  //a newly opened device starts from its own name
  const [prevDevice, setPrevDevice] = useState(device);
  if (device !== prevDevice) {
    setPrevDevice(device);
    setName(device?.name ?? "");
    setError(null);
  }

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(t("hubDevice.failed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const rename = () => {
    if (!device || !hub || !name.trim()) return;
    run(() => OperaHub.renameDevice(hub, device.id, name.trim()));
  };

  const remove = () => {
    setConfirmRemove(false);
    if (!device || !hub) return;
    run(async () => {
      await OperaHub.removeDevice(hub, device.id);
      onClose();
    });
  };

  const kind = KINDS.find((k) => k === device?.kind) ?? "other";
  const date = (seconds?: number | null) =>
    seconds ? new Date(seconds * 1000).toLocaleDateString() : t("hubDevice.never");
  const rows = device
    ? [
        { label: t("hubDevice.kind"), value: t(`hubDevice.kinds.${kind}`) },
        { label: t("hubDevice.pairedAt"), value: date(device.pairedAt) },
        {
          label: t("hubDevice.lastSeen"),
          value: isSelf ? t("settings.hub.thisDevice") : date(device.lastSeen),
        },
      ]
    : [];
  const unchanged = !device || !name.trim() || name.trim() === device.name;

  return (
    <DrawerSheet
      visible={!!device}
      onClose={onClose}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      avoidKeyboard
      sheetStyle={[
        styles.sheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: windowHeight - insets.top - Spacing.xl2,
        },
      ]}
      desktopStyle={styles.desktopCard}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* name */}
        <View style={styles.contentCard}>
          <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
            <Text style={styles.settingLabel}>{t("hubDevice.name")}</Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {error ?? t("hubDevice.nameHelp")}
            </Text>
            <Group style={styles.groupSpacingTight}>
              <TextInputField
                icon={pencilIcon}
                value={name}
                onChangeText={setName}
                onSubmitEditing={rename}
                maxLength={64}
              />
            </Group>
            <Group style={[styles.highlightGroup, (busy || unchanged) && styles.highlightGroupDisabled]}>
              <ActionButton
                icon={pencilIcon}
                label={t("hubDevice.rename")}
                variant="highlight"
                disabled={busy || unchanged}
                onPress={rename}
              />
            </Group>
          </View>
        </View>

        {/* details */}
        <View style={styles.contentCard}>
          <Group style={styles.infoGroup}>
            {rows.map((row) => (
              <ActionButton
                key={row.label}
                label={row.label}
                rightElement={
                  <Text style={styles.infoValue} numberOfLines={1}>
                    {row.value}
                  </Text>
                }
              />
            ))}
          </Group>
        </View>

        {/* actions section */}
        {(isSelf || canManage) && (
          <View style={[styles.contentCard, { marginBottom: 0 }]}>
            <Group>
              {isSelf ? (
                <ActionButton
                  icon={cancelIcon}
                  label={t("settings.hub.unpair")}
                  disabled={busy}
                  onPress={onUnpairSelf}
                />
              ) : (
                <ActionButton
                  icon={binIcon}
                  label={t("hubDevice.remove")}
                  disabled={busy}
                  onPress={() => setConfirmRemove(true)}
                />
              )}
            </Group>
          </View>
        )}
      </ScrollView>

      <NotificationModal
        visible={confirmRemove}
        title={t("hubDevice.removeTitle", { name: device?.name ?? "" })}
        message={t("hubDevice.removeMessage")}
        onClose={() => setConfirmRemove(false)}
        buttons={[
          {
            text: t("common.cancel"),
            style: "secondary",
            onPress: () => setConfirmRemove(false),
          },
          { text: t("hubDevice.remove"), style: "danger", onPress: remove },
        ]}
      />
    </DrawerSheet>
  );
}

//same values as settings drawer pages
const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    sheet: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: Colors.groupedBackground,
      borderTopLeftRadius: Radius.huge2,
      borderTopRightRadius: Radius.huge2,
      paddingTop: Spacing.lg2,
    },
    desktopCard: {
      width: DESKTOP_CARD_WIDTH,
    },
    sheetHandleContainer: {
      alignItems: "center",
      marginBottom: Spacing.xs2,
      paddingVertical: Spacing.lg,
      marginTop: -Spacing.lg,
    },
    content: {
      paddingHorizontal: Spacing.lg2,
      paddingBottom: Spacing.lg,
    },
    contentCard: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.xxl + Spacing.md,
      borderWidth: 0,
      padding: Spacing.md,
      marginBottom: Spacing.xxl2,
    },
    settingRowVertical: {
      marginBottom: Spacing.xxl,
    },
    settingLabel: {
      fontSize: FontSizes.body,
      color: Colors.textPrimary,
      fontFamily: Fonts.mono,
      paddingTop: Spacing.xs,
      paddingHorizontal: Spacing.md,
    },
    helpText: {
      fontSize: FontSizes.bodyMd,
      color: Colors.textMuted,
      fontFamily: Fonts.body,
      marginTop: Spacing.xs,
      lineHeight: 20,
      paddingHorizontal: Spacing.md,
    },
    groupSpacingTight: {
      marginBottom: Spacing.lg2,
    },
    highlightGroup: {
      backgroundColor: Colors.primary,
      borderColor: Colors.borderOnPrimary,
    },
    highlightGroupDisabled: {
      opacity: 0.5,
    },
    //static rows on the white card
    infoGroup: {
      borderWidth: 0,
    },
    infoValue: {
      flexShrink: 1,
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
      color: Colors.textMuted,
      textAlign: "right",
      maxWidth: "60%",
    },
  });
