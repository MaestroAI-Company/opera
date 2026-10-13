import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Fonts,
  FontSizes,
  Radius,
  Spacing,
  ThemeColors,
} from "../../../constants/theme";
import { useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import {
  hubErrorCode,
  NearbyHub,
  OperaHub,
  PairedHub,
} from "../../services/hub/OperaHubService";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import TextInputField from "../ui/TextInputField";
import DrawerSheet from "./DrawerSheet";

const cameraIcon = require("../../../assets/icons/camera.png");
const linkIcon = require("../../../assets/icons/link.png");
const keyIcon = require("../../../assets/icons/key.png");
const serverIcon = require("../../../assets/icons/server.png");

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
  //which row the last failure belongs to
  const [errorRow, setErrorRow] = useState<"scan" | "code">("code");
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

  //hubs answering on this network
  const [nearby, setNearby] = useState<NearbyHub[]>([]);
  useEffect(() => {
    if (!visible || link || !OperaHub.canDiscover()) return;
    let cancelled = false;
    OperaHub.nearbyHubs()
      .then((found) => !cancelled && setNearby(found))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visible, link]);

  const handleScan = async ({ data }: { data: string }) => {
    const previous = lastScan.current;
    if (
      pairing ||
      (previous?.data === data && Date.now() - previous.at < RESCAN_DELAY_MS)
    )
      return;
    lastScan.current = { data, at: Date.now() };
    setPairing(true);
    setError(null);
    try {
      onPaired(await OperaHub.pair(data));
    } catch (e) {
      setError(t(`hubPairing.error.${hubErrorCode(e)}`));
      setErrorRow("scan");
      //delay counts from the attempt end
      lastScan.current = { data, at: Date.now() };
    } finally {
      setPairing(false);
    }
  };

  //codes and links are typed or confirmed, never auto paired
  const pairTyped = async (
    value: string,
    pair: (value: string) => Promise<PairedHub>,
  ) => {
    if (pairing || !value.trim()) return;
    setPairing(true);
    setError(null);
    try {
      onPaired(await pair(value.trim()));
    } catch (e) {
      setError(t(`hubPairing.error.${hubErrorCode(e)}`));
      setErrorRow("code");
    } finally {
      setPairing(false);
    }
  };

  const status = (row: "scan" | "code", idle: string) =>
    pairing
      ? t("hubPairing.pairing")
      : error && errorRow === row
        ? error
        : idle;
  //desktop and web have no camera to scan with
  const mode = link ? "confirm" : Platform.OS === "web" ? "code" : "scan";

  const renderPairButton = (
    value: string,
    pair: (value: string) => Promise<PairedHub>,
  ) => (
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
        onPress={() => pairTyped(value, pair)}
      />
    </Group>
  );

  const renderCodeRow = () => (
    <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
      <Text style={styles.settingLabel}>{t("hubPairing.code")}</Text>
      <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
        {status("code", t("hubPairing.codeHelp"))}
      </Text>
      <Group style={styles.groupSpacingTight}>
        <TextInputField
          icon={keyIcon}
          placeholder="XXXX-XXXX"
          value={typedLink}
          onChangeText={setTypedLink}
          onSubmitEditing={() =>
            pairTyped(typedLink, (v) => OperaHub.pairWithCode(v))
          }
          autoCapitalize="characters"
          autoCorrect={false}
        />
      </Group>
      {renderPairButton(typedLink, (v) => OperaHub.pairWithCode(v))}
    </View>
  );

  //found hubs still ask for their code
  const renderNearbyRow = () =>
    nearby.length > 0 && (
      <View style={styles.settingRowVertical}>
        <Text style={styles.settingLabel}>{t("hubPairing.nearby")}</Text>
        <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
          {t("hubPairing.nearbyHelp")}
        </Text>
        <Group style={styles.infoGroup}>
          {nearby.map((hub) => (
            <ActionButton key={hub.id} icon={serverIcon} label={hub.name} />
          ))}
        </Group>
      </View>
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
            {status("code", t("hubPairing.confirmHelp"))}
          </Text>
          {renderPairButton(link ?? "", (v) => OperaHub.pair(v))}
        </>
      );
    }
    if (mode === "code") {
      return (
        <>
          {renderNearbyRow()}
          {renderCodeRow()}
        </>
      );
    }
    return (
      <>
        {renderNearbyRow()}
        <View style={styles.settingRowVertical}>
          <Text style={styles.settingLabel}>{t("hubPairing.scan")}</Text>
          <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
            {permission?.granted
              ? status("scan", t("hubPairing.help"))
              : t("hubPairing.cameraHelp")}
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
        {renderCodeRow()}
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
      avoidKeyboard={mode !== "confirm"}
      sheetStyle={[
        styles.sheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: windowHeight - insets.top - Spacing.xl2,
        },
      ]}
      desktopStyle={styles.desktopCard}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
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
    settingRowVertical: {
      marginBottom: Spacing.xxl,
    },
    //static rows on the white card
    infoGroup: {
      borderWidth: 0,
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
