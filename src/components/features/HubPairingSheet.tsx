import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  Vibration,
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
import CardGrid from "../ui/CardGrid";
import Group from "../ui/Group";
import NotificationModal from "../ui/NotificationModal";
import ThinkingIcon from "../ui/ThinkingIcon";
import TextInputField from "../ui/TextInputField";
import DrawerBackButton from "./DrawerBackButton";
import DrawerSheet, { SheetBody, SheetScrollView } from "./DrawerSheet";
import PageStack from "./PageStack";

const cameraIcon = require("../../../assets/icons/camera.png");
const addIcon = require("../../../assets/icons/add.png");
const linkIcon = require("../../../assets/icons/link.png");
const keyIcon = require("../../../assets/icons/key.png");
const laptopIcon = require("../../../assets/icons/laptop.png");
const reconnectIcon = require("../../../assets/icons/reconnect.png");

//searching turns into the results, manual is pushed from both
type Page = "searching" | "discover" | "manual";

const DESKTOP_CARD_WIDTH = 720;
//delay before rescanning a failed code
const RESCAN_DELAY_MS = 3000;
//the animation stays long enough to be seen
const MIN_SEARCH_MS = 2200;
const SEARCH_HERO_SIZE = 120;

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
  const [page, setPage] = useState<Page>("searching");
  const [codeMode, setCodeMode] = useState(false);
  const [nearby, setNearby] = useState<NearbyHub[] | null>(null);
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
      setPage("searching");
      setCodeMode(false);
      setNearby(null);
    }
  }
  useEffect(() => {
    if (visible) lastScan.current = null;
  }, [visible]);

  const showFound = (hub: PairedHub) => {
    Vibration.vibrate(40);
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
  const mode = link ? "confirm" : Platform.OS === "web" ? "code" : "scan";

  //discovery page only leads to the manual ones
  const paged = discover && mode !== "confirm" && !pairedHub && SamplerHub.canDiscover();
  const shownPage: Page = paged ? page : "manual";

  useEffect(() => {
    if (!visible || !paged || page !== "searching") return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starts the network scan
    setNearby(null);
    const minimum = new Promise((resolve) => setTimeout(resolve, MIN_SEARCH_MS));
    SamplerHub.nearbyHubs()
      .catch(() => [] as NearbyHub[])
      .then(async (hubs) => {
        await minimum;
        if (cancelled) return;
        setNearby(hubs);
        //tell the user a hub is nearby
        if (hubs.length) Vibration.vibrate(30);
        setScrolled(false);
        setPage("discover");
      });
    return () => {
      cancelled = true;
    };
  }, [visible, paged, page]);

  const showPage = (next: Page) => {
    setScrolled(false);
    setPage(next);
  };

  //android back steps up before the sheet closes
  const handleBack = () => {
    if (!paged || page !== "manual" || found) return false;
    showPage(nearby === null ? "searching" : "discover");
    return true;
  };

  const pickNearby = (hub: NearbyHub) => {
    //older clients still pair with a code
    if (!SamplerHub.canSignIn()) return showPage("manual");
    onNearby?.(hub);
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

  const renderFound = (hub: PairedHub) => (
    <>
      <Text style={styles.foundTitle} numberOfLines={1}>
        {hub.name}
      </Text>
      <Image
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
          onPress={() => onPaired(hub)}
        />
      </Group>
    </>
  );

  const renderContent = () => {
    if (found) return renderFound(found);
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
      return (
        <>
          {renderCodeRow()}
          {renderModeButton(t("hubPairing.scan"), cameraIcon, false)}
        </>
      );
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
        {paged ? renderModeButton(t("hubPairing.useCode"), keyIcon, true) : renderCodeRow()}
      </>
    );
  };

  //switches between the camera and the code row
  const renderModeButton = (label: string, icon: number, code: boolean) => (
    <Group style={{ marginTop: Spacing.xxl }}>
      <ActionButton
        icon={icon}
        label={label}
        onPress={() => setCodeMode(code)}
      />
    </Group>
  );

  //centered like the other empty states
  const renderSearching = () => (
    <View style={styles.searchPage}>
      <ThinkingIcon searching size={SEARCH_HERO_SIZE} />
      <Text style={styles.searchTitle}>{t("hubPairing.searching")}</Text>
      <Text style={styles.searchHelp}>{t("hubPairing.scanning")}</Text>
    </View>
  );

  const renderDiscover = () => (
    <>
      <View style={styles.contentCard}>
        <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
          <Text style={styles.settingLabel}>{t("hubPairing.discover")}</Text>
          <Text
            style={[
              styles.helpText,
              nearby?.length ? { marginBottom: Spacing.md } : null,
            ]}
          >
            {nearby?.length ? t("hubPairing.discoverHelp") : t("hubPairing.noneFound")}
          </Text>
          {!!nearby?.length && (
            <CardGrid
              singleLineTitle
              cards={nearby.map((hub) => ({
                key: hub.id,
                title: hub.name,
                status: hub.addrs[0] ?? "",
                icon: laptopIcon,
                onPress: () => pickNearby(hub),
              }))}
            />
          )}
        </View>
      </View>
      {/* actions section, one group with no label */}
      <View style={styles.contentCard}>
        <Group>
          <ActionButton
            icon={reconnectIcon}
            label={t("hubPairing.rescan")}
            onPress={() => showPage("searching")}
          />
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
  const renderPage = (p: Page, active: boolean) => (
    <>
      <SheetScrollView
        contentContainerStyle={[
          styles.content,
          p === "manual" && styles.contentWithBack,
          p === "searching" && styles.contentCentered,
        ]}
        keyboardShouldPersistTaps="handled"
        onScroll={
          active ? (e) => setScrolled(e.nativeEvent.contentOffset.y > 4) : undefined
        }
        scrollEventThrottle={16}
      >
        {p === "searching" ? (
          renderSearching()
        ) : p === "discover" ? (
          renderDiscover()
        ) : (
          <View style={styles.contentCard}>{renderContent()}</View>
        )}
      </SheetScrollView>

      {/* floats like the settings back button */}
      {p === "manual" && !found && (
        <View style={styles.backWrapper} pointerEvents="box-none">
          <DrawerBackButton kind="back" onPress={handleBack} scrolled={scrolled} />
        </View>
      )}
    </>
  );

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
              parentOf={(p) =>
                p === "manual" ? (nearby === null ? "searching" : "discover") : null
              }
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
      paddingBottom: Spacing.lg,
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
    contentCentered: {
      flexGrow: 1,
      justifyContent: "center",
    },
    searchPage: {
      alignItems: "center",
      paddingBottom: Spacing.xxxl,
    },
    searchTitle: {
      fontSize: FontSizes.displayMd,
      color: Colors.textPrimary,
      fontFamily: Fonts.display,
      textAlign: "center",
      marginTop: Spacing.xxl,
    },
    searchHelp: {
      fontSize: FontSizes.bodyMd,
      color: Colors.textMuted,
      fontFamily: Fonts.body,
      lineHeight: 20,
      textAlign: "center",
      maxWidth: 420,
      marginTop: Spacing.md,
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
