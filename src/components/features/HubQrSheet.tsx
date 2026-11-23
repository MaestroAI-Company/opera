import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
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

import copyIcon from "../../../assets/icons/copy2.svg";
import cancelIcon from "../../../assets/icons/cancel2.svg";
import checkIcon from "../../../assets/icons/check2.svg";
import reloadIcon from "../../../assets/icons/reload2.svg";

const DESKTOP_CARD_WIDTH = 720;
const HORIZONTAL_QR_WIDTH = 300;
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
      ]}
      desktopStyle={styles.desktopCard}
    >
      <SheetScrollView contentContainerStyle={styles.content}>
        <HubQrContent
          active={visible}
          onClose={onClose}
          hub={hub}
          mode={mode}
          horizontal={isLargeScreen || isDesktop}
        />
      </SheetScrollView>
    </DrawerSheet>
  );
}

type HubQrContentProps = {
  active: boolean;
  onClose: () => void;
  hub: PairedHub | null;
  mode: "invite" | "link";
  //host page explains the code
  bare?: boolean;
  //qr left and buttons right
  horizontal?: boolean;
};

//code card for sheet or page
export function HubQrContent({
  active,
  onClose,
  hub,
  mode,
  bare = false,
  horizontal = false,
}: HubQrContentProps) {
  const styles = useThemedStyles(makeStyles);
  const colors = useColors();
  const t = useT();
  const [invite, setInvite] = useState<HubInvite | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  //a device typed the link code
  const [joining, setJoining] = useState<LinkJoining | null>(null);
  const [answering, setAnswering] = useState(false);

  //a new hub object keeps the code
  const hubRef = useRef(hub);
  const colorsRef = useRef(colors);
  useEffect(() => {
    hubRef.current = hub;
    colorsRef.current = colors;
  });
  const hasHub = !!hub;

  const refresh = useCallback(async () => {
    const hub = hubRef.current;
    const colors = colorsRef.current;
    if (!hub) return;
    setLoading(true);
    //a stale code never shows while reloading
    setInvite(null);
    setSvg(null);
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
    } finally {
      setLoading(false);
    }
  }, [mode]);

  //a closed sheet forgets its code
  const [prevVisible, setPrevVisible] = useState(active);
  if (active !== prevVisible) {
    setPrevVisible(active);
    if (!active) {
      setInvite(null);
      setSvg(null);
      setJoining(null);
      setFailed(false);
      setLoading(false);
    }
  }
  //each opening invalidates the previous code
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- asks the hub for a code
    if (active) refresh();
  }, [active, refresh]);

  //waits for the device that types the link code
  useEffect(() => {
    if (!active || !hasHub || mode !== "link" || !invite || joining) return;
    let stopped = false;
    (async () => {
      while (!stopped) {
        const hub = hubRef.current;
        if (!hub) return;
        try {
          const found = await SamplerHub.linkWatch(hub);
          if (found && !stopped) {
            //the code is spent
            setInvite(null);
            setSvg(null);
            return setJoining(found);
          }
        } catch (e) {
          console.warn("[SamplerHub] link watch failed:", e);
          //only a dead code is permanent
          const msg = String((e as Error)?.message ?? e).toLowerCase();
          if (msg.includes("expired") || msg.includes("no link in progress")) {
            if (!stopped) setFailed(true);
            return;
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    })();
    return () => {
      stopped = true;
    };
  }, [active, hasHub, mode, invite, joining]);

  //closes once another device used the invite
  useEffect(() => {
    if (!active || !hasHub || mode !== "invite" || !invite) return;
    let stopped = false;
    (async () => {
      while (!stopped) {
        const hub = hubRef.current;
        if (!hub) return;
        try {
          if (await SamplerHub.inviteWatch(hub)) {
            if (stopped) return;
            //the code is spent
            setInvite(null);
            setSvg(null);
            return onClose();
          }
        } catch (e) {
          console.warn("[SamplerHub] invite watch failed:", e);
          const msg = String((e as Error)?.message ?? e).toLowerCase();
          if (msg.includes("expired") || msg.includes("no invite in progress")) return;
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    })();
    return () => {
      stopped = true;
    };
  }, [active, hasHub, mode, invite, onClose]);

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

  const heading = (
    <>
      {!bare && (
        <Text style={styles.settingLabel}>
          {mode === "link" ? t("hubQr.linkTitle") : t("hubQr.title")}
        </Text>
      )}
      {(!bare || failed) && (
        <Text style={[styles.helpText, !horizontal && { marginBottom: Spacing.md }]}>
          {failed
            ? t("hubQr.failed")
            : mode === "link"
              ? t("hubQr.linkHelp")
              : t("hubQr.help")}
        </Text>
      )}
    </>
  );

  //no frame beside the text, the qr sits on the card
  const qrBlock = horizontal ? (
    <View style={[styles.rowQr, styles.qrFlat, loading && styles.qrLoading]}>
      {loading ? (
        <ActivityIndicator color={colors.textMuted} />
      ) : (
        invite && svg && <SvgXml xml={svg} width="100%" height="100%" />
      )}
    </View>
  ) : loading ? (
    <Group style={styles.groupSpacingTight}>
      <View style={[styles.qr, styles.qrLoading]}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    </Group>
  ) : (
    invite &&
    svg && (
      <Group style={styles.groupSpacingTight}>
        <View style={styles.qr}>
          <SvgXml xml={svg} width="100%" height="100%" />
        </View>
        <Text style={styles.code} selectable>
          {invite.code}
        </Text>
      </Group>
    )
  );

  const buttons = (
    <Group>
      <ActionButton
        icon={copyIcon}
        label={copied ? t("hubQr.copied") : t("hubQr.copy")}
        disabled={!invite || loading}
        onPress={copy}
      />
      <ActionButton
        icon={reloadIcon}
        label={t("hubQr.refresh")}
        disabled={loading}
        onPress={refresh}
      />
    </Group>
  );

  return (
    <>
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
              icon={checkIcon}
              label={t("hubQr.confirm")}
              variant="highlight"
              disabled={answering}
              onPress={() => answer(true)}
            />
          </Group>
        </View>
      ) : (
        <View style={styles.contentCard}>
          {horizontal ? (
            <View style={styles.row}>
              {qrBlock}
              <View style={styles.rowSide}>
                {heading}
                <View style={styles.codeSlot}>
                  {invite && (
                    <Text style={[styles.code, styles.codeSide]} selectable>
                      {invite.code}
                    </Text>
                  )}
                </View>
                {buttons}
              </View>
            </View>
          ) : (
            <>
              {heading}
              {qrBlock}
              {buttons}
            </>
          )}
        </View>
      )}
    </>
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
    qrFlat: {
      aspectRatio: 1,
      padding: Spacing.md,
    },
    row: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: Spacing.lg2,
    },
    rowQr: {
      width: HORIZONTAL_QR_WIDTH,
    },
    //text on top, buttons level with the qr
    rowSide: {
      flex: 1,
      justifyContent: "space-between",
      //level with the qr inside its padding
      paddingVertical: Spacing.md,
    },
    qrLoading: {
      alignItems: "center",
      justifyContent: "center",
    },
    //code under the text, level with the qr
    codeSlot: {
      flex: 1,
      justifyContent: "center",
    },
    codeSide: {
      paddingBottom: 0,
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
