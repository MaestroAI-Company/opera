import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DeviceEventEmitter,
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View,
} from "react-native";
import LottieView from "lottie-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { getAICoreModelLabel } from "../../services/ai/providers/AICoreProvider";
import { buildSources, ModelSource } from "../../services/ai/providers/sources";
import { AIModule } from "../../services/ai/AIModule";
import { AppEvents } from "../../services/events";
import { useResponsive } from "../../hooks/useResponsive";
import NotificationModal from "../ui/NotificationModal";
import SheetSurface, { AnchorRect } from "../ui/SheetSurface";
import SliderToggle, { SliderToggleOption } from "../ui/SliderToggle";

const botIcon = require("../../../assets/icons/bot.png");
const downloadIcon = require("../../../assets/icons/download.png");
const quickIcon = require("../../../assets/icons/Quick.png");
const lowIcon = require("../../../assets/icons/Low.png");
const highIcon = require("../../../assets/icons/High.png");
const loadingAnimation = require("../../../assets/animations/loading.json");

const REFLECTIONS: SliderToggleOption[] = [
  { id: "none", label: "Quick", icon: quickIcon },
  { id: "low", label: "Low", icon: lowIcon },
  { id: "high", label: "High", icon: highIcon },
];

//sheet floats over the ui instead of lifting it
const MODEL_SELECTOR_LIFTS = false;
//desktop drops the panel under its trigger instead of docking it as a sheet
const MODEL_SELECTOR_ANCHORS_ON_DESKTOP = true;
const MAX_MODELS_HEIGHT = 240;
const PANEL_WIDTH = 320;

type ModelSelectorProps = {
  selectedModel: string;
  selectedReflection: string;
  showReflection: boolean;
  onModelChange: (model: string) => void;
  onReflectionChange: (reflection: string) => void;
  aiService: string;
  ollamaUrl: string;
  onServiceChange: (service: string, ollamaUrl: string) => void;
  //any value that changes closes the panel, e.g. a drawer opening or closing
  closeSignal?: unknown;
};

