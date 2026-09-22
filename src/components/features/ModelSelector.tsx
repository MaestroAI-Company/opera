import LottieView from "lottie-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  DeviceEventEmitter,
  Image,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  Vibration,
  View,
  ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
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
import { AIModule } from "../../services/ai/AIModule";
import { getAICoreModelLabel } from "../../services/ai/providers/AICoreProvider";
import {
  getCachedModels,
  getLastModel,
  hydrateModelCache,
  setCachedModels,
  setLastModel,
} from "../../services/ai/providers/modelCache";
import { buildSources, ModelSource } from "../../services/ai/providers/sources";
import { AppEvents } from "../../services/events";
import Group from "../ui/Group";
import NotificationModal from "../ui/NotificationModal";
import ProgressBar from "../ui/ProgressBar";
import SliderToggle, { SliderToggleOption } from "../ui/SliderToggle";
import { settleDrawer } from "./drawerAnimation";
import DrawerSheet from "./DrawerSheet";

const botIcon = require("../../../assets/icons/bot.png");
const downloadIcon = require("../../../assets/icons/download.png");
const tokenIcon = require("../../../assets/icons/token.png");
const quickIcon = require("../../../assets/icons/Quick.png");
const lowIcon = require("../../../assets/icons/Low.png");
const highIcon = require("../../../assets/icons/High.png");
const loadingAnimation = require("../../../assets/animations/loading.json");

const REFLECTION_ICONS = { none: quickIcon, low: lowIcon, high: highIcon };

const LONG_PRESS_DELAY = 180;
const BREAK_RATIO = 0.85;
const ROW_GAP = 4;
const MAX_MODELS_HEIGHT = 240;

//panel hangs this far below trigger
const ANCHOR_GAP = 8;
const ANCHOR_MARGIN = 8;
const DESKTOP_CARD_WIDTH = 320;

type RowLayout = { y: number; height: number } | null;

//rubber-band curve for vertical pull
const rubberBand = (d: number, dim: number) => {
  "worklet";
  if (dim <= 0) return 0;
  const sign = d < 0 ? -1 : 1;
  return sign * dim * (1 - 1 / (1 + Math.abs(d) / dim));
};

export type ModelSelectorTriggerProps = {
  selectedModel: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  //desktop drops panel under button
  viewRef?: React.Ref<View>;
};

