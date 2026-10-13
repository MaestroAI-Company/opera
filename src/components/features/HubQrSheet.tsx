import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import {
  Fonts,
  FontSizes,
  Radius,
  Spacing,
  ThemeColors,
} from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import {
  HubInvite,
  OperaHub,
  PairedHub,
} from "../../services/hub/OperaHubService";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import DrawerSheet from "./DrawerSheet";

const copyIcon = require("../../../assets/icons/copy.png");
const reloadIcon = require("../../../assets/icons/reload.png");

const DESKTOP_CARD_WIDTH = 380;
const COPIED_NOTICE_MS = 2000;

type HubQrSheetProps = {
  visible: boolean;
  onClose: () => void;
  hub: PairedHub | null;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
};

//one time code and qr from the hub
export default function HubQrSheet({
  visible,
  onClose,
  hub,
  isLargeScreen = false,
  isDesktop = false,
}: HubQrSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const colors = useColors();
  const t = useT();
  const [invite, setInvite] = useState<HubInvite | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    if (!hub) return;
    try {
      const fresh = await OperaHub.invite(hub);
      setSvg(
        await OperaHub.qrSvg(fresh.link, colors.textPrimary, colors.surface),
      );
      setInvite(fresh);
      setFailed(false);
    } catch (e) {
      console.warn("[OperaHub] no pairing code:", e);
      setInvite(null);
      setFailed(true);
    }
  }, [hub, colors.textPrimary, colors.surface]);

  //a closed sheet forgets its code
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (!visible) {
      setInvite(null);
      setSvg(null);
    }
  }
  //each opening invalidates the previous code
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- asks the hub for a code
    if (visible) refresh();
  }, [visible, refresh]);

  const copy = async () => {
    if (!invite) return;
    await Clipboard.setStringAsync(invite.code);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_NOTICE_MS);
  };

  return (
    <DrawerSheet
      visible={visible}
      onClose={onClose}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      sheetStyle={[
        styles.sheet,
        { paddingBottom: Platform.OS === "ios" ? 34 : 20 },
      ]}
      desktopStyle={styles.desktopCard}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.contentCard}>
          <Text style={styles.settingLabel}>{t("hubQr.title")}</Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {failed ? t("hubQr.failed") : t("hubQr.help")}
          </Text>
          {invite && svg && (
            <Group style={styles.groupSpacingTight}>
              <View style={styles.qr}>
                <SvgXml xml={svg} width="100%" height="100%" />
              </View>
              <Text style={styles.code} selectable>
                {invite.code}
              </Text>
            </Group>
          )}
          <Group>
            <ActionButton
              icon={copyIcon}
              label={copied ? t("hubQr.copied") : t("hubQr.copy")}
              disabled={!invite}
              onPress={copy}
            />
            <ActionButton
              icon={reloadIcon}
              label={t("hubQr.refresh")}
              onPress={refresh}
            />
          </Group>
        </View>
      </ScrollView>
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
    qr: {
      width: "100%",
      aspectRatio: 1,
      padding: Spacing.xl2,
      paddingBottom: Spacing.md,
    },
    //typed on devices without a camera
    code: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.xxxl,
      color: Colors.textPrimary,
      textAlign: "center",
      letterSpacing: Spacing.xs,
      paddingBottom: Spacing.xl2,
    },
  });
