import LottieView from "lottie-react-native";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  DeviceEventEmitter,
  Image,
  ImageSourcePropType,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
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
import { type ModelCapabilityId } from "../../../constants/modelCapabilities";
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
import { getLocalModelLabel, isLocalModel } from "../../services/ai/providers/LocalProvider";
import { getLiteRTModelLabel, isLiteRTModel, subscribeLiteRTDownload } from "../../services/ai/providers/LiteRTProvider";
import { getCachedModels, getLastModel, hydrateModelCache, setCachedModels, setLastModel } from "../../services/ai/providers/modelCache";
import { buildSources, getOllamaTuning, ModelSource } from "../../services/ai/providers/sources";
import { estimateContextTokens } from "../../services/ai/generation/chatGeneration";
import { MessageMetrics } from "../../services/db/DatabaseService";
import { AppEvents } from "../../services/events";
import { Settings } from "../../services/settings/SettingsService";
import Group from "../ui/Group";
import NotificationModal from "../ui/NotificationModal";
import ProgressBar from "../ui/ProgressBar";
import SliderToggle, { SliderToggleOption } from "../ui/SliderToggle";
import DrawerSheet from "./DrawerSheet";
import { pressStyle } from "../ui/pressStyle";

const botIcon = require("../../../assets/icons/bot.png");
const downloadIcon = require("../../../assets/icons/download.png");
const tokenIcon = require("../../../assets/icons/token.png");
const quickIcon = require("../../../assets/icons/Quick.png");
const lowIcon = require("../../../assets/icons/Low.png");
const highIcon = require("../../../assets/icons/High.png");
const visionIcon = require("../../../assets/icons/vision.png");
const micIcon = require("../../../assets/icons/micro.png");
const videoIcon = require("../../../assets/icons/camera.png");
const toolIcon = require("../../../assets/icons/tool2.png");
const brainIcon = require("../../../assets/icons/brain.png");
const loadingAnimation = require("../../../assets/animations/loading.json");

const REFLECTION_ICONS = { none: quickIcon, low: lowIcon, high: highIcon };
//first entry sits far right
//sheet draws its own icons
const CAPABILITY_ICONS = [
  { id: "vision", icon: visionIcon },
  { id: "video", icon: videoIcon },
  { id: "audio", icon: micIcon },
  { id: "thinking", icon: brainIcon },
  { id: "tools", icon: toolIcon },
] as const satisfies readonly {
  id: ModelCapabilityId;
  icon: ImageSourcePropType;
}[];

const LONG_PRESS_DELAY = 180;
const BREAK_RATIO = 0.85;
const ROW_GAP = 4;
const MAX_MODELS_HEIGHT = 240;
const DESKTOP_MODELS_HEIGHT = 400;
const MODELS_PADDING = 6;
//stepped window, buffered both sides
const WINDOW_STEP = 10;
const WINDOW_BUFFER = 20;

//panel hangs this far below trigger
const ANCHOR_GAP = 8;
const ANCHOR_MARGIN = 8;
const ANCHORED_CARD_WIDTH = 320;
const CENTERED_CARD_WIDTH = 640;

//context size configured for the active source
const contextWindowFor = (service: string, ollamaUrl: string) => {
  if (service === "litert") return Settings.getCached().litertContextLength;
  //beta shares the ollama tuning
  if (service === "ollama" || service === "beta") return getOllamaTuning(ollamaUrl).contextLength;
  return 0;
};

type RowLayout = { y: number; height: number } | null;

