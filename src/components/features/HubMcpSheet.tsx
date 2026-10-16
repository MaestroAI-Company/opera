import { useEffect, useRef, useState } from "react";
import {
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Fonts, FontSizes, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { mcpAvatar, mcpSourceLabel, runHubMcp, useHubMcp } from "../../hooks/useHubMcp";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import { MIN_SEARCH_LENGTH } from "../../services/ai/providers/huggingFaceCatalog";
import { McpFolders, McpListing, McpSource } from "../../services/hub/OperaHubService";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import NotificationCard from "../ui/NotificationCard";
import NotificationModal from "../ui/NotificationModal";
import { pressStyle } from "../ui/pressStyle";
import Selector from "../ui/Selector";
import TextInputField from "../ui/TextInputField";
import DrawerBackButton from "./DrawerBackButton";
import DrawerSheet from "./DrawerSheet";
import { McpFieldRows } from "./HubMcpSection";
import PageStack from "./PageStack";

const searchIcon = require("../../../assets/icons/search.png");
const downloadIcon = require("../../../assets/icons/download.png");
const addIcon = require("../../../assets/icons/add.png");
const fileIcon = require("../../../assets/icons/file.png");
const backIcon = require("../../../assets/icons/back.png");
const toolIcon = require("../../../assets/icons/tool.png");
const pencilIcon = require("../../../assets/icons/pencil.png");
const linkIcon = require("../../../assets/icons/link.png");
const errorIcon = require("../../../assets/icons/error.png");
const validIcon = require("../../../assets/icons/valid.png");

const DESKTOP_CARD_WIDTH = 380;

type Page = "browse" | "search" | "server" | "configure" | "folders" | "manual";
type SourceType = McpSource["type"];

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

type FolderListProps = {
  folders: McpFolders | null;
  onOpen: (path: string) => void;
  onUse: (path: string) => void;
};

//folders of the sampler machine, home and below
export function McpFolderList({ folders, onOpen, onUse }: FolderListProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  if (!folders) return <Text style={styles.helpText}>{t("hubMcp.loading")}</Text>;
  return (
    <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
      <Text style={styles.settingLabel} numberOfLines={2}>
        {folders.path}
      </Text>
      <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>{t("hubMcp.foldersHelp")}</Text>
      <Group style={[styles.highlightGroup, styles.groupSpacingTight]}>
        <ActionButton
          icon={validIcon}
          label={t("hubMcp.useFolder")}
          variant="highlight"
          onPress={() => onUse(folders.path)}
        />
      </Group>
      <Group>
        {!!folders.parent && (
          <ActionButton icon={backIcon} label={t("hubMcp.parentFolder")} onPress={() => onOpen(folders.parent!)} />
        )}
        {folders.folders.map((name) => (
          <ActionButton
            key={name}
            icon={fileIcon}
            label={name}
            onPress={() => onOpen(`${folders.path}${folders.path.includes("\\") ? "\\" : "/"}${name}`)}
          />
        ))}
      </Group>
    </View>
  );
}

type HubMcpSheetProps = {
  visible: boolean;
  onClose: () => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
};

//selection, registry search and manual installs
export default function HubMcpSheet({ visible, onClose, isLargeScreen = false, isDesktop = false }: HubMcpSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const Colors = useColors();
  const t = useT();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { api, status, catalog } = useHubMcp(visible);
  const [page, setPage] = useState<Page>("browse");
  const [serverFrom, setServerFrom] = useState<Page>("browse");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<McpListing[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [listing, setListing] = useState<McpListing | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [folderKey, setFolderKey] = useState<string | null>(null);
  const [folders, setFolders] = useState<McpFolders | null>(null);
  const [manualType, setManualType] = useState<SourceType>("npm");
  const [manualName, setManualName] = useState("");
  const [manualId, setManualId] = useState("");
  const [manualVersion, setManualVersion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmPartial, setConfirmPartial] = useState(false);
  const [bodyWidth, setBodyWidth] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  //each opening starts on the selection
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setPage("browse");
      setQuery("");
      setResults([]);
      setHandoff(false);
      setListing(null);
      setDrafts({});
      setError(null);
    }
  }

  //typing settles before a round trip
  useEffect(() => {
    const text = query.trim();
    if (!visible || !api || text.length < MIN_SEARCH_LENGTH) return;
    let dropped = false;
    const timer = setTimeout(async () => {
      setSearchFailed(false);
      setSearchLoading(true);
      try {
        const found = await api.search(text);
        if (!dropped) setResults(found);
      } catch (e) {
        console.warn("Could not search the mcp registries:", e);
        if (!dropped) setSearchFailed(true);
      } finally {
        if (!dropped) setSearchLoading(false);
      }
    }, 400);
    return () => {
      dropped = true;
      clearTimeout(timer);
    };
  }, [query, visible, api]);

  const showPage = (next: Page) => {
    setScrolled(false);
    setPage(next);
  };

  const parentOf = (p: Page): Page | null => {
    switch (p) {
      case "search":
      case "manual":
        return "browse";
      case "server":
        return serverFrom;
      case "configure":
        return "server";
      case "folders":
        return "configure";
      default:
        return null;
    }
  };

  //android back steps up the pages before the sheet closes
  const handleBack = () => {
    const parent = parentOf(page);
    if (parent === null) return false;
    Keyboard.dismiss();
    setHandoff(false);
    showPage(parent);
    return true;
  };

  const openSearch = () => {
    if (page !== "server" || serverFrom !== "search") {
      setQuery("");
      setResults([]);
      setSearchLoading(false);
      setSearchFailed(false);
    }
    setHandoff(true);
    showPage("search");
  };

  //bundles bring their form, read before anything installs
  const openServer = async (next: McpListing) => {
    if (!api) return;
    Keyboard.dismiss();
    setServerFrom(page);
    showPage("server");
    setError(null);
    setDrafts({});
    setListing(next);
    if (next.source.type !== "mcpb") return;
    setPreparing(true);
    try {
      const prepared = await api.prepare(next);
      setListing((prev) => (prev?.id === next.id ? prepared : prev));
    } catch (e) {
      setError(t("hubMcp.failed", { error: message(e) }));
    } finally {
      setPreparing(false);
    }
  };

  const openFolders = async (path?: string) => {
    if (!api) return;
    setFolders(null);
    try {
      setFolders(await api.folders(path));
    } catch (e) {
      setError(t("hubMcp.failed", { error: message(e) }));
    }
  };

  const install = async () => {
    if (!listing) return;
    setConfirmPartial(false);
    setBusy(true);
    setError(null);
    try {
      await runHubMcp((hub) => hub.install(listing, drafts));
      onClose();
    } catch (e) {
      setError(t("hubMcp.failed", { error: message(e) }));
    } finally {
      setBusy(false);
    }
  };

  //partial isolation needs an explicit yes
  const askInstall = () => {
    if (status?.isolation === "partial") setConfirmPartial(true);
    else install();
  };

  const missing = (listing?.fields ?? []).some((f) => f.required && !f.default && !drafts[f.key]);

  const submitManual = () => {
    const id = manualId.trim();
    const version = manualVersion.trim();
    const source: McpSource =
      manualType === "mcpb"
        ? { type: "mcpb", url: id, sha256: version.toLowerCase() }
        : { type: manualType, package: id, version };
    openServer({
      id: id.split(/[/@]/).filter(Boolean).pop() ?? id,
      title: manualName.trim() || id,
      description: "",
      version: manualType === "mcpb" ? "" : version,
      publisher: t("hubMcp.manualPublisher"),
      repository: null,
      license: null,
      source,
      fields: [],
      arguments: [],
      env: [],
      offline: false,
      registry: null,
    });
  };

  const renderTile = (item: McpListing, style: object) => {
    const avatar = mcpAvatar(item);
    return (
      <View style={style}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.tileImage} />
        ) : (
          <Image source={toolIcon} style={styles.tileIcon} tintColor={Colors.textPrimary} />
        )}
      </View>
    );
  };

  const renderCard = (item: McpListing) => (
    <Pressable key={item.id} onPress={() => openServer(item)} style={pressStyle(styles.card, "fade")}>
      {renderTile(item, styles.cardTile)}
      <Text style={styles.cardName} numberOfLines={2}>
        {item.title}
      </Text>
      <Text style={styles.cardMeta} numberOfLines={1}>
        {item.offline ? t("hubMcp.offline") : item.publisher}
      </Text>
    </Pressable>
  );

  const renderResult = (item: McpListing) => (
    <Pressable key={item.id} onPress={() => openServer(item)} style={pressStyle(styles.resultRow, "surface")}>
      {renderTile(item, styles.resultTile)}
      <View style={styles.resultInfo}>
        <Text style={styles.resultName} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {[mcpSourceLabel(item), item.license].filter(Boolean).join(" · ")}
        </Text>
      </View>
    </Pressable>
  );

  const renderSearchField = (p: Page) => (
    <Group>
      <TextInputField
        icon={searchIcon}
        placeholder={t("hubMcp.searchPlaceholder")}
        //other pages only lead to the search page
        value={p === "search" ? query : ""}
        onChangeText={setQuery}
        onFocus={p === "search" ? () => setHandoff(false) : openSearch}
        autoFocus={p === "search" && handoff}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </Group>
  );

  const renderServer = () => {
    if (!listing) return null;
    const folderFields = listing.fields.filter((f) => f.kind === "folder" || f.kind === "file").length;
    const sourceText =
      listing.source.type === "mcpb" ? listing.source.url : `${listing.source.package}@${listing.source.version}`;
    const rows = [
      { label: t("hubMcp.source"), value: sourceText },
      { label: t("hubMcp.repository"), value: listing.repository ?? t("hubMcp.unknown") },
      { label: t("hubMcp.license"), value: listing.license ?? t("hubMcp.unknown") },
      { label: t("hubMcp.network"), value: t("hubMcp.networkOpen") },
      { label: t("hubMcp.folders"), value: folderFields > 0 ? t("hubMcp.foldersAsked", { count: folderFields }) : t("hubMcp.noFolders") },
    ];
    const next = listing.fields.length > 0 ? () => showPage("configure") : askInstall;
    return (
      <>
        {listing.registry === null && !catalog.some((c) => c.id === listing.id) && (
          <NotificationCard
            image={errorIcon}
            tintColor={Colors.textPrimary}
            title={t("hubMcp.unverified")}
            description={t("hubMcp.unverifiedHelp")}
            style={styles.notice}
          />
        )}
        <View style={styles.contentCard}>
          <View style={styles.detailHeader}>
            {renderTile(listing, styles.detailTile)}
            <View style={styles.detailInfo}>
              <Text style={styles.detailName}>{listing.title}</Text>
              <Text style={styles.detailMeta}>{listing.publisher}</Text>
              <Text style={styles.detailMeta}>{mcpSourceLabel(listing)}</Text>
              {listing.offline && <Text style={styles.detailMeta}>{t("hubMcp.offline")}</Text>}
            </View>
          </View>
          <Group
            style={[
              styles.highlightGroup,
              styles.detailSection,
              (preparing || busy || !!error) && styles.highlightGroupDisabled,
            ]}
          >
            <ActionButton
              icon={downloadIcon}
              label={preparing ? t("hubMcp.loading") : t("hubMcp.install")}
              variant="highlight"
              disabled={preparing || busy || !!error}
              onPress={next}
            />
          </Group>
          {!!error && <Text style={[styles.helpText, styles.detailSection, { color: Colors.error }]}>{error}</Text>}
          {!!listing.description && (
            <Text style={[styles.helpText, styles.detailSection]}>{listing.description}</Text>
          )}
        </View>

        {/* what the server gets */}
        <View style={styles.contentCard}>
          <Group style={styles.infoGroup}>
            {rows.map((row) => (
              <ActionButton
                key={row.label}
                label={row.label}
                rightElement={
                  <Text style={styles.infoValue} numberOfLines={2} ellipsizeMode="middle">
                    {row.value}
                  </Text>
                }
              />
            ))}
          </Group>
        </View>
      </>
    );
  };

  const renderConfigure = () =>
    listing && (
      <View style={styles.contentCard}>
        <McpFieldRows
          fields={listing.fields}
          drafts={drafts}
          onChange={(key, value) => setDrafts((prev) => ({ ...prev, [key]: value }))}
          onPickFolder={(key) => {
            setFolderKey(key);
            openFolders(drafts[key] || undefined);
            showPage("folders");
          }}
        />
        <Group style={[styles.highlightGroup, styles.detailSection, (missing || busy) && styles.highlightGroupDisabled]}>
          <ActionButton
            icon={downloadIcon}
            label={t("hubMcp.install")}
            variant="highlight"
            disabled={missing || busy}
            onPress={askInstall}
          />
        </Group>
        {!!error && <Text style={[styles.helpText, styles.detailSection, { color: Colors.error }]}>{error}</Text>}
      </View>
    );

  const renderManual = () => {
    const isBundle = manualType === "mcpb";
    const ready = !!manualId.trim() && !!manualVersion.trim();
    return (
      <>
        <NotificationCard
          image={errorIcon}
          tintColor={Colors.textPrimary}
          title={t("hubMcp.unverified")}
          description={t("hubMcp.unverifiedHelp")}
          style={styles.notice}
        />
        <View style={styles.contentCard}>
          <View style={styles.settingRowVertical}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>{t("hubMcp.manualSource")}</Text>
            <Group>
              <Selector
                options={[
                  { id: "npm", label: "npm" },
                  { id: "pypi", label: "PyPI" },
                  { id: "mcpb", label: "MCPB" },
                ]}
                selectedValue={manualType}
                onSelect={(value) => setManualType(value as SourceType)}
                title={t("hubMcp.manualSource")}
                fullWidth
              />
            </Group>
          </View>
          <View style={styles.settingRowVertical}>
            <Text style={[styles.settingLabel, { marginBottom: Spacing.md }]}>{t("hubMcp.manualName")}</Text>
            <Group>
              <TextInputField icon={pencilIcon} value={manualName} onChangeText={setManualName} />
            </Group>
          </View>
          <View style={styles.settingRowVertical}>
            <Text style={styles.settingLabel}>{isBundle ? t("hubMcp.manualUrl") : t("hubMcp.manualPackage")}</Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {isBundle ? t("hubMcp.manualUrlHelp") : t("hubMcp.manualPackageHelp")}
            </Text>
            <Group>
              <TextInputField
                icon={linkIcon}
                value={manualId}
                onChangeText={setManualId}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </Group>
          </View>
          <View style={[styles.settingRowVertical, { marginBottom: Spacing.lg2 }]}>
            <Text style={styles.settingLabel}>{isBundle ? t("hubMcp.manualChecksum") : t("hubMcp.manualVersion")}</Text>
            <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>
              {isBundle ? t("hubMcp.manualChecksumHelp") : t("hubMcp.manualVersionHelp")}
            </Text>
            <Group>
              <TextInputField
                icon={pencilIcon}
                value={manualVersion}
                onChangeText={setManualVersion}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </Group>
          </View>
          <Group style={[styles.highlightGroup, !ready && styles.highlightGroupDisabled]}>
            <ActionButton
              icon={addIcon}
              label={t("hubMcp.manualContinue")}
              variant="highlight"
              disabled={!ready}
              onPress={submitManual}
            />
          </Group>
        </View>
      </>
    );
  };

  const browseList =
    catalog.length === 0 ? (
      <Text style={styles.helpText}>{t("hubMcp.loading")}</Text>
    ) : (
      <View>
        <Text style={[styles.settingLabel, styles.familyTitle]}>{t("hubMcp.selection")}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
          {catalog.map(renderCard)}
        </ScrollView>
      </View>
    );

  //nothing until a query goes out
  const searchList = searchLoading ? (
    <Text style={styles.helpText}>{t("hubMcp.loading")}</Text>
  ) : searchFailed ? (
    <Text style={styles.helpText}>{t("hubMcp.searchFailed")}</Text>
  ) : results.length > 0 ? (
    <Group>{results.map(renderResult)}</Group>
  ) : (
    query.trim().length >= MIN_SEARCH_LENGTH && <Text style={styles.helpText}>{t("hubMcp.noResults")}</Text>
  );

  //selection, search and server push like settings pages
  const renderPage = (p: Page, active: boolean) => (
    <>
      <ScrollView
        ref={active ? scrollRef : undefined}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        onScroll={active ? (e) => setScrolled(e.nativeEvent.contentOffset.y > 4) : undefined}
        scrollEventThrottle={16}
      >
        {p === "browse" ? (
          <>
            <View style={styles.contentCard}>
              <View style={styles.settingRowVertical}>{renderSearchField(p)}</View>
              {browseList}
            </View>
            {/* page level navigation */}
            <Group style={styles.groupSpacing}>
              <ActionButton icon={addIcon} label={t("hubMcp.manual")} onPress={() => showPage("manual")} />
            </Group>
          </>
        ) : (
          <>
            {(p === "search" || p === "server") && (
              <View style={[styles.contentCard, styles.searchWithBack]}>{renderSearchField(p)}</View>
            )}
            {p !== "search" && p !== "server" && <View style={styles.backSpacer} />}
            {p === "search" && searchList && <View style={styles.contentCard}>{searchList}</View>}
            {p === "server" && renderServer()}
            {p === "configure" && renderConfigure()}
            {p === "manual" && renderManual()}
            {p === "folders" && (
              <View style={styles.contentCard}>
                <McpFolderList
                  folders={folders}
                  onOpen={openFolders}
                  onUse={(path) => {
                    if (folderKey) setDrafts((prev) => ({ ...prev, [folderKey]: path }));
                    showPage("configure");
                  }}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* floats over the scroll like the settings back button */}
      {p !== "browse" && (
        <View style={styles.backWrapper} pointerEvents="box-none">
          <DrawerBackButton kind="back" onPress={handleBack} scrolled={scrolled} pulseKey={p} />
        </View>
      )}
    </>
  );

  return (
    <DrawerSheet
      visible={visible}
      onClose={onClose}
      onBackPress={handleBack}
      mode="overlay"
      isLargeScreen={isLargeScreen}
      isDesktop={isDesktop}
      handleContainerStyle={styles.sheetHandleContainer}
      avoidKeyboard
      sheetStyle={[
        styles.sheet,
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          //stacked pages cannot size the sheet
          height: windowHeight - insets.top - Spacing.xl2,
        },
      ]}
      //fills the settings window, stacked pages cannot size it
      desktopStyle={[styles.desktopCard, { height: "100%" }]}
    >
      <View
        style={styles.body}
        onLayout={(e) => {
          const width = e.nativeEvent.layout.width;
          setBodyWidth((prev) => (prev !== width ? width : prev));
        }}
      >
        <PageStack
          page={page}
          visible={visible}
          width={bodyWidth}
          parentOf={parentOf}
          onBack={handleBack}
          renderPage={renderPage}
        />
      </View>

      <NotificationModal
        visible={confirmPartial}
        title={t("hubMcp.partialTitle")}
        message={t("hubMcp.partialMessage")}
        onClose={() => setConfirmPartial(false)}
        buttons={[
          { text: t("common.cancel"), style: "secondary", onPress: () => setConfirmPartial(false) },
          { text: t("hubMcp.install"), style: "primary", onPress: install },
        ]}
      />
    </DrawerSheet>
  );
}

type HubFolderSheetProps = {
  start: string | undefined | null;
  visible: boolean;
  onPick: (path: string) => void;
  onClose: () => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
};

//folder picker for a server already installed
export function HubFolderSheet({ start, visible, onPick, onClose, isLargeScreen = false, isDesktop = false }: HubFolderSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { api } = useHubMcp(visible);
  const [folders, setFolders] = useState<McpFolders | null>(null);

  const open = (path?: string) => {
    if (!api) return;
    setFolders(null);
    api.folders(path).then(setFolders).catch(() => setFolders(null));
  };

  //each opening clears the last listing
  const [opened, setOpened] = useState(false);
  if (visible !== opened) {
    setOpened(visible);
    if (visible) setFolders(null);
  }
  //starts where the value points
  useEffect(() => {
    if (!visible || !api) return;
    let dropped = false;
    api
      .folders(start ?? undefined)
      .catch(() => api.folders())
      .then((found) => !dropped && setFolders(found));
    return () => {
      dropped = true;
    };
  }, [visible, api, start]);

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
        {
          paddingBottom: Platform.OS === "ios" ? 34 : 20,
          maxHeight: windowHeight - insets.top - Spacing.xl2,
        },
      ]}
      desktopStyle={styles.desktopCard}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.contentCard, { marginBottom: 0 }]}>
          <McpFolderList folders={folders} onOpen={open} onUse={onPick} />
        </View>
      </ScrollView>
    </DrawerSheet>
  );
}