export default function ModelSelector({
  selectedModel,
  selectedReflection,
  showReflection,
  onModelChange,
  onReflectionChange,
  aiService,
  ollamaUrl,
  onServiceChange,
  closeSignal,
}: ModelSelectorProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { isLargeScreen, isDesktop } = useResponsive();
  const [visible, setVisible] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);
  const [localAvailable, setLocalAvailable] = useState(false);
  //settings own the source list, this forces a rebuild when they change
  const [sourcesRevision, setSourcesRevision] = useState(0);
  const [browsedKey, setBrowsedKey] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<AnchorRect | null>(null);
  const pendingCallbackRef = useRef<(() => void) | null>(null);
  const triggerRef = useRef<View>(null);

  const anchored = MODEL_SELECTOR_ANCHORS_ON_DESKTOP && isDesktop;

  useEffect(() => {
    AIModule.isModeAvailable("local").then(setLocalAvailable).catch(() => setLocalAvailable(false));
    const sub = DeviceEventEmitter.addListener(AppEvents.settingsChanged, () => setSourcesRevision(r => r + 1));
    return () => sub.remove();
  }, []);

  const sources = useMemo(
    () => buildSources(localAvailable),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revision tracks the settings behind buildSources
    [localAvailable, sourcesRevision]
  );

  //the source the app currently generates with, falls back to the first tab
  const matchesActive = (source?: ModelSource) =>
    !!source && source.service === aiService && (source.service !== "ollama" || source.url === ollamaUrl);
  const activeSource = useMemo(
    () => sources.find(matchesActive) ?? sources[0],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- matchesActive only reads the deps below
    [sources, aiService, ollamaUrl]
  );
  const browsedSource = sources.find(s => s.key === browsedKey) ?? activeSource;
  const isBrowsingActive = matchesActive(browsedSource);

  useEffect(() => {
    //active source changed under us, stop browsing an old tab
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follow the active source again
    setBrowsedKey(null);
  }, [aiService, ollamaUrl]);

  const closeSheet = (callback?: () => void) => {
    pendingCallbackRef.current = callback ?? null;
    setVisible(false);
  };

  //a drawer opening or closing behind the panel should close it too
  const closeSignalRef = useRef(closeSignal);
  useEffect(() => {
    if (closeSignalRef.current !== closeSignal) {
      closeSignalRef.current = closeSignal;
      closeSheet();
    }
  }, [closeSignal]);

  //switching source or refreshing only drops what disappeared and appends what is new
  const applyModels = (next: string[]) => {
    setModels(prev => {
      const kept = prev.filter(m => next.includes(m));
      const merged = [...kept, ...next.filter(m => !kept.includes(m))];
      //nothing moved, keep the same list so the rows are not touched
      const same = merged.length === prev.length && merged.every((m, i) => m === prev[i]);
      return same ? prev : merged;
    });
  };

  const fetchModels = useCallback(async (source?: ModelSource) => {
    if (!source) {
      applyModels([]);
      setIsAvailable(false);
      setHasFetched(true);
      return;
    }
    setLoading(true);
    try {
      const available = await AIModule.isSourceAvailable(source.service, source.url);
      setIsAvailable(available);
      applyModels(available ? await AIModule.getModelsFor(source.service, source.url) : []);
    } catch {
      applyModels([]);
    } finally {
      setLoading(false);
      setHasFetched(true);
    }
  }, []);

  useEffect(() => {
    //refetch when the browsed source changes so the list follows the tab
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the fetch
    fetchModels(browsedSource);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the source key should trigger a refetch
  }, [fetchModels, browsedSource?.key]);

  useEffect(() => {
    //only the active source may correct the selected model
    if (!isBrowsingActive) return;
    if (models.length > 0) {
      if (!selectedModel || !models.includes(selectedModel)) {
        onModelChange(models[0]);
      }
    } else if (hasFetched && !loading && selectedModel) {
      onModelChange("");
    }
  }, [models, selectedModel, loading, hasFetched, isBrowsingActive, onModelChange]);

  useEffect(() => {
    if (selectedModel) {
      AIModule.preloadModel(selectedModel).catch(console.error);
    }
  }, [selectedModel, aiService]);

  const handlePullModel = () => {
    setDownloadModalVisible(false);
    setIsDownloading(true);
    AIModule.downloadService("gemma4")
      .then(() => fetchModels(browsedSource))
      .catch(console.error)
      .finally(() => setIsDownloading(false));
  };

  const handleOpen = () => {
    Keyboard.dismiss();
    //settings may have changed while the panel was closed
    setSourcesRevision(r => r + 1);
    if (anchored && triggerRef.current) {
      //panel drops under the trigger, so it needs its window position first
      triggerRef.current.measureInWindow((x, y, width, height) => {
        setAnchorRect({ x, y, width, height });
        setVisible(true);
      });
    } else {
      setVisible(true);
    }
    fetchModels(browsedSource);
  };

  const handleSelectModel = (model: string) => {
    const source = browsedSource;
    Vibration.vibrate(10);
    closeSheet(() => {
      if (source && !isBrowsingActive) onServiceChange(source.service, source.url);
      onModelChange(model);
    });
  };

  //friendly label for aicore variants
  const displayName = (model: string) =>
    model.startsWith("aicore-") ? getAICoreModelLabel(model) : model;

  return (
    <View style={styles.container}>
      <View style={styles.shadowLayer}>
        <View style={styles.shadowBlock} />
        <Pressable
          ref={triggerRef}
          onPress={handleOpen}
          style={({ pressed, hovered }) => [styles.trigger, (pressed || hovered) && { backgroundColor: Colors.surfacePressed }]}
        >
          <Image source={botIcon} style={styles.icon} />
          <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">
            {selectedModel ? displayName(selectedModel) : "Modèle"}
          </Text>
        </Pressable>
      </View>

      <SheetSurface
        visible={visible}
        lift={MODEL_SELECTOR_LIFTS}
        onClose={() => closeSheet()}
        onClosed={() => {
          const callback = pendingCallbackRef.current;
          pendingCallbackRef.current = null;
          callback?.();
        }}
        anchor={anchored ? anchorRect : null}
        anchorWidth={PANEL_WIDTH}
        rootStyle={isLargeScreen ? styles.backdropRootLarge : undefined}
        touchAreaStyle={isLargeScreen ? styles.sheetTouchAreaLarge : undefined}
        sheetStyle={[
          styles.sheet,
          isLargeScreen && styles.sheetLarge,
          anchored
            ? styles.sheetAnchored
            : { paddingBottom: (Platform.OS === 'ios' ? 20 : 10) + insets.bottom },
        ]}
      >
        <View style={styles.tabsRow}>
          {sources.map((source) => {
            const active = source.key === browsedSource?.key;
            return (
              <Pressable
                key={source.key}
                onPress={() => setBrowsedKey(source.key)}
                style={({ pressed, hovered }) => [styles.tab, (pressed || hovered) && { backgroundColor: Colors.overlaySubtle }]}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
                  {source.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.modelsBox}>
          <ScrollView style={{ maxHeight: MAX_MODELS_HEIGHT }} showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
            {sources.length === 0 ? (
              <Text style={styles.emptyText}>No provider enabled, turn one on in Settings → Service</Text>
            ) : loading && models.length === 0 ? (
              <View style={styles.loadingRow}>
                <LottieView source={loadingAnimation} autoPlay loop style={{ width: 24, height: 16 }} />
                <Text style={styles.modelStatus}>Loading...</Text>
              </View>
            ) : models.length === 0 ? (
              <View>
                <Text style={styles.emptyText}>
                  {isAvailable ? "No models found" : "Unable to fetch models / server unreachable"}
                </Text>
                {isAvailable && isBrowsingActive && (
                  <Pressable
                    onPress={() => {
                      closeSheet(() => setDownloadModalVisible(true));
                    }}
                    style={({ pressed, hovered }) => [styles.downloadOption, (pressed || hovered) && { backgroundColor: Colors.surfacePressed }]}
                  >
                    <Image source={downloadIcon} style={styles.downloadIcon} />
                    <Text style={styles.downloadText}>
                      {isDownloading ? "Downloading..." : "gemma4"}
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : (
              [...models].sort((a, b) => {
                if (a === selectedModel) return -1;
                if (b === selectedModel) return 1;
                return a.localeCompare(b);
              }).map((model) => {
                const selected = isBrowsingActive && model === selectedModel;
                return (
                  <Pressable
                    key={model}
                    onPress={() => handleSelectModel(model)}
                    style={({ pressed, hovered }) => [
                      styles.option,
                      selected ? styles.optionSelected : (pressed || hovered) && { backgroundColor: Colors.overlaySubtle },
                      selected && (pressed || hovered) && { backgroundColor: Colors.primaryActive }
                    ]}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]} numberOfLines={1}>
                      {displayName(model)}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>

        {showReflection && (
          <View style={styles.reflectionRow}>
            <SliderToggle
              selectedValue={selectedReflection}
              onSelect={onReflectionChange}
              options={REFLECTIONS}
            />
          </View>
        )}
      </SheetSurface>

      <NotificationModal
        visible={downloadModalVisible}
        title="Download Gemma4"
        icon={downloadIcon}
        message="Do you want to download the Gemma4 model to your Ollama server? This model is several GB in size."
        onClose={() => setDownloadModalVisible(false)}
        buttons={[
          { text: "Cancel", onPress: () => setDownloadModalVisible(false), style: "secondary" },
          { text: "Download", onPress: handlePullModel, style: "primary" },
        ]}
      />
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
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
  //docks the sheet as a floating panel bottom-right instead of a full-width mobile sheet
  backdropRootLarge: {
    alignItems: 'flex-end',
    paddingRight: Spacing.xl2,
    paddingBottom: Spacing.xl2,
  },
  sheetTouchAreaLarge: {
    width: PANEL_WIDTH,
  },
  sheet: {
    paddingHorizontal: 16,
  },
  //floating card treatment matching NotificationModal: window radius, ink outline, blurred elevation shadow
  sheetLarge: {
    borderTopLeftRadius: Radius.window,
    borderTopRightRadius: Radius.window,
    borderBottomLeftRadius: Radius.window,
    borderBottomRightRadius: Radius.window,
    borderWidth: 2,
    borderColor: Colors.border,
    boxShadow: `0px 4px 12px ${Colors.overlay}`,
    elevation: 8,
  },
  //no drag handle up top, so the padding has to come back
  sheetAnchored: {
    paddingTop: 16,
    paddingBottom: 16,
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
    padding: 4,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    textAlign: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: FontSizes.caption,
    fontFamily: Fonts.body,
  },
  option: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
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
