import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
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
  LinkJoining,
  SamplerHub,
  PairedHub,
} from "../../services/hub/SamplerHubService";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import DrawerSheet, { SheetScrollView } from "./DrawerSheet";

const copyIcon = require("../../../assets/icons/copy2.png");
const reloadIcon = require("../../../assets/icons/reconnect.png");
const cancelIcon = require("../../../assets/icons/cancel.png");
const keyIcon = require("../../../assets/icons/key.png");

const DESKTOP_CARD_WIDTH = 380;
const COPIED_NOTICE_MS = 2000;

type HubQrSheetProps = {
  visible: boolean;
  onClose: () => void;
  hub: PairedHub | null;
  //link adds a device of this profile, invite anyone
  mode?: "invite" | "link";
  isLargeScreen?: boolean;
  isDesktop?: boolean;
};

//one time code and qr from the hub
export default function HubQrSheet({
  visible,
  onClose,
  hub,
  mode = "invite",
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
  //a device typed the link code
  const [joining, setJoining] = useState<LinkJoining | null>(null);
  const [answering, setAnswering] = useState(false);

  const refresh = useCallback(async () => {
    if (!hub) return;
    try {
      setJoining(null);
      const fresh =
        mode === "link"
          ? await SamplerHub.linkStart(hub)
          : await SamplerHub.invite(hub);
      setSvg(
        await SamplerHub.qrSvg(fresh.link, colors.textPrimary, colors.surface),
      );
      setInvite(fresh);
      setFailed(false);
    } catch (e) {
      console.warn("[SamplerHub] no pairing code:", e);
      setInvite(null);
      setFailed(true);
    }
  }, [hub, mode, colors.textPrimary, colors.surface]);

  //a closed sheet forgets its code
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (!visible) {
      setInvite(null);
      setSvg(null);
      setJoining(null);
    }
  }
  //each opening invalidates the previous code
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- asks the hub for a code
    if (visible) refresh();
  }, [visible, refresh]);

  //waits for the device that types the link code
  useEffect(() => {
    if (!visible || !hub || mode !== "link" || !invite || joining) return;
    let stopped = false;
    (async () => {
      while (!stopped) {
        try {
          const found = await SamplerHub.linkWatch(hub);
          if (found && !stopped) return setJoining(found);
        } catch (e) {
          console.warn("[SamplerHub] link watch failed:", e);
          if (!stopped) setFailed(true);
          return;
        }
      }
    })();
    return () => {
      stopped = true;
    };
  }, [visible, hub, mode, invite, joining]);

  const answer = async (approve: boolean) => {
    if (!hub || answering) return;
    setAnswering(true);
    try {
      if (approve) await SamplerHub.linkApprove(hub);
      else await SamplerHub.linkDeny(hub);
      onClose();
    } catch (e) {
      console.warn("[SamplerHub] link answer failed:", e);
      setFailed(true);
    } finally {
      setAnswering(false);
    }
  };

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
      <SheetScrollView contentContainerStyle={styles.content}>
        {joining ? (
          //the user compares the digits on both screens
          <View style={styles.contentCard}>
            <Text style={styles.settingLabel}>
              {t("hubQr.joiningTitle", { device: joining.device })}
            </Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {failed ? t("hubQr.failed") : t("hubQr.joiningHelp")}
            </Text>
            <Group style={styles.groupSpacingTight}>
              <Text style={[styles.code, styles.digits]}>{joining.digits}</Text>
            </Group>
            <Group style={styles.groupSpacingTight}>
              <ActionButton
                icon={cancelIcon}
                label={t("hubQr.deny")}
                disabled={answering}
                onPress={() => answer(false)}
              />
            </Group>
            <Group
              style={[
                styles.highlightGroup,
                answering && styles.highlightGroupDisabled,
              ]}
            >
              <ActionButton
                icon={keyIcon}
                label={t("hubQr.confirm")}
                variant="highlight"
                disabled={answering}
                onPress={() => answer(true)}
              />
            </Group>
          </View>
        ) : (
          <View style={styles.contentCard}>
            <Text style={styles.settingLabel}>
              {mode === "link" ? t("hubQr.linkTitle") : t("hubQr.title")}
            </Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {failed
                ? t("hubQr.failed")
                : mode === "link"
                  ? t("hubQr.linkHelp")
                  : t("hubQr.help")}
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
        )}
      </SheetScrollView>
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
    //no qr above the digits
    digits: {
      paddingTop: Spacing.xl2,
    },
    highlightGroup: {
      backgroundColor: Colors.primary,
      borderColor: Colors.borderOnPrimary,
    },
    highlightGroupDisabled: {
      opacity: 0.5,
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