//clamps centered offset to scroll bounds
const centeredOffset = (start: number, size: number, viewport: number, content: number) =>
  Math.max(0, Math.min(start + size / 2 - viewport / 2, content - viewport));

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
  const styles = useThemedStyles(makeStyles);
  const t = useT();

  const displayName = (model: string) =>
    isLocalModel(model) ? getLocalModelLabel(model, true)
      : isLiteRTModel(model) ? getLiteRTModelLabel(model)
        : model;

  return (
    <View style={[styles.container, style]} ref={viewRef} collapsable={false}>
      <View style={styles.shadowLayer}>
        <View style={styles.shadowBlock} />
        <Pressable
          onPress={onPress}
          style={pressStyle(styles.trigger, "surface")}
        >
          <Image source={botIcon} style={styles.icon} />
          <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">
            {selectedModel ? displayName(selectedModel) : t("modelSelector.placeholder")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function Capabilities({ caps, onPrimary = false }: { caps: string; onPrimary?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const shown = CAPABILITY_ICONS.filter((c) => caps.split(",").includes(c.id));
  if (shown.length === 0) return null;
  return (
    <View style={styles.capabilitiesRow}>
      {shown.map((c) => (
        <Image
          key={c.id}
          source={c.icon}
          style={[styles.capabilityIcon, onPrimary && styles.capabilityIconOnPrimary]}
        />
      ))}
    </View>
  );
}

type ModelRowProps = {
  model: string;
  label: string;
  caps: string;
  highlighted: boolean;
  //0 until measured
  height: number;
  onSelect: (model: string) => void;
  onRowLayout: (e: LayoutChangeEvent) => void;
};

//memoized, drawer state skips these rows
const ModelRow = memo(function ModelRow({
  model,
  label,
  caps,
  highlighted,
  height,
  onSelect,
  onRowLayout,
}: ModelRowProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onLayout={onRowLayout}
      onPress={() => {
        Vibration.vibrate(10);
        onSelect(model);
      }}
      style={pressStyle(
        [styles.option, highlighted && styles.optionSelected, height > 0 && { height }],
        highlighted ? { backgroundColor: Colors.primaryActive } : "subtle",
      )}
    >
      <Text
        style={[styles.optionText, highlighted && styles.optionTextSelected]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Capabilities caps={caps} onPrimary={highlighted} />
    </Pressable>
  );
});

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
  //current conversation, fills the token window
  messages?: { content: string; images?: string[]; metrics?: MessageMetrics }[];
  onOpenProviderSettings?: (provider: string) => void;
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
  messages = [],
  onOpenProviderSettings,
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

  //tablet hangs the card under its trigger, desktop centers it
  const anchored = isLargeScreen && !isDesktop;

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
  //source the shown rows belong to
  const [modelsKey, setModelsKey] = useState("");
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

  useEffect(() => {
    AIModule.isModeAvailable("local").then(setLocalAvailable).catch(() => setLocalAvailable(false));
    const sub = DeviceEventEmitter.addListener(AppEvents.settingsChanged, () => setSourcesRevision((r) => r + 1));
    //downloaded models must appear here too
    const unsubscribe = subscribeLiteRTDownload((_, snapshot) => {
      if (!snapshot) setSourcesRevision((r) => r + 1);
    });
    return () => { sub.remove(); unsubscribe(); };
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
    (!source.url || source.url === ollamaUrl);
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
    setModelsKey(sourceKey);
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
      //offline rows must not be cached
      setCachedModels(key, fetched);
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

  //picking a model must not refetch
  const needsModel = !selectedModel;
  useEffect(() => {
    //refetch on open and source change
    //picks a model without opening
    if (visible || needsModel) fetchModels(browsedSource);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the source key should trigger a refetch
  }, [visible, needsModel, fetchModels, browsedSource?.key]);

  useEffect(() => {
    //cache may be from offline server
    if (!hasFetched || loading) return;
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
    } else if (selectedModel) {
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

  //selected row waits to be centered
  const pendingModelScroll = useRef(false);

  const handleSelectModel = (model: string) => {
    const source = browsedSource;
    if (source && !isBrowsingActive)
      onServiceChange(source.service, source.url);
    if (source) setLastModel(source.key, model);
    onModelChange(model);
  };

  //ref keeps callback stable for memo
  const selectModelRef = useRef(handleSelectModel);
  useEffect(() => {
    selectModelRef.current = handleSelectModel;
  });
  const handleRowSelect = useCallback((model: string) => {
    //tapped row is already in view
    pendingModelScroll.current = false;
    selectModelRef.current(model);
  }, []);

  //tab switch restores its last model
  const handleSelectSource = (source: ModelSource) => {
    //open provider settings on reselect
    if (browsedSource && source.key === browsedSource.key) {
      if (onOpenProviderSettings) {
        onClose();
        onOpenProviderSettings(source.service);
      }
      return;
    }
    setBrowsedKey(source.key);
    if (matchesActive(source)) return;
    onServiceChange(source.service, source.url);
    const last = getLastModel(source.key);
    if (last) onModelChange(last);
  };

  //friendly label for local variants
  const displayName = (model: string) =>
    isLocalModel(model) ? getLocalModelLabel(model, true)
      : isLiteRTModel(model) ? getLiteRTModelLabel(model)
        : model;

  const displayModels = useMemo(() => {
    return [...models].sort((a, b) => a.localeCompare(b));
  }, [models]);

  //keyed by source and model
  const [capabilities, setCapabilities] = useState<Record<string, string[]>>({});
  const capsKey = (model: string) => `${browsedSource?.key}:${model}`;
  useEffect(() => {
    //confirmed rows, offline would hang
    if (!visible || !hasFetched || !isAvailable || !browsedSource) return;
    if (shownKey.current !== browsedSource.key) return;
    const source = browsedSource;
    Promise.all(
      models.map((model) =>
        AIModule.getModelCapabilitiesFor(source.service, source.url, model)
          .then((caps) => [`${source.key}:${model}`, caps] as const)
          .catch(() => [`${source.key}:${model}`, [] as string[]] as const),
      ),
    ).then((entries) =>
      setCapabilities((prev) => ({ ...prev, ...Object.fromEntries(entries) })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the source key stands for browsedSource
  }, [visible, hasFetched, isAvailable, models, browsedSource?.key]);

  //joined, memo compares by value
  const capsOf = (model: string) => (capabilities[capsKey(model)] ?? []).join(",");

  //visible refreshes instruction and tools
  const usedTokens = useMemo(
    () => estimateContextTokens(selectedModel, Settings.getCached().instruction, messages),
    [messages, selectedModel, visible],
  );
  //built-in models report their own window
  const [localContextTokens, setLocalContextTokens] = useState(0);
  useEffect(() => {
    if (!visible || aiService !== "local") return;
    AIModule.getLocalModelSheet()
      .then((sheet) => setLocalContextTokens(sheet?.models.find((m) => m.id === selectedModel)?.contextTokens ?? 0))
      .catch(() => setLocalContextTokens(0));
  }, [visible, aiService, selectedModel]);
  const contextWindow = aiService === "local" ? localContextTokens : contextWindowFor(aiService, ollamaUrl);
  const showTokenWindow = messages.length > 0 && contextWindow > 0;

  const selectedIndex = isBrowsingActive
    ? displayModels.findIndex((m) => m === selectedModel)
    : -1;

  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const pillY = useSharedValue(0);
  const pillHeight = useSharedValue(0);
  const pillScale = useSharedValue(1);
  const pillLit = useSharedValue(0);
  const dragStartY = useSharedValue(0);
  const dragIndex = useSharedValue(0);

  const activeIndex = previewIndex ?? (selectedIndex >= 0 ? selectedIndex : 0);
  const hasPill = isBrowsingActive && selectedIndex >= 0;

  //one height, scroll math stays exact
  const [rowHeight, setRowHeight] = useState(0);
  const rowStride = rowHeight + ROW_GAP;
  const handleRowLayout = useCallback((e: LayoutChangeEvent) => {
    const measured = e.nativeEvent.layout.height;
    //fallback glyphs grow rows, min wins
    setRowHeight((h) => (h === 0 ? measured : Math.min(h, measured)));
  }, []);

  //viewport height drives mounted rows
  const [listViewport, setListViewport] = useState(0);
  //keyed by source, resets on switch
  const [windowState, setWindowState] = useState({ key: "", start: 0 });
  const visibleRows = rowHeight ? Math.ceil(listViewport / rowStride) : 0;
  //stepped so scrolling rerenders rarely
  const stepStart = (row: number) => Math.max(0, Math.floor(row / WINDOW_STEP) * WINDOW_STEP);
  //new list opens at its selection
  const windowStart =
    windowState.key === modelsKey
      ? windowState.start
      : stepStart(selectedIndex - Math.floor(visibleRows / 2));
  //shorter list after a source switch
  const clampedStart = Math.min(windowStart, Math.max(0, displayModels.length - visibleRows));
  const firstRow = rowHeight ? Math.max(0, clampedStart - WINDOW_BUFFER) : 0;
  const lastRow = rowHeight
    ? clampedStart + visibleRows + WINDOW_STEP + WINDOW_BUFFER
    : WINDOW_BUFFER;

  const moveWindowTo = (offsetY: number) => {
    if (!rowHeight) return;
    const start = stepStart(Math.floor((offsetY - MODELS_PADDING) / rowStride));
    setWindowState((prev) =>
      prev.key === modelsKey && prev.start === start ? prev : { key: modelsKey, start },
    );
  };

  const handleModelsScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    moveWindowTo(e.nativeEvent.contentOffset.y);

  //dense snapshot the drag worklet can read
  const rowLayouts = useMemo<RowLayout[]>(
    () => displayModels.map((_, i) => (rowHeight ? { y: i * rowStride, height: rowHeight } : null)),
    [displayModels, rowHeight, rowStride],
  );
  //row highlights itself until measured
  const pillShown = hasPill && !!rowLayouts[activeIndex];

  //centers a row, 0 if none
  const offsetFor = (index: number) => {
    const layout = rowLayouts[index];
    if (!layout || !listViewport) return 0;
    const content = displayModels.length * rowStride + MODELS_PADDING * 2;
    return centeredOffset(layout.y + MODELS_PADDING, layout.height, listViewport, content);
  };
  //once per source, later moves scrollTo
  const initialOffset = useMemo(
    () => offsetFor(selectedIndex),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a tap must not move a mounted list
    [modelsKey, rowHeight, listViewport],
  );

  //pill parked on this list
  const parkedKey = useRef<string | null>(null);

  //parks pill on selected before paint
  useLayoutEffect(() => {
    if (previewIndex !== null) return;
    const layout = rowLayouts[selectedIndex];
    if (!layout) return;
    //new list, no sliding in
    if (parkedKey.current !== modelsKey) {
      parkedKey.current = modelsKey;
      pillY.value = layout.y;
      pillHeight.value = layout.height;
      return;
    }
    pillY.value = withTiming(layout.y, { duration: 180 });
    pillHeight.value = withTiming(layout.height, { duration: 180 });
  }, [
    previewIndex,
    rowLayouts,
    visible,
    selectedIndex,
    modelsKey,
    pillY,
    pillHeight,
  ]);

  //tab geometry in refs, no rerender
  const tabsScrollRef = useRef<ScrollView>(null);
  const modelsScrollRef = useRef<ScrollView>(null);
  const tabLayoutsRef = useRef<Record<string, { x: number; width: number }>>({});
  const tabsBox = useRef({ viewport: 0, content: 0 });
  //no glide before layout settles
  const tabsAnimated = useRef(false);

  const scrollTabIntoView = () => {
    const layout = browsedSource && tabLayoutsRef.current[browsedSource.key];
    const { viewport, content } = tabsBox.current;
    if (!visible || !layout || !viewport || !content) return;
    tabsScrollRef.current?.scrollTo({
      x: centeredOffset(layout.x, layout.width, viewport, content),
      animated: tabsAnimated.current,
    });
    tabsAnimated.current = true;
  };

  const scrollModelIntoView = () => {
    if (!pendingModelScroll.current) return;
    //rows may be previous source
    if (shownKey.current !== browsedSource?.key) return;
    if (!rowHeight || !listViewport) return;
    const layout = rowLayouts[selectedIndex];
    const y = offsetFor(selectedIndex);
    modelsScrollRef.current?.scrollTo({ y, animated: false });
    //programmatic scroll may not fire onScroll
    moveWindowTo(y);
    //selection may arrive after fetch
    if (layout) pendingModelScroll.current = false;
  };

  //recenter on open or source switch
  useLayoutEffect(() => {
    if (!visible) {
      tabsAnimated.current = false;
      return;
    }
    pendingModelScroll.current = true;
    scrollTabIntoView();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window follows the native scroll
    scrollModelIntoView();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the source key stands for browsedSource
  }, [visible, browsedSource?.key]);

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window follows the native scroll
    scrollModelIntoView();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- retries once rows or selection settle
  }, [rowLayouts, selectedIndex, listViewport]);

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

  const tabs = sources.map((source) => {
    const active = source.key === browsedSource?.key;
    return (
      <Pressable
        key={source.key}
        onLayout={(e) => {
          const { x, width } = e.nativeEvent.layout;
          tabLayoutsRef.current[source.key] = { x, width };
          scrollTabIntoView();
        }}
        onPress={() => handleSelectSource(source)}
        style={pressStyle(styles.tab, "subtle")}
      >
        <Text
          style={[styles.tabText, active && styles.tabTextActive]}
          numberOfLines={1}
        >
          {source.label}
        </Text>
      </Pressable>
    );
  });

  const modelsContent = (
    <>
      <View style={styles.contentCard}>
        <View style={styles.modelsBox}>
          <ScrollView
            ref={modelsScrollRef}
            onLayout={(e) => setListViewport(e.nativeEvent.layout.height)}
            onScroll={handleModelsScroll}
            scrollEventThrottle={16}
            //fresh view, old content clamps offset
            key={modelsKey}
            contentOffset={{ x: 0, y: initialOffset }}
            //fixed on desktop so switching servers never resizes the window
            style={isDesktop ? { height: DESKTOP_MODELS_HEIGHT } : { maxHeight: MAX_MODELS_HEIGHT }}
            contentContainerStyle={styles.modelsScrollContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
          >
            {sources.length === 0 ? (
              <Text style={styles.emptyText}>
                {t("modelSelector.noProvider")}
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
                    style={pressStyle(styles.downloadOption, "surface")}
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
              <View
                style={[
                  styles.optionsList,
                  rowHeight > 0 && { height: displayModels.length * rowStride },
                ]}
              >
                <View style={{ height: firstRow * rowStride }} />
                {displayModels.slice(firstRow, lastRow).map((model) => (
                  <ModelRow
                    key={model}
                    model={model}
                    label={displayName(model)}
                    caps={capsOf(model)}
                    highlighted={!pillShown && isBrowsingActive && model === selectedModel}
                    height={rowHeight}
                    onSelect={handleRowSelect}
                    onRowLayout={handleRowLayout}
                  />
                ))}
                {pillShown && (
                  <GestureDetector gesture={pillPan}>
                    <Reanimated.View style={[styles.pill, pillAnimatedStyle]}>
                      <Text
                        style={[styles.optionText, styles.optionTextSelected]}
                        numberOfLines={1}
                      >
                        {displayName(displayModels[activeIndex])}
                      </Text>
                      <Capabilities caps={capsOf(displayModels[activeIndex])} onPrimary />
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
      </View>

      {showTokenWindow && (
        <View style={[styles.contentCard, styles.downloadProgressRow]}>
          <ProgressBar progress={usedTokens / contextWindow} icon={tokenIcon} />
          <Text style={styles.tokenMaxLabel}>
            {t("modelSelector.tokenWindow")} : {usedTokens} / {contextWindow}
          </Text>
        </View>
      )}
    </>
  );

  //desktop lists the servers on the left, models on the right
  const innerContent = isDesktop ? (
    <View style={styles.desktopBody}>
      <View style={styles.tabsColumn}>{tabs}</View>
      <View style={styles.desktopModels}>{modelsContent}</View>
    </View>
  ) : (
    <View style={styles.sheetInner}>
      <ScrollView
        ref={tabsScrollRef}
        onLayout={(e) => {
          tabsBox.current.viewport = e.nativeEvent.layout.width;
          scrollTabIntoView();
        }}
        onContentSizeChange={(w) => {
          tabsBox.current.content = w;
          scrollTabIntoView();
        }}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsRow}
      >
        {tabs}
      </ScrollView>
      {modelsContent}
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
            anchor.x + anchor.width / 2 - ANCHORED_CARD_WIDTH / 2,
            windowWidth - ANCHORED_CARD_WIDTH - ANCHOR_MARGIN,
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
        anchored={anchored}
        sheetStyle={[
          styles.mobileSheet,
          { paddingBottom: (Platform.OS === "ios" ? 20 : 10) + insets.bottom },
        ]}
        desktopStyle={
          isDesktop ? styles.centeredCard : [styles.anchoredCard, anchoredStyle]
        }
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
      zIndex: 6,
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
    //no close header, pads itself
    anchoredCard: {
      width: ANCHORED_CARD_WIDTH,
      paddingVertical: 16,
      paddingHorizontal: Spacing.lg2,
    },
    centeredCard: {
      width: CENTERED_CARD_WIDTH,
    },
    desktopBody: {
      flexDirection: "row",
      gap: Spacing.lg2,
      paddingHorizontal: Spacing.lg2,
    },
    tabsColumn: {
      width: 180,
      gap: Spacing.xs,
    },
    desktopModels: {
      flex: 1,
    },
    mobileSheet: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: Colors.groupedBackground,
      borderTopLeftRadius: Radius.huge2,
      borderTopRightRadius: Radius.huge2,
      borderBottomLeftRadius: Radius.xxl,
      borderBottomRightRadius: Radius.xxl,
      paddingHorizontal: Spacing.lg2,
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
    tabsScroll: {
      flexGrow: 0,
      marginBottom: Spacing.lg2,
    },
    tabsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.xxl,
      paddingHorizontal: Spacing.xs,
    },
    tab: {
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.xs,
      borderRadius: Radius.md,
      flexShrink: 0,
    },
    tabText: {
      fontSize: FontSizes.body,
      color: Colors.textPrimary,
      fontFamily: Fonts.mono,
    },
    tabTextActive: {
      color: Colors.primary,
    },
    contentCard: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.xxl + Spacing.md,
      borderWidth: 0,
      padding: Spacing.md,
      marginBottom: Spacing.lg2,
    },
    modelsBox: {
      borderWidth: 2,
      borderColor: Colors.border,
      borderRadius: Radius.xxl,
      overflow: "hidden",
    },
    modelsScrollContent: {
      paddingHorizontal: 6,
      paddingVertical: MODELS_PADDING,
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
      flexShrink: 1,
    },
    optionTextSelected: {
      color: Colors.textOnPrimary,
    },
    capabilitiesRow: {
      flexDirection: "row-reverse",
      alignItems: "center",
      gap: Spacing.md,
      marginLeft: "auto",
      paddingLeft: Spacing.md,
    },
    capabilityIcon: {
      width: 16,
      height: 16,
      tintColor: Colors.textPrimary,
      opacity: 0.5,
    },
    capabilityIconOnPrimary: {
      tintColor: Colors.textOnPrimary,
    },
    reflectionRow: {
      marginTop: Spacing.md,
    },
    downloadProgressRow: {
      padding: 0,
      paddingVertical: Spacing.xs,
      marginBottom: 0,
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