//same values as the add model sheet
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
      overflow: "hidden",
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
    body: {
      flex: 1,
    },
    content: {
      paddingHorizontal: Spacing.lg2,
      paddingBottom: Spacing.lg,
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
    searchWithBack: {
      marginLeft: 40 + Spacing.md,
    },
    //room for the floating back button
    backSpacer: {
      height: 40 + Spacing.md,
    },
    notice: {
      marginBottom: Spacing.xxl,
      borderRadius: Radius.xxl + Spacing.md,
      borderWidth: 0,
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
    groupSpacing: {
      marginBottom: Spacing.xxl,
      borderRadius: Radius.xxl + Spacing.md,
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
    familyTitle: {
      marginBottom: Spacing.md,
    },
    carousel: {
      gap: Spacing.lg2,
      paddingHorizontal: Spacing.md,
    },
    card: {
      width: 96,
      alignItems: "center",
    },
    cardTile: {
      width: 96,
      height: 96,
      backgroundColor: Colors.logoTile,
      borderWidth: 2,
      borderColor: Colors.logoTileBorder,
      borderRadius: Radius.xxl,
      marginBottom: Spacing.md,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    tileImage: {
      width: "100%",
      height: "100%",
    },
    tileIcon: {
      width: 32,
      height: 32,
    },
    cardName: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
      color: Colors.textPrimary,
      textAlign: "center",
    },
    cardMeta: {
      fontFamily: Fonts.body,
      fontSize: FontSizes.labelSm,
      color: Colors.textSecondary,
      marginTop: Spacing.xs2,
    },
    resultRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: Spacing.lg2,
      paddingHorizontal: Spacing.lg2,
      gap: Spacing.lg2,
    },
    resultTile: {
      width: 44,
      height: 44,
      backgroundColor: Colors.logoTile,
      borderWidth: 2,
      borderColor: Colors.logoTileBorder,
      borderRadius: Radius.xxl,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    resultInfo: {
      flex: 1,
      gap: Spacing.xs2,
    },
    resultName: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.body,
      color: Colors.textPrimary,
    },
    rowMeta: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.micro,
      color: Colors.textMuted,
    },
    detailHeader: {
      flexDirection: "row",
      gap: Spacing.lg2,
    },
    detailTile: {
      width: 120,
      height: 120,
      backgroundColor: Colors.logoTile,
      borderWidth: 2,
      borderColor: Colors.logoTileBorder,
      borderRadius: Radius.xxl,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    detailInfo: {
      flex: 1,
    },
    detailName: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.lg,
      color: Colors.textPrimary,
      marginBottom: Spacing.xs,
    },
    detailMeta: {
      fontFamily: Fonts.body,
      fontSize: FontSizes.caption,
      color: Colors.textSecondary,
      lineHeight: 20,
    },
    detailSection: {
      marginTop: Spacing.lg2,
    },
  });
