import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Fonts, FontSizes, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import { hubErrorCode, OperaHub, PairedHub } from "../../services/hub/OperaHubService";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import DrawerSheet from "./DrawerSheet";

const cameraIcon = require("../../../assets/icons/camera.png");

const DESKTOP_CARD_WIDTH = 380;
//delay before rescanning a failed code
const RESCAN_DELAY_MS = 3000;

type HubPairingSheetProps = {
  visible: boolean;
  onClose: () => void;
  onPaired: (hub: PairedHub) => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
};

export default function HubPairingSheet({
  visible,
  onClose,
  onPaired,
  isLargeScreen = false,
  isDesktop = false,
}: HubPairingSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const [permission, requestPermission] = useCameraPermissions();
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  //scanner fires on every frame
  const lastScan = useRef<{ data: string; at: number } | null>(null);

  //a reopened sheet starts clean
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) setError(null);
  }
  useEffect(() => {
    if (visible) lastScan.current = null;
  }, [visible]);

  const handleScan = async ({ data }: { data: string }) => {
    const previous = lastScan.current;
    if (pairing || (previous?.data === data && Date.now() - previous.at < RESCAN_DELAY_MS)) return;
    lastScan.current = { data, at: Date.now() };
    setPairing(true);
    setError(null);
    try {
      onPaired(await OperaHub.pair(data));
    } catch (e) {
      setError(t(`hubPairing.error.${hubErrorCode(e)}`));
      //delay counts from the attempt end
      lastScan.current = { data, at: Date.now() };
    } finally {
      setPairing(false);
    }
  };

  const help = pairing ? t("hubPairing.pairing") : (error ?? t("hubPairing.help"));

  return (
    <DrawerSheet
      visible={visible}
      onClose={onClose}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      sheetStyle={[styles.sheet, { paddingBottom: Platform.OS === "ios" ? 34 : 20 }]}
      desktopStyle={styles.desktopCard}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.contentCard}>
          <Text style={styles.settingLabel}>{t("hubPairing.scan")}</Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {permission?.granted ? help : t("hubPairing.cameraHelp")}
          </Text>
          <Group>
            {permission?.granted ? (
              //unmount to release the camera
              visible && (
                <CameraView
                  style={styles.camera}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={handleScan}
                />
              )
            ) : (
              <ActionButton
                icon={cameraIcon}
                label={t("hubPairing.allowCamera")}
                onPress={requestPermission}
              />
            )}
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
    camera: {
      width: "100%",
      aspectRatio: 1,
    },
  });
