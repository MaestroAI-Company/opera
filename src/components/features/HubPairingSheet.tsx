import { CameraView, useCameraPermissions } from "expo-camera";
import * as IntentLauncher from "expo-intent-launcher";
import { useEffect, useRef, useState } from "react";
import {
  Linking,
  Platform,
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
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import {
  hubErrorCode,
  SamplerHub,
  PairedHub,
  NearbyHub,
} from "../../services/hub/SamplerHubService";
import ActionButton from "../ui/ActionButton";
import AppIcon from "../ui/AppIcon";
import Group from "../ui/Group";
import NotificationModal from "../ui/NotificationModal";
import SliderToggle from "../ui/SliderToggle";
import TextInputField from "../ui/TextInputField";
import DrawerBackButton from "./DrawerBackButton";
import DrawerSheet, { SheetBody, SheetScrollView } from "./DrawerSheet";
import HubOrbit, { type OrbitNode } from "./HubOrbit";
import PageStack from "./PageStack";
import { vibrate } from "@/services/haptics";
import addIcon from "../../../assets/icons/add2.svg";
import linkIcon from "../../../assets/icons/link2.svg";
import keyIcon from "../../../assets/icons/key2.svg";
import laptopIcon from "../../../assets/icons/laptop2.svg";
import phoneIcon from "../../../assets/icons/phone2.svg";
import cameraIcon from "../../../assets/icons/camera2.svg";
import codeIcon from "../../../assets/icons/code2.svg";
import qrcodeIcon from "../../../assets/icons/qrcode2.svg";
import wifiIcon from "../../../assets/icons/wifi2.svg";
import { hasPlatformFeature } from "../../services/platform";

//manual and nearby are pushed from the orbit
type Page = "orbit" | "manual" | "nearby";

const DESKTOP_CARD_WIDTH = 720;
//delay before rescanning a failed code
const RESCAN_DELAY_MS = 3000;
//pause before checking the network again
const OFFLINE_RETRY_MS = 2000;
//missed hubs leave the orbit
const LOST_AFTER_MS = 10000;

type HubPairingSheetProps = {
  visible: boolean;
  onClose: () => void;
  onPaired: (hub: PairedHub) => void;
  //opened from an opera://hub/pair link
  link?: string | null;
  //a second hub would silently replace it
  pairedHub?: PairedHub | null;
  //opens on hubs found nearby
  discover?: boolean;
  //new profile skips the search
  startWithCode?: boolean;
  onNearby?: (hub: NearbyHub) => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
};

export default function HubPairingSheet({
  visible,
  onClose,
  onPaired,
  link = null,
  pairedHub = null,
  discover = false,
  startWithCode = false,
  onNearby,
  isLargeScreen = false,
  isDesktop = false,
}: HubPairingSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const Colors = useColors();
  const t = useT();
  const [permission, requestPermission] = useCameraPermissions();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typedLink, setTypedLink] = useState("");
  //paired hub waiting for the user to confirm the link
  const [found, setFound] = useState<PairedHub | null>(null);
  //scanner fires on every frame
  const lastScan = useRef<{ data: string; at: number } | null>(null);
  const [page, setPage] = useState<Page>("orbit");
  const [codeMode, setCodeMode] = useState(false);
  const [nearby, setNearby] = useState<NearbyHub[]>([]);
  //hub shown before its profiles
  const [picked, setPicked] = useState<NearbyHub | null>(null);
  const [noWifi, setNoWifi] = useState(false);
  const [bodyWidth, setBodyWidth] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  //a reopened sheet starts clean
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setError(null);
      setTypedLink("");
      setFound(null);
      setPage(startWithCode ? "manual" : "orbit");
      setCodeMode(startWithCode);
      setNearby([]);
      setNoWifi(false);
    }
  }
  useEffect(() => {
    if (visible) lastScan.current = null;
  }, [visible]);

  const showFound = (hub: PairedHub) => {
    vibrate(40);
    setFound(hub);
  };

  //the hub is already stored, so closing undoes the pairing
  const handleClose = () => {
    if (found) SamplerHub.unpair(found).catch(() => {});
    onClose();
  };

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
      showFound(await SamplerHub.pair(data));
    } catch (e) {
      setError(t(`hubPairing.error.${hubErrorCode(e)}`));
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
      showFound(await pair(value.trim()));
    } catch (e) {
      console.warn("[HubPairing] pairing failed:", e);
      setError(t(`hubPairing.error.${hubErrorCode(e)}`));
    } finally {
      setPairing(false);
    }
  };

  //desktop and web have no camera to scan with
  //code row without camera
  const mode = link
    ? "confirm"
    : Platform.OS === "web" || !hasPlatformFeature("android.hardware.camera.any")
      ? "code"
      : "scan";

  //discovery page only leads to the manual ones
  const paged = discover && mode !== "confirm" && !pairedHub && SamplerHub.canDiscover();
  const shownPage: Page = paged ? page : "manual";

  //searches round after round while the sheet is open
  useEffect(() => {
    if (!visible || !paged) return;
    let cancelled = false;
    const seen = new Map<string, { hub: NearbyHub; at: number }>();
    (async () => {
      while (!cancelled) {
        const online = await SamplerHub.localNetworkAvailable().catch(
          () => true,
        );
        if (cancelled) return;
        setNoWifi(!online);
        //no network means nothing to search
        if (!online) {
          seen.clear();
          setNearby([]);
          await new Promise((resolve) => setTimeout(resolve, OFFLINE_RETRY_MS));
          continue;
        }
        const hubs = await SamplerHub.nearbyHubs().catch(
          () => [] as NearbyHub[],
        );
        if (cancelled) return;
        const now = Date.now();
        const fresh = hubs.some((hub) => !seen.has(hub.id));
        hubs.forEach((hub) => seen.set(hub.id, { hub, at: now }));
        for (const [id, entry] of seen) {
          if (now - entry.at > LOST_AFTER_MS) seen.delete(id);
        }
        //tell the user a hub joined the orbit
        if (fresh) vibrate(30);
        setNearby([...seen.values()].map((entry) => entry.hub));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, paged]);

  const openWifiSettings = () => {
    //ios has no wifi settings link
    if (Platform.OS === "ios") {
      Linking.openSettings().catch(() => {});
      return;
    }
    IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.WIFI_SETTINGS,
    ).catch(() => {});
  };

  const showPage = (next: Page) => {
    setScrolled(false);
    setPage(next);
  };

  //android back steps up before the sheet closes
  const handleBack = () => {
    if (!paged || page === "orbit" || found) return false;
    showPage("orbit");
    return true;
  };

  const pickNearby = (hub: NearbyHub) => {
    //older clients still pair with a code
    if (!SamplerHub.canSignIn()) return showPage("manual");
    vibrate(40);
    setPicked(hub);
    showPage("nearby");
  };

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
        icon={addIcon}
        label={t("hubPairing.pair")}
        variant="highlight"
        disabled={pairing || !value.trim()}
        onPress={() => pairTyped(value, pair)}
      />
    </Group>
  );

  const renderCodeRow = () => (
    <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
      {startWithCode && (
        <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
          {t("hubPairing.createNeedsCode")}
        </Text>
      )}
      <Text style={styles.settingLabel}>{t("hubPairing.code")}</Text>
      <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
        {t("hubPairing.codeHelp")}
      </Text>
      <Group style={styles.groupSpacingTight}>
        <TextInputField
          icon={keyIcon}
          placeholder="XXXX-XXXX"
          value={typedLink}
          onChangeText={setTypedLink}
          onSubmitEditing={() =>
            pairTyped(typedLink, (v) => SamplerHub.pairWithCode(v))
          }
          autoCapitalize="characters"
          autoCorrect={false}
        />
      </Group>
      {renderPairButton(typedLink, (v) => SamplerHub.pairWithCode(v))}
    </View>
  );

  const renderFound = (
    hub: { id: string; name: string },
    onLink: () => void,
  ) => (
    <>
      <Text style={styles.foundTitle} numberOfLines={1}>
        {hub.name}
      </Text>
      <AppIcon
        source={laptopIcon}
        style={styles.foundIcon}
        tintColor={Colors.textPrimary}
      />
      <Text style={styles.foundText}>{t("hubPairing.found")}</Text>
      <Text style={styles.foundId} numberOfLines={1}>
        {hub.id.slice(0, 8)}
      </Text>
      <Group style={styles.highlightGroup}>
        <ActionButton
          icon={linkIcon}
          label={t("hubPairing.link", { name: hub.name })}
          variant="highlight"
          onPress={onLink}
        />
      </Group>
    </>
  );

  const renderContent = () => {
    if (found) return renderFound(found, () => onPaired(found));
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
            {t("hubPairing.confirmHelp")}
          </Text>
          {renderPairButton(link ?? "", (v) => SamplerHub.pair(v))}
        </>
      );
    }
    if (mode === "code") {
      return (
        <>
          {renderCodeRow()}
        </>
      );
    }
    if (paged && codeMode) {
      return <>{renderCodeRow()}</>;
    }
    return (
      <>
        <View
          style={[styles.settingRowVertical, paged && { marginBottom: 0 }]}
        >
          <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>
            {t("hubPairing.scan")}
          </Text>
          <Group>
            {permission?.granted ? (
              //unmount to release the camera
              visible &&
              shownPage === "manual" && (
                <CameraView
                  style={styles.camera}
                  facing={hasPlatformFeature("android.hardware.camera") ? "back" : "front"}
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
        {!paged && renderCodeRow()}
      </>
    );
  };

  //switches between the camera and the code row
  const renderModeSwitch = () => (
    <View style={[styles.contentCard, styles.switchWithBack]}>
      <Group>
        <SliderToggle
          selectedValue={codeMode ? "code" : "qr"}
          onSelect={(id) => setCodeMode(id === "code")}
          options={[
            { id: "qr", label: t("hubPairing.tabQr"), icon: qrcodeIcon },
            { id: "code", label: t("hubPairing.tabCode"), icon: codeIcon },
          ]}
        />
      </Group>
    </View>
  );

  //this device at the center, the hubs found turning around it
  const renderOrbit = () => (
    <>
      <View style={styles.orbitPage}>
        <Text style={styles.searchTitle}>{t("hubPairing.searching")}</Text>
        <Text style={styles.searchHelp}>
          {noWifi
            ? t("hubPairing.noWifi")
            : nearby.length
              ? t("hubPairing.discoverHelp")
              : t("hubPairing.scanning")}
        </Text>
        <View style={styles.orbitStage}>
          <HubOrbit
            hubIcon={Platform.OS === "android" ? phoneIcon : laptopIcon}
            nodes={nearby.map((hub): OrbitNode => ({
              key: hub.id,
              name: hub.name,
              icon: laptopIcon,
              connected: false,
              onPress: () => pickNearby(hub),
            }))}
            active={visible && page === "orbit"}
            ripple={noWifi ? undefined : "out"}
            bareHub
          />
        </View>
      </View>
      {/* actions section, one group with no label */}
      <View style={styles.contentCard}>
        <Group>
          {noWifi && (
            <ActionButton
              icon={wifiIcon}
              label={t("hubPairing.wifiOn")}
              onPress={openWifiSettings}
            />
          )}
          <ActionButton
            icon={addIcon}
            label={t("hubPairing.manual")}
            onPress={() => showPage("manual")}
          />
        </Group>
      </View>
    </>
  );

  //pages push like settings pages
  const renderPage = (p: Page, active: boolean) => {
    //switch beside the back button
    const showSwitch = p === "manual" && paged && mode !== "code" && !found;
    return (
      <>
        <SheetScrollView
          contentContainerStyle={[
            styles.content,
            p !== "orbit" && styles.contentWithBack,
            showSwitch && styles.contentWithSwitch,
            p === "orbit" && styles.contentFill,
          ]}
          keyboardShouldPersistTaps="handled"
          onScroll={
            active ? (e) => setScrolled(e.nativeEvent.contentOffset.y > 4) : undefined
          }
          scrollEventThrottle={16}
        >
          {showSwitch && renderModeSwitch()}
          {p === "orbit" ? (
            renderOrbit()
          ) : p === "nearby" ? (
            picked && (
              <View style={styles.contentCard}>
                {renderFound(picked, () => onNearby?.(picked))}
              </View>
            )
          ) : (
            <View style={styles.contentCard}>{renderContent()}</View>
          )}
        </SheetScrollView>

        {/* floats like the settings back button */}
        {p !== "orbit" && !found && (
          <View style={styles.backWrapper} pointerEvents="box-none">
            <DrawerBackButton kind="back" onPress={handleBack} scrolled={scrolled} />
          </View>
        )}
      </>
    );
  };

  return (
    <>
      <DrawerSheet
        visible={visible}
        onClose={handleClose}
        onBackPress={handleBack}
        mode="overlay"
        isLargeScreen={isLargeScreen}
        isDesktop={isDesktop}
        handleContainerStyle={styles.sheetHandleContainer}
        avoidKeyboard={mode !== "confirm" && !found}
        sheetStyle={[
          styles.sheet,
          {
            //stacked pages cannot size the sheet
            ...(paged
              ? { height: windowHeight - insets.top - Spacing.xl2 }
              : { maxHeight: windowHeight - insets.top - Spacing.xl2 }),
          },
        ]}
        desktopStyle={[styles.desktopCard, paged && { height: "100%" }]}
      >
        {paged ? (
          <SheetBody
            style={styles.body}
            onLayout={(e) => {
              const width = e.nativeEvent.layout.width;
              setBodyWidth((prev) => (prev !== width ? width : prev));
            }}
          >
            <PageStack
              page={shownPage}
              visible={visible}
              width={bodyWidth}
              parentOf={(p) => (p === "orbit" ? null : "orbit")}
              onBack={handleBack}
              renderPage={renderPage}
            />
          </SheetBody>
        ) : (
          <SheetScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.contentCard}>{renderContent()}</View>
          </SheetScrollView>
        )}
      </DrawerSheet>
      <NotificationModal
        visible={visible && (pairing || !!error)}
        message={pairing ? t("hubPairing.pairing") : (error ?? undefined)}
        messageAlign="center"
        loading={pairing}
        buttons={[{ text: t("common.ok"), onPress: () => setError(null) }]}
        onClose={() => !pairing && setError(null)}
      />
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
    body: {
      flex: 1,
    },
    //room for the floating back button
    contentWithBack: {
      paddingTop: 40 + Spacing.xxl,
    },
    contentWithSwitch: {
      paddingTop: 0,
    },
    switchWithBack: {
      marginLeft: 40 + Spacing.md,
    },
    backWrapper: {
      position: "absolute",
      top: Spacing.md + 4,
      left: Spacing.lg2,
      width: 40,
      height: 40,
      zIndex: 10,
      elevation: 10,
    },
    content: {
      paddingHorizontal: Spacing.lg2,
      gap: Spacing.xxl2,
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
    //actions stay at the bottom of the sheet
    contentFill: {
      flexGrow: 1,
    },
    orbitPage: {
      flex: 1,
      alignItems: "center",
      paddingTop: Spacing.xxl,
    },
    orbitStage: {
      flex: 1,
      width: "100%",
      justifyContent: "center",
    },
    searchTitle: {
      fontSize: FontSizes.displayMd,
      color: Colors.textPrimary,
      fontFamily: Fonts.display,
      textAlign: "center",
    },
    searchHelp: {
      fontSize: FontSizes.bodyMd,
      color: Colors.textMuted,
      fontFamily: Fonts.body,
      lineHeight: 20,
      textAlign: "center",
      maxWidth: 420,
      marginTop: Spacing.md,
      marginBottom: Spacing.xxxl,
    },
    foundTitle: {
      fontSize: FontSizes.displayMd,
      color: Colors.textPrimary,
      fontFamily: Fonts.display,
      textAlign: "center",
      paddingHorizontal: Spacing.md,
    },
    foundIcon: {
      width: 120,
      height: 120,
      alignSelf: "center",
      marginVertical: Spacing.xl2,
    },
    foundText: {
      fontSize: FontSizes.body,
      color: Colors.textPrimary,
      fontFamily: Fonts.mono,
      paddingHorizontal: Spacing.md,
    },
    foundId: {
      fontSize: FontSizes.body,
      color: Colors.textMuted,
      fontFamily: Fonts.mono,
      marginTop: Spacing.sm,
      marginBottom: Spacing.lg2,
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
