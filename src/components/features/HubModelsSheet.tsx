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
import {
  fileStem,
  hubModelAvatar,
  hubModelPublisher,
  repoLabel,
  runHubModels,
  useHubModels,
} from "../../hooks/useHubModels";
import { useThemedStyles } from "../../hooks/useTheme";
import { useT } from "../../i18n";
import {
  fetchModelDescription,
  formatBytes,
  MIN_SEARCH_LENGTH,
} from "../../services/ai/providers/huggingFaceCatalog";
import { CatalogModel, ModelFile, ModelRepo } from "../../services/hub/SamplerHubService";
import ActionButton from "../ui/ActionButton";
import Group from "../ui/Group";
import NotificationModal from "../ui/NotificationModal";
import { pressStyle } from "../ui/pressStyle";
import TextInputField from "../ui/TextInputField";
import DrawerBackButton from "./DrawerBackButton";
import DrawerSheet from "./DrawerSheet";
import PageStack from "./PageStack";

const searchIcon = require("../../../assets/icons/search.png");
const downloadIcon = require("../../../assets/icons/download.png");

const DESKTOP_CARD_WIDTH = 380;
const OTHER_FAMILY = "other";

type Page = "browse" | "search" | "model";
type Detail = {
  repo: string;
  name: string;
  //catalog pick, the recommended quant otherwise
  file?: string;
  files: ModelFile[] | null;
  description?: string | null;
};
type Pending = { repo: string; file: string; size: number };

//q4 keeps most quality at a quarter of the size
function recommendedFile(files: ModelFile[]): ModelFile | undefined {
  return files.find((f) => /q4_k_m/i.test(f.file)) ?? files.find((f) => /q4/i.test(f.file)) ?? files[0];
}

type HubModelsSheetProps = {
  visible: boolean;
  onClose: () => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
};

