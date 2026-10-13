import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts, FontSizes, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import { hubErrorCode, OperaHub, PairedHub } from "../../services/hub/OperaHubService";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import TextInputField from "../ui/TextInputField";
import DrawerSheet from "./DrawerSheet";

const cameraIcon = require("../../../assets/icons/camera.png");
const linkIcon = require("../../../assets/icons/link.png");

const DESKTOP_CARD_WIDTH = 380;
//delay before rescanning a failed code
const RESCAN_DELAY_MS = 3000;

type HubPairingSheetProps = {
  visible: boolean;
  onClose: () => void;
  onPaired: (hub: PairedHub) => void;
  //opened from an opera://hub/pair link
  link?: string | null;
  //a second hub would silently replace it
  pairedHub?: PairedHub | null;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
};

export default function HubPairingSheet({
  visible,
  onClose,
  onPaired,
  link = null,
  pairedHub = null,
  isLargeScreen = false,
  isDesktop = false,
}: HubPairingSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const [permission, requestPermission] = useCameraPermissions();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typedLink, setTypedLink] = useState("");
  //scanner fires on every frame
  const lastScan = useRef<{ data: string; at: number } | null>(null);

  //a reopened sheet starts clean
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setError(null);
      setTypedLink("");
    }
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

  //links are typed or confirmed, never auto paired
  const pairLink = async (value: string) => {
    if (pairing || !value.trim()) return;
    setPairing(true);
    setError(null);
    try {
      onPaired(await OperaHub.pair(value.trim()));
    } catch (e) {
      setError(t(`hubPairing.error.${hubErrorCode(e)}`));
    } finally {
      setPairing(false);
    }
  };

  const help = pairing ? t("hubPairing.pairing") : (error ?? t("hubPairing.help"));
  //desktop and web have no camera to scan with
  const mode = link ? "confirm" : Platform.OS === "web" ? "paste" : "scan";

  const renderPairButton = (value: string) => (
    <Group
      style={[
        styles.highlightGroup,
        (pairing || !value.trim()) && styles.highlightGroupDisabled,
      ]}
    >
      <ActionButton
        icon={linkIcon}
        label={t("hubPairing.pair")}
        variant="highlight"
        disabled={pairing || !value.trim()}
        onPress={() => pairLink(value)}
      />
    </Group>
  );

  const renderContent = () => {
    if (pairedHub) {
      return (
        <>
          <Text style={styles.settingLabel}>{t("hubPairing.confirm")}</Text>
          <Text style={styles.helpText}>
            {t("hubPairing.alreadyPaired", { name: pairedHub.name })}
          </Text>
        </>
      );
    }
    if (mode === "confirm") {
      return (
        <>
          <Text style={styles.settingLabel}>{t("hubPairing.confirm")}</Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {pairing ? t("hubPairing.pairing") : (error ?? t("hubPairing.confirmHelp"))}
          </Text>
          {renderPairButton(link ?? "")}
        </>
      );
    }
    if (mode === "paste") {
      return (
        <>
          <Text style={styles.settingLabel}>{t("hubPairing.link")}</Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {pairing ? t("hubPairing.pairing") : (error ?? t("hubPairing.linkHelp"))}
          </Text>
          <Group style={styles.groupSpacingTight}>
            <TextInputField
              icon={linkIcon}
              placeholder="opera://hub/pair?..."
              value={typedLink}
              onChangeText={setTypedLink}
              onSubmitEditing={() => pairLink(typedLink)}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Group>
          {renderPairButton(typedLink)}
        </>
      );
    }
    return (
      <>
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
      </>
    );
  };

  return (
    <DrawerSheet
      visible={visible}
      onClose={onClose}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      avoidKeyboard={mode === "paste"}
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
        <View style={styles.contentCard}>{renderContent()}</View>
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
    highlightGroup: {
      backgroundColor: Colors.primary,
      borderColor: Colors.borderOnPrimary,
    },
    highlightGroupDisabled: {
      opacity: 0.5,
    },
    camera: {
      width: "100%",
      aspectRatio: 1,
    },
  });