//button trigger in topbar
export function ModelSelectorTrigger({
  selectedModel,
  onPress,
  style,
  viewRef,
}: ModelSelectorTriggerProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);

  const displayName = (model: string) =>
    model.startsWith("aicore-") ? getAICoreModelLabel(model) : model;

  return (
    <View style={[styles.container, style]} ref={viewRef} collapsable={false}>
      <View style={styles.shadowLayer}>
        <View style={styles.shadowBlock} />
        <Pressable
          onPress={onPress}
          style={({ pressed, hovered }) => [
            styles.trigger,
            (pressed || hovered) && { backgroundColor: Colors.surfacePressed },
          ]}
        >
          <Image source={botIcon} style={styles.icon} />
          <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">
            {selectedModel ? displayName(selectedModel) : "Modèle"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export type ModelSelectorDrawerProps = {
  visible: boolean;
  onClose: () => void;
  //owned by the caller so its own gesture handler (e.g. a swipe-up on the home screen)
  //can drag it live, same as conversationsProgress/settingsProgress
  progress: Animated.Value;
  selectedModel: string;
  selectedReflection: string;
  showReflection: boolean;
  onModelChange: (model: string) => void;
  onReflectionChange: (reflection: string) => void;
  aiService: string;
  ollamaUrl: string;
  onServiceChange: (service: string, ollamaUrl: string) => void;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
  //trigger to hang panel under
  triggerRef?: React.RefObject<View | null>;
};

//fluid drawer, built the same way as ConversationsDrawer/SettingsDrawer: mounted at the screen
//root, driven by PanResponder + spring, no Modal involved
export function ModelSelectorDrawer({
  visible,
  onClose,
  progress,
  selectedModel,
  selectedReflection,
  showReflection,
  onModelChange,
  onReflectionChange,
  aiService,
  ollamaUrl,
  onServiceChange,
  isLargeScreen = false,
  isDesktop = false,
  triggerRef,
}: ModelSelectorDrawerProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const t = useT();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  //reflection labels follow the locale
  const reflections: SliderToggleOption[] = useMemo(
    () =>
      (["none", "low", "high"] as const).map((id) => ({
        id,
        label: t(`reflection.${id}`),
        icon: REFLECTION_ICONS[id],
      })),
    [t],
  );

  //anchor must match drawersheet layout
  const anchored = isDesktop || isLargeScreen;

  //remeasured on every open
  const [anchor, setAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  useEffect(() => {
    if (!anchored || !triggerRef?.current) return;
    triggerRef.current.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
    });
  }, [visible, anchored, triggerRef]);

  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  //whole percents keep the repaints down
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);
  const [localAvailable, setLocalAvailable] = useState(false);
  //settings own the source list, this forces a rebuild when they change
  const [sourcesRevision, setSourcesRevision] = useState(0);
  const [browsedKey, setBrowsedKey] = useState<string | null>(null);

  //dismiss settles progress before callback, used when picking a model closes the sheet
  const dismiss = useCallback(() => {
    settleDrawer(progress, false);
    onClose();
  }, [progress, onClose]);

  useEffect(() => {
    AIModule.isModeAvailable("local")
      .then(setLocalAvailable)
      .catch(() => setLocalAvailable(false));
    const sub = DeviceEventEmitter.addListener(AppEvents.settingsChanged, () =>
      setSourcesRevision((r) => r + 1),
    );
    return () => sub.remove();
  }, []);

  //settings may have changed while the panel was closed
  useEffect(() => {
    if (visible) setSourcesRevision((r) => r + 1);
  }, [visible]);

  const sources = useMemo(
    () => buildSources(localAvailable),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revision tracks the settings behind buildSources
    [localAvailable, sourcesRevision],
  );

  //the source the app currently generates with, falls back to the first tab
  const matchesActive = (source?: ModelSource) =>
    !!source &&
    source.service === aiService &&
    (source.service !== "ollama" || source.url === ollamaUrl);
  const activeSource = useMemo(
    () => sources.find(matchesActive) ?? sources[0],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- matchesActive only reads the deps below
    [sources, aiService, ollamaUrl],
  );
  const browsedSource =
    sources.find((s) => s.key === browsedKey) ?? activeSource;
  const isBrowsingActive = matchesActive(browsedSource);

  useEffect(() => {
    //active source changed under us, stop browsing an old tab
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follow the active source again
    setBrowsedKey(null);
  }, [aiService, ollamaUrl]);

  //source of visible rows
  const shownKey = useRef<string | null>(null);
  //source of pending fetch
  const pendingKey = useRef<string | null>(null);

  //refresh keeps seen rows, switch restarts
  const applyModels = (next: string[], sourceKey: string) => {
    const sameSource = shownKey.current === sourceKey;
    shownKey.current = sourceKey;
    setModels((prev) => {
      const kept = sameSource ? prev.filter((m) => next.includes(m)) : [];
      const merged = [...kept, ...next.filter((m) => !kept.includes(m))];
      //nothing moved, keep the same list so the rows are not touched
      const same =
        merged.length === prev.length && merged.every((m, i) => m === prev[i]);
      return same ? prev : merged;
    });
  };

  const fetchModels = useCallback(async (source?: ModelSource) => {
    if (!source) {
      pendingKey.current = null;
      applyModels([], "");
      setIsAvailable(false);
      setHasFetched(true);
      return;
    }
    const key = source.key;
    pendingKey.current = key;
    setLoading(true);
    //stale result must not blank the list
    setHasFetched(false);
    //cache paints while the server answers
    await hydrateModelCache();
    if (pendingKey.current !== key) return;
    applyModels(getCachedModels(key), key);
    try {
      const available = await AIModule.isSourceAvailable(
        source.service,
        source.url,
      );
      if (pendingKey.current !== key) return;
      setIsAvailable(available);
      const fetched = available
        ? await AIModule.getModelsFor(source.service, source.url)
        : [];
      if (pendingKey.current !== key) return;
      applyModels(fetched, key);
      if (available) setCachedModels(key, fetched);
    } catch (error) {
      console.warn(`[ModelSelector] refresh failed for ${key}:`, error);
      if (pendingKey.current !== key) return;
      applyModels([], key);
    } finally {
      if (pendingKey.current === key) {
        setLoading(false);
        setHasFetched(true);
      }
    }
  }, []);

  useEffect(() => {
    //refetch on open and source change
    //picks a model without opening
    if (visible || !selectedModel) fetchModels(browsedSource);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the source key should trigger a refetch
  }, [visible, selectedModel, fetchModels, browsedSource?.key]);

  useEffect(() => {
    //only the active source may correct the selected model
    if (!isBrowsingActive || !browsedSource) return;
    //rows stay with the browsed source
    if (shownKey.current !== browsedSource.key) return;
    if (models.length > 0) {
      if (!selectedModel || !models.includes(selectedModel)) {
        const last = getLastModel(browsedSource.key);
        onModelChange(models.includes(last) ? last : models[0]);
      } else {
        setLastModel(browsedSource.key, selectedModel);
      }
    } else if (hasFetched && !loading && selectedModel) {
      onModelChange("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the source key stands for browsedSource
  }, [
    models,
    selectedModel,
    loading,
    hasFetched,
    isBrowsingActive,
    onModelChange,
    browsedSource?.key,
  ]);

  useEffect(() => {
    if (selectedModel) {
      AIModule.preloadModel(selectedModel).catch(console.error);
    }
  }, [selectedModel, aiService]);

  const handlePullModel = () => {
    const source = browsedSource;
    if (!source) return;
    setDownloadModalVisible(false);
    setIsDownloading(true);
    setDownloadPercent(0);
    AIModule.downloadFor(source.service, source.url, "gemma4", (progress) =>
      setDownloadPercent(Math.round(progress * 100)),
    )
      .then(() => fetchModels(source))
      .catch(console.error)
      .finally(() => setIsDownloading(false));
  };

  const handleSelectModel = (model: string) => {
    const source = browsedSource;
    if (source && !isBrowsingActive)
      onServiceChange(source.service, source.url);
    if (source) setLastModel(source.key, model);
    onModelChange(model);
  };

  //tab switch restores its last model
  const handleSelectSource = (source: ModelSource) => {
    setBrowsedKey(source.key);
    if (matchesActive(source)) return;
    onServiceChange(source.service, source.url);
    const last = getLastModel(source.key);
    if (last) onModelChange(last);
  };

  //friendly label for aicore variants
  const displayName = (model: string) =>
    model.startsWith("aicore-") ? getAICoreModelLabel(model) : model;

  const displayModels = useMemo(() => {
    return [...models].sort((a, b) => a.localeCompare(b));
  }, [models]);

  const selectedIndex = isBrowsingActive
    ? displayModels.findIndex((m) => m === selectedModel)
    : -1;

  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [rowLayoutsVersion, setRowLayoutsVersion] = useState(0);

  const pillY = useSharedValue(0);
  const pillHeight = useSharedValue(0);
  const pillScale = useSharedValue(1);
  const pillLit = useSharedValue(0);
  const dragStartY = useSharedValue(0);
  const dragIndex = useSharedValue(0);

  const rowLayoutsRef = useRef<({ y: number; height: number } | undefined)[]>(
    [],
  );

  const activeIndex = previewIndex ?? (selectedIndex >= 0 ? selectedIndex : 0);
  const hasPill = isBrowsingActive && selectedIndex >= 0;

  const handleRowLayout = (index: number) => (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    const existing = rowLayoutsRef.current[index];
    if (existing && existing.y === y && existing.height === height) return;
    rowLayoutsRef.current[index] = { y, height };
    setRowLayoutsVersion((v) => v + 1);
  };

  //reset measured rows on change
  const modelsKey = displayModels.join("|");
  useEffect(() => {
    rowLayoutsRef.current = [];
    setRowLayoutsVersion((v) => v + 1);
  }, [modelsKey]);

  //park pill on selected slot
  useEffect(() => {
    if (previewIndex !== null) return;
    if (selectedIndex < 0 || selectedIndex >= displayModels.length) return;
    const layout = rowLayoutsRef.current[selectedIndex];
    if (!layout) return;
    pillY.value = withTiming(layout.y, { duration: 180 });
    pillHeight.value = withTiming(layout.height, { duration: 180 });
  }, [
    selectedModel,
    rowLayoutsVersion,
    visible,
    selectedIndex,
    displayModels.length,
    pillY,
    pillHeight,
  ]);

  //dense snapshot the drag worklet can read
  const rowLayouts = useMemo<RowLayout[]>(
    () =>
      Array.from(
        { length: displayModels.length },
        (_, i) => rowLayoutsRef.current[i] ?? null,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version tracks the mutable ref
    [displayModels.length, rowLayoutsVersion],
  );

  const previewCrossed = (index: number) => {
    setPreviewIndex(index);
    Vibration.vibrate(10);
  };

  const commitDrag = (index: number) => {
    setPreviewIndex(null);
    const model = displayModels[index];
    if (model) handleSelectModel(model);
  };

  //long press arms the drag, so the list still scrolls under a plain swipe
  const pillPan = Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_DELAY)
    .onStart(() => {
      dragStartY.value = pillY.value;
      dragIndex.value = selectedIndex;
      pillScale.value = withTiming(1.04, { duration: 120 });
      pillLit.value = withTiming(1, { duration: 120 });
    })
    .onUpdate((e) => {
      let anchor = dragIndex.value;
      const current = rowLayouts[anchor];
      if (!current) return;
      const rawY = dragStartY.value + e.translationY;

      let d = rawY - current.y;
      let slot = current.height + ROW_GAP;
      while (Math.abs(d) >= slot * BREAK_RATIO) {
        const next = anchor + (d > 0 ? 1 : -1);
        const nextLayout = rowLayouts[next];
        if (!nextLayout) break;
        anchor = next;
        d = rawY - nextLayout.y;
        slot = nextLayout.height + ROW_GAP;
      }

      if (anchor !== dragIndex.value) {
        dragIndex.value = anchor;
        runOnJS(previewCrossed)(anchor);
      }

      const layout = rowLayouts[anchor]!;
      pillY.value = layout.y + rubberBand(d, slot);
      pillHeight.value = withTiming(layout.height, { duration: 100 });
    })
    .onEnd(() => {
      const layout = rowLayouts[dragIndex.value];
      if (layout) {
        pillY.value = withTiming(layout.y, { duration: 150 });
        pillHeight.value = withTiming(layout.height, { duration: 150 });
      }
      runOnJS(commitDrag)(dragIndex.value);
    })
    .onFinalize((_e, success) => {
      pillScale.value = withTiming(1, { duration: 150 });
      pillLit.value = withTiming(0, { duration: 150 });
      //cancelled mid-drag, snap back to the selected row
      if (!success) {
        const layout = rowLayouts[selectedIndex];
        if (layout) {
          pillY.value = withTiming(layout.y, { duration: 150 });
          pillHeight.value = withTiming(layout.height, { duration: 150 });
        }
        runOnJS(setPreviewIndex)(null);
      }
    });

  const pillAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pillY.value }, { scale: pillScale.value }],
    height: pillHeight.value,
    backgroundColor: interpolateColor(
      pillLit.value,
      [0, 1],
      [Colors.primary, Colors.primaryBright],
    ),
  }));

  const innerContent = (
    <View style={styles.sheetInner}>
      <View style={styles.tabsRow}>
        {sources.map((source) => {
          const active = source.key === browsedSource?.key;
          return (
            <Pressable
              key={source.key}
              onPress={() => handleSelectSource(source)}
              style={({ pressed, hovered }) => [
                styles.tab,
                (pressed || hovered) && {
                  backgroundColor: Colors.overlaySubtle,
                },
              ]}
            >
              <Text
                style={[styles.tabText, active && styles.tabTextActive]}
                numberOfLines={1}
              >
                {source.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.modelsBox}>
        <ScrollView
          style={{ maxHeight: MAX_MODELS_HEIGHT }}
          contentContainerStyle={styles.modelsScrollContent}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={true}
        >
          {sources.length === 0 ? (
            <Text style={styles.emptyText}>
              No provider enabled, turn one on in Settings → Service
            </Text>
          ) : loading && models.length === 0 ? (
            <View style={styles.loadingRow}>
              <LottieView
                source={loadingAnimation}
                autoPlay
                loop
                style={{ width: 24, height: 16 }}
              />
              <Text style={styles.modelStatus}>
                {t("modelSelector.loading")}
              </Text>
            </View>
          ) : models.length === 0 ? (
            <View>
              <Text style={styles.emptyText}>
                {isAvailable
                  ? t("modelSelector.noModels")
                  : t("modelSelector.unreachable")}
              </Text>
              {isAvailable && browsedSource?.service === "ollama" && (
                <Pressable
                  disabled={isDownloading}
                  onPress={() => setDownloadModalVisible(true)}
                  style={({ pressed, hovered }) => [
                    styles.downloadOption,
                    (pressed || hovered) && {
                      backgroundColor: Colors.surfacePressed,
                    },
                  ]}
                >
                  <Image source={downloadIcon} style={styles.downloadIcon} />
                  <Text style={styles.downloadText}>
                    {isDownloading
                      ? `${t("modelSelector.downloading")} ${downloadPercent}%`
                      : "gemma4"}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.optionsList}>
              {displayModels.map((model, index) => {
                const selected = isBrowsingActive && model === selectedModel;
                const isSpecialActive = !hasPill && selected;
                return (
                  <Pressable
                    key={model}
                    onLayout={handleRowLayout(index)}
                    onPress={() => {
                      Vibration.vibrate(10);
                      handleSelectModel(model);
                    }}
                    style={({ pressed, hovered }) => [
                      styles.option,
                      isSpecialActive
                        ? styles.optionSelected
                        : (pressed || hovered) && {
                            backgroundColor: Colors.overlaySubtle,
                          },
                      isSpecialActive &&
                        (pressed || hovered) && {
                          backgroundColor: Colors.primaryActive,
                        },
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isSpecialActive && styles.optionTextSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {displayName(model)}
                    </Text>
                  </Pressable>
                );
              })}
              {hasPill && rowLayoutsRef.current[activeIndex] && (
                <GestureDetector gesture={pillPan}>
                  <Reanimated.View style={[styles.pill, pillAnimatedStyle]}>
                    <Text
                      style={[styles.optionText, styles.optionTextSelected]}
                      numberOfLines={1}
                    >
                      {displayName(displayModels[activeIndex])}
                    </Text>
                  </Reanimated.View>
                </GestureDetector>
              )}
            </View>
          )}
        </ScrollView>
      </View>

      {showReflection && (
        <View style={styles.reflectionRow}>
          <Group>
            <SliderToggle
              selectedValue={selectedReflection}
              onSelect={onReflectionChange}
              options={reflections}
            />
          </Group>
        </View>
      )}

      <View style={styles.downloadProgressRow}>
        <Group>
          <ProgressBar progress={0} icon={tokenIcon} />
          <Text style={styles.tokenMaxLabel}>Token max :</Text>
        </Group>
      </View>
    </View>
  );

  //card hangs under its trigger
  const anchoredStyle = anchor
    ? {
        position: "absolute" as const,
        top: anchor.y + anchor.height + ANCHOR_GAP,
        left: Math.max(
          ANCHOR_MARGIN,
          Math.min(
            anchor.x + anchor.width / 2 - DESKTOP_CARD_WIDTH / 2,
            windowWidth - DESKTOP_CARD_WIDTH - ANCHOR_MARGIN,
          ),
        ),
      }
    : null;

  return (
    <>
      <DrawerSheet
        visible={visible}
        onClose={onClose}
        mode="overlay"
        progress={progress}
        isLargeScreen={isLargeScreen}
        isDesktop={isDesktop}
        sheetStyle={[
          styles.mobileSheet,
          { paddingBottom: (Platform.OS === "ios" ? 20 : 10) + insets.bottom },
        ]}
        desktopStyle={[styles.desktopCard, anchoredStyle]}
        handleContainerStyle={styles.handleContainer}
        handleStyle={styles.dragHandle}
      >
        {innerContent}
      </DrawerSheet>

      <NotificationModal
        visible={downloadModalVisible}
        title={t("modelSelector.download.title")}
        icon={downloadIcon}
        message={t("modelSelector.download.message")}
        onClose={() => setDownloadModalVisible(false)}
        buttons={[
          {
            text: t("common.cancel"),
            onPress: () => setDownloadModalVisible(false),
            style: "secondary",
          },
          {
            text: t("modelSelector.download.confirm"),
            onPress: handlePullModel,
            style: "primary",
          },
        ]}
      />
    </>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
    },
    shadowLayer: {
      position: "relative",
    },
    shadowBlock: {
      position: "absolute",
      top: 4,
      left: -4,
      right: 4,
      height: 44,
      backgroundColor: Colors.shadowInk,
      borderRadius: Radius.xxl,
    },
    trigger: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 2,
      borderColor: Colors.border,
      paddingHorizontal: 12,
      height: 44,
      backgroundColor: Colors.surface,
      gap: 8,
      borderRadius: Radius.xxl,
      maxWidth: 180,
      overflow: "hidden",
      position: "relative",
      zIndex: 1,
    },
    icon: {
      width: 18,
      height: 18,
      tintColor: Colors.textPrimary,
    },
    label: {
      fontSize: FontSizes.body,
      color: Colors.textPrimary,
      fontFamily: Fonts.mono,
      flexShrink: 1,
    },
    desktopCard: {
      width: DESKTOP_CARD_WIDTH,
      backgroundColor: Colors.surface,
      borderRadius: Radius.xxl,
      borderWidth: 2,
      borderColor: Colors.border,
      boxShadow: `-6px 6px 0px ${Colors.shadowInk}`,
      elevation: 5,
      overflow: "hidden",
      padding: 16,
    },
    mobileSheet: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: Colors.surface,
      borderTopLeftRadius: Radius.huge2,
      borderTopRightRadius: Radius.huge2,
      borderBottomLeftRadius: Radius.xxl,
      borderBottomRightRadius: Radius.xxl,
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    handleContainer: {
      alignItems: "center",
      paddingVertical: 6,
      marginBottom: 8,
    },
    dragHandle: {
      width: 36,
      height: 4,
      borderRadius: Radius.pill,
      backgroundColor: Colors.textMuted,
    },
    sheetInner: {
      width: "100%",
    },
    tabsRow: {
      flexDirection: "row",
      justifyContent: "center",
      gap: Spacing.xxl,
      marginBottom: 12,
    },
    tab: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: Radius.md,
      flexShrink: 1,
    },
    tabText: {
      fontSize: FontSizes.body,
      color: Colors.textPrimary,
      fontFamily: Fonts.mono,
    },
    tabTextActive: {
      color: Colors.primary,
    },
    modelsBox: {
      borderWidth: 2,
      borderColor: Colors.border,
      borderRadius: Radius.xxl,
      overflow: "hidden",
    },
    modelsScrollContent: {
      paddingHorizontal: 6,
      paddingVertical: 6,
    },
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 8,
    },
    modelStatus: {
      fontSize: FontSizes.label,
      color: Colors.textMuted,
      fontStyle: "italic",
    },
    emptyText: {
      color: Colors.error,
      textAlign: "center",
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: FontSizes.caption,
      fontFamily: Fonts.body,
    },
    optionsList: {
      position: "relative",
    },
    pill: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      borderRadius: Radius.md,
      borderWidth: 2,
      borderColor: Colors.borderOnPrimary,
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: Radius.md,
      marginBottom: 4,
      borderWidth: 2,
      borderColor: "transparent",
    },
    optionSelected: {
      backgroundColor: Colors.primary,
      borderWidth: 2,
      borderColor: Colors.borderOnPrimary,
    },
    optionText: {
      fontSize: FontSizes.body,
      color: Colors.textPrimary,
      fontFamily: Fonts.mono,
    },
    optionTextSelected: {
      color: Colors.textOnPrimary,
    },
    reflectionRow: {
      marginTop: 12,
    },
    downloadProgressRow: {
      marginTop: 12,
    },
    tokenMaxLabel: {
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
      color: Colors.textSecondary,
      paddingHorizontal: Spacing.lg2,
      paddingBottom: Spacing.sm,
    },
    downloadOption: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: Colors.surfaceSubtle,
      padding: 10,
      borderRadius: Radius.xl,
      borderWidth: 1,
      borderColor: Colors.codeBlockText,
      borderStyle: "dashed",
      gap: 8,
      marginVertical: 4,
    },
    downloadIcon: {
      width: 16,
      height: 16,
      tintColor: Colors.textPrimary,
    },
    downloadText: {
      fontSize: FontSizes.caption,
      color: Colors.linkAlt,
      fontFamily: Fonts.mono,
    },
  });
