import { useState } from "react";
import { Image, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts, FontSizes, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import { HubDevice, SamplerHub, PairedHub } from "../../services/hub/SamplerHubService";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import NotificationModal from "../ui/NotificationModal";
import TextInputField from "../ui/TextInputField";
import DrawerSheet, { SheetScrollView } from "./DrawerSheet";

const pencilIcon = require("../../../assets/icons/pencil.png");
const binIcon = require("../../../assets/icons/bin.png");
const activateIcon = require("../../../assets/icons/activate.png");
const cancelIcon = require("../../../assets/icons/cancel.png");

const KIND_ICONS = {
  phone: require("../../../assets/icons/phone.png"),
  desktop: require("../../../assets/icons/laptop.png"),
  web: require("../../../assets/icons/website.png"),
  other: require("../../../assets/icons/operaicon.png"),
};

const DESKTOP_CARD_WIDTH = 720;
const KINDS = ["phone", "desktop", "web"] as const;

type HubDeviceSheetProps = {
  device: HubDevice | null;
  hub: PairedHub | null;
  isSelf: boolean;
  //profile the device belongs to
  ownerName: string;
  //admins manage every device
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
  //absent while hosting here
  onUnpairSelf?: () => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
};

//rename, inspect or remove one paired device
export default function HubDeviceSheet({
  device,
  hub,
  isSelf,
  ownerName,
  canManage,
  onClose,
  onChanged,
  onUnpairSelf,
  isLargeScreen = false,
  isDesktop = false,
}: HubDeviceSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const Colors = useColors();
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
    run(() => SamplerHub.renameDevice(hub, device.id, name.trim()));
  };

  const remove = () => {
    setConfirmRemove(false);
    if (!device || !hub) return;
    run(async () => {
      await SamplerHub.removeDevice(hub, device.id);
      onClose();
    });
  };

  const kind = KINDS.find((k) => k === device?.kind) ?? "other";
  const date = (seconds?: number | null) =>
    seconds ? new Date(seconds * 1000).toLocaleDateString() : t("hubDevice.never");
  const rows = device
    ? [
        { label: t("hubDevice.kind"), value: t(`hubDevice.kinds.${kind}`) },
        { label: t("hubDevice.profile"), value: ownerName },
        { label: t("hubDevice.pairedAt"), value: date(device.pairedAt) },
        {
          label: t("hubDevice.lastSeen"),
          value: isSelf ? t("settings.hub.thisDevice") : date(device.lastSeen),
        },
      ]
    : [];
  const hasActions = isSelf ? !!onUnpairSelf : canManage;
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
          maxHeight: windowHeight - insets.top - Spacing.xl2,
        },
      ]}
      desktopStyle={styles.desktopCard}
    >
      <SheetScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* device header */}
        <View style={styles.header}>
          <Text style={styles.headerName} numberOfLines={2}>
            {device?.name}
          </Text>
          <Image source={KIND_ICONS[kind]} style={styles.headerIcon} tintColor={Colors.textPrimary} />
        </View>

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
                icon={activateIcon}
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
        {hasActions && (
          <View style={styles.contentCard}>
            <Group>
              {isSelf ? (
                <ActionButton
                  icon={cancelIcon}
                  label={t("settings.hub.unpair")}
                  disabled={busy}
                  onPress={() => onUnpairSelf?.()}
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
      </SheetScrollView>

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
      paddingTop: Spacing.xxl,
      overflow: "hidden",
    },
    desktopCard: {
      width: DESKTOP_CARD_WIDTH,
    },
    sheetHandleContainer: {
      //floats so top edge matches sides
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      alignItems: "center",
      paddingVertical: Spacing.md,
    },
    content: {
      paddingHorizontal: Spacing.lg2,
      paddingBottom: Spacing.lg,
      gap: Spacing.xxl2,
    },
    contentCard: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.xxl + Spacing.md,
      borderWidth: 0,
      padding: Spacing.md,
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
    header: {
      alignItems: "center",
      gap: Spacing.xl2,
      paddingTop: Spacing.lg2,
    },
    headerName: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.lg,
      color: Colors.textPrimary,
      textAlign: "center",
    },
    headerIcon: {
      width: 96,
      height: 96,
    },
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