//browse, search and download llama.cpp models like the on-device sheet
export default function HubModelsSheet({
  visible,
  onClose,
  isLargeScreen = false,
  isDesktop = false,
}: HubModelsSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { api, status, catalog } = useHubModels(visible);
  const [page, setPage] = useState<Page>("browse");
  const [modelFrom, setModelFrom] = useState<Page>("browse");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ModelRepo[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bodyWidth, setBodyWidth] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  //each opening starts on the catalog
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setPage("browse");
      setQuery("");
      setResults([]);
      setHandoff(false);
      setDetail(null);
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
        const repos = await api.search(text);
        if (!dropped) setResults(repos);
      } catch (e) {
        console.warn("Could not search the hub models:", e);
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

  const installed = new Set(status?.installed.map((m) => m.file));
  const downloadOf = (file: string) => status?.downloads.find((d) => d.file === file && !d.error);

  const showPage = (next: Page) => {
    setScrolled(false);
    setPage(next);
  };

  const parentOf = (p: Page): Page | null => (p === "model" ? modelFrom : p === "search" ? "browse" : null);

  //android back steps up the pages before the sheet closes
  const handleBack = () => {
    const parent = parentOf(page);
    if (parent === null) return false;
    Keyboard.dismiss();
    setHandoff(false);
    showPage(parent);
    return true;
  };

  //a model found by search steps back to its results
  const openSearch = () => {
    if (page !== "model" || modelFrom !== "search") {
      setQuery("");
      setResults([]);
      setSearchLoading(false);
      setSearchFailed(false);
    }
    setHandoff(true);
    showPage("search");
  };

  const openModel = async (repo: string, name: string, file?: string) => {
    if (!api) return;
    Keyboard.dismiss();
    if (page === "model") {
      //similar model swaps in place
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    } else {
      setModelFrom(page);
    }
    showPage("model");
    setError(null);
    setDetail({ repo, name, file, files: null });
    fetchModelDescription(repo).then((description) =>
      setDetail((prev) => (prev?.repo === repo ? { ...prev, description } : prev)),
    );
    try {
      const files = await api.files(repo);
      setDetail((prev) =>
        prev?.repo === repo ? { ...prev, files, file: prev.file ?? recommendedFile(files)?.file } : prev,
      );
    } catch (e) {
      setDetail((prev) => (prev?.repo === repo ? { ...prev, files: [] } : prev));
      setError(t("hubModels.failed", { error: e instanceof Error ? e.message : String(e) }));
    }
  };

  const download = async () => {
    const target = pending;
    setPending(null);
    if (!target) return;
    try {
      await runHubModels((models) => models.download(target.repo, target.file));
      onClose();
    } catch (e) {
      setError(t("hubModels.failed", { error: e instanceof Error ? e.message : String(e) }));
    }
  };

  const fileMeta = (file: string, size: number) => {
    const running = downloadOf(file);
    if (installed.has(file)) return t("settings.litert.installed");
    if (running) {
      return t("settings.litert.downloadingPercent", {
        percent: running.total ? Math.floor((running.received / running.total) * 100) : 0,
      });
    }
    return formatBytes(size);
  };

  const renderCard = (model: CatalogModel) => (
    <Pressable
      key={model.file}
      onPress={() => openModel(model.repo, model.name, model.file)}
      style={pressStyle(styles.card, "fade")}
    >
      <View style={styles.cardTile}>
        <Image source={{ uri: hubModelAvatar(model.name, model.repo) }} style={styles.tileImage} />
      </View>
      <Text style={styles.cardName} numberOfLines={2}>
        {model.name}
      </Text>
      <Text style={styles.cardMeta} numberOfLines={1}>
        {fileMeta(model.file, model.size)}
      </Text>
    </Pressable>
  );

  const renderResult = (repo: ModelRepo) => {
    const name = repoLabel(repo.repo);
    return (
      <Pressable
        key={repo.repo}
        onPress={() => openModel(repo.repo, name)}
        style={pressStyle(styles.resultRow, "surface")}
      >
        <View style={styles.resultTile}>
          <Image source={{ uri: hubModelAvatar(name, repo.repo) }} style={styles.tileImage} />
        </View>
        <View style={styles.resultInfo}>
          <Text style={styles.resultName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {repo.repo.split("/")[0]} · {t("hubModels.downloads", { count: repo.downloads.toLocaleString() })}
          </Text>
        </View>
      </Pressable>
    );
  };

  //catalog grouped by publisher family
  const families = catalog.reduce<{ id: string; models: CatalogModel[] }[]>((list, model) => {
    const id = hubModelPublisher(model.name)?.family ?? OTHER_FAMILY;
    const family = list.find((f) => f.id === id);
    if (family) family.models.push(model);
    else list.push({ id, models: [model] });
    return list;
  }, []);

  const browseList =
    catalog.length === 0 ? (
      <Text style={styles.helpText}>{t("settings.litert.loading")}</Text>
    ) : (
      <View style={styles.families}>
        {families.map((family) => (
          <View key={family.id}>
            <Text style={[styles.settingLabel, styles.familyTitle]}>
              {family.id === OTHER_FAMILY ? t("settings.litert.familyOther") : family.id}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
              {family.models.map(renderCard)}
            </ScrollView>
          </View>
        ))}
      </View>
    );

  //nothing until a query goes out
  const searchList = searchLoading ? (
    <Text style={styles.helpText}>{t("settings.litert.loading")}</Text>
  ) : searchFailed ? (
    <Text style={styles.helpText}>{t("settings.litert.loadFailed")}</Text>
  ) : results.length > 0 ? (
    <Group>{results.map(renderResult)}</Group>
  ) : (
    query.trim().length >= MIN_SEARCH_LENGTH && <Text style={styles.helpText}>{t("hubModels.noResults")}</Text>
  );

  const renderDetail = () => {
    if (!detail) return null;
    const { repo, name, files, description } = detail;
    const chosen = files?.find((f) => f.file === detail.file);
    const publisher = hubModelPublisher(name)?.publisher;
    const busy = !chosen || installed.has(chosen.file) || !!downloadOf(chosen.file);
    const others = catalog.filter((m) => m.repo !== repo);

    return (
      <>
        <View style={styles.contentCard}>
          <View style={styles.detailHeader}>
            <View style={styles.detailTile}>
              <Image source={{ uri: hubModelAvatar(name, repo) }} style={styles.tileImage} />
            </View>
            <View style={styles.detailInfo}>
              <Text style={styles.detailName}>{name}</Text>
              {!!publisher && <Text style={styles.detailMeta}>{publisher}</Text>}
              <Text style={styles.detailMeta}>
                {!files
                  ? t("settings.litert.loading")
                  : chosen
                    ? fileMeta(chosen.file, chosen.size)
                    : t("hubModels.noFiles")}
              </Text>
              {!!chosen && <Text style={styles.detailMeta}>{fileStem(chosen.file)}</Text>}
            </View>
          </View>

          <Group style={[styles.highlightGroup, styles.detailDownload, busy && styles.highlightGroupDisabled]}>
            <ActionButton
              icon={downloadIcon}
              label={
                chosen && installed.has(chosen.file)
                  ? t("settings.litert.installed")
                  : t("settings.litert.downloadAction")
              }
              variant="highlight"
              disabled={busy}
              onPress={() => chosen && setPending({ repo, file: chosen.file, size: chosen.size })}
            />
          </Group>
          {!!error && <Text style={[styles.helpText, { marginTop: Spacing.md }]}>{error}</Text>}

          <Text style={[styles.settingLabel, styles.detailSection]}>{t("settings.litert.description")}</Text>
          <Text style={styles.helpText}>
            {description === undefined
              ? t("settings.litert.loading")
              : (description ?? t("settings.litert.noDescription"))}
          </Text>
        </View>

        {/* every quant of the repo */}
        {!!files && files.length > 1 && (
          <View style={styles.contentCard}>
            <View style={[styles.settingRowVertical, { marginBottom: 0 }]}>
              <Text style={styles.settingLabel}>{t("hubModels.versions")}</Text>
              <Text style={[styles.helpText, { marginBottom: Spacing.md }]}>{t("hubModels.versionsHelp")}</Text>
              <Group>
                {files.map((f) => (
                  <ActionButton
                    key={f.file}
                    label={fileStem(f.file)}
                    onPress={() => setDetail((prev) => (prev ? { ...prev, file: f.file } : prev))}
                    rightElement={
                      <Text
                        style={[styles.infoValue, f.file === detail.file && styles.infoValueActive]}
                        numberOfLines={1}
                      >
                        {fileMeta(f.file, f.size)}
                      </Text>
                    }
                  />
                ))}
              </Group>
            </View>
          </View>
        )}

        {others.length > 0 && (
          <View style={[styles.contentCard, styles.families]}>
            <View>
              <Text style={[styles.settingLabel, styles.familyTitle]}>{t("settings.litert.otherModels")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
                {others.map(renderCard)}
              </ScrollView>
            </View>
          </View>
        )}
      </>
    );
  };

  const renderSearchField = (p: Page) => (
    <Group>
      <TextInputField
        icon={searchIcon}
        placeholder={t("hubModels.searchPlaceholder")}
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

  //catalog, search and model push like settings pages
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
          <View style={styles.contentCard}>
            <View style={styles.settingRowVertical}>{renderSearchField(p)}</View>
            {browseList}
          </View>
        ) : (
          <>
            <View style={[styles.contentCard, styles.searchWithBack]}>{renderSearchField(p)}</View>
            {p === "model" ? renderDetail() : searchList && <View style={styles.contentCard}>{searchList}</View>}
          </>
        )}
      </ScrollView>

      {/* floats over the scroll like the settings back button */}
      {p !== "browse" && (
        <View style={styles.backWrapper} pointerEvents="box-none">
          <DrawerBackButton
            kind="back"
            onPress={handleBack}
            scrolled={scrolled}
            pulseKey={p === "model" ? detail?.repo : p}
          />
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
        visible={!!pending}
        title={t("hubModels.downloadTitle", { name: pending ? fileStem(pending.file) : "" })}
        message={t("hubModels.downloadMessage", { size: formatBytes(pending?.size ?? 0) })}
        onClose={() => setPending(null)}
        buttons={[
          { text: t("common.cancel"), style: "secondary", onPress: () => setPending(null) },
          { text: t("hubModels.download"), style: "primary", onPress: download },
        ]}
      />
    </DrawerSheet>
  );
}

//same values as the on-device add model sheet
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
    highlightGroup: {
      backgroundColor: Colors.primary,
      borderColor: Colors.borderOnPrimary,
    },
    highlightGroupDisabled: {
      opacity: 0.5,
    },
    infoValue: {
      flexShrink: 1,
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
      color: Colors.textMuted,
      textAlign: "right",
      maxWidth: "60%",
    },
    infoValueActive: {
      color: Colors.textPrimary,
    },
    families: {
      gap: Spacing.xxl,
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
    },
    tileImage: {
      width: "100%",
      height: "100%",
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
    detailDownload: {
      marginTop: Spacing.lg2,
    },
    detailSection: {
      marginTop: Spacing.xxl,
    },
  });
