import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  Keyboard,
  Modal,
  PanResponder,
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
import { Colors, Fonts, FontSizes, Radius, Spacing } from "../../../constants/theme";
import { getAICoreModelLabel } from "../../services/ai/AICoreProvider";
import { AIModule } from "../../services/ai/AIModule";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { useResponsive } from "../../hooks/useResponsive";
import NotificationModal from "../ui/NotificationModal";

const botIcon = require("../../../assets/icons/bot.png");
const downloadIcon = require("../../../assets/icons/download.png");
const loadingAnimation = require("../../../assets/animations/loading.json");

const REFLECTIONS = [
  { id: "none", label: "Quick" },
  { id: "low", label: "Low" },
  { id: "high", label: "High" },
];

//clears the tallest sheet content so it starts fully off-screen
const SHEET_OFFSET = 500;
const MAX_MODELS_HEIGHT = 240;

type ModelDropdownProps = {
  selectedModel: string;
  selectedReflection: string;
  showReflection: boolean;
  onModelChange: (model: string) => void;
  onReflectionChange: (reflection: string) => void;
  aiService: string;
};

export default function ModelDropdown({
  selectedModel,
  selectedReflection,
  showReflection,
  onModelChange,
  onReflectionChange,
  aiService,
}: ModelDropdownProps) {
  const insets = useSafeAreaInsets();
  const { isLargeScreen } = useResponsive();
  const [visible, setVisible] = useState(false);
  const [renderModal, setRenderModal] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);
  const pendingCallbackRef = useRef<(() => void) | null>(null);

  const backdropOpacity = useAnimatedValue(0);
  const sheetY = useAnimatedValue(SHEET_OFFSET);

  //scrim fades in place, sheet slides, driven separately so the modal itself does no transform
  useEffect(() => {
    if (visible) {
      setRenderModal(true);
      backdropOpacity.setValue(0);
      sheetY.setValue(SHEET_OFFSET);
      //let the modal actually mount before animating, avoids a stutter on open
      const raf = requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(backdropOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
          Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, overshootClamping: true, bounciness: 0, speed: 14 }),
        ]).start();
      });
      return () => cancelAnimationFrame(raf);
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(sheetY, { toValue: SHEET_OFFSET, duration: 180, useNativeDriver: true }),
      ]).start(() => {
        setRenderModal(false);
        const callback = pendingCallbackRef.current;
        pendingCallbackRef.current = null;
        callback?.();
      });
    }
  }, [visible, backdropOpacity, sheetY]);

  //drag handle mirrors a native sheet's swipe-to-dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_e, gestureState) => {
        if (gestureState.dy > 0) {
          sheetY.setValue(gestureState.dy);
          backdropOpacity.setValue(Math.max(0, 1 - gestureState.dy / SHEET_OFFSET));
        }
      },
      onPanResponderRelease: (_e, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          closeSheet();
        } else {
          Animated.parallel([
            Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, overshootClamping: true, bounciness: 0, speed: 14 }),
            Animated.timing(backdropOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
          ]).start();
        }
      },
    })
  ).current;

  const closeSheet = (callback?: () => void) => {
    pendingCallbackRef.current = callback ?? null;
    setVisible(false);
  };

  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const available = await AIModule.isAvailable();
      setIsAvailable(available);
      if (!available) {
        setModels([]);
        return;
      }
      const fetched = await AIModule.getAvailableModels();
      setModels(fetched);
    } catch {
      setModels([]);
    } finally {
      setLoading(false);
      setHasFetched(true);
    }
  }, []);

  useEffect(() => {
    if (models.length > 0) {
      if (!selectedModel || !models.includes(selectedModel)) {
        onModelChange(models[0]);
      }
    } else if (hasFetched && !loading && selectedModel) {
      onModelChange("");
    }
  }, [models, selectedModel, loading, hasFetched, onModelChange]);

  useEffect(() => {
    //refetch when ai service changes so the list follows the active provider
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the fetch
    fetchModels();
  }, [fetchModels, aiService]);

  useEffect(() => {
    if (selectedModel) {
      AIModule.preloadModel(selectedModel).catch(console.error);
    }
  }, [selectedModel]);

  const handlePullModel = () => {
    setDownloadModalVisible(false);
    setIsDownloading(true);
    AIModule.downloadService("gemma4")
      .then(() => fetchModels())
      .catch(console.error)
      .finally(() => setIsDownloading(false));
  };

  const handleOpen = () => {
    Keyboard.dismiss();
    setVisible(true);
    fetchModels();
  };

  //friendly label for aicore variants
  const displayName = (model: string) =>
    model.startsWith("aicore-") ? getAICoreModelLabel(model) : model;

  return (
    <View style={[styles.container, isLargeScreen && styles.containerLarge]}>
      <View style={styles.shadowLayer}>
        <View style={styles.shadowBlock} />
        <Pressable
          onPress={handleOpen}
          style={({ pressed, hovered }) => [styles.trigger, (pressed || hovered) && { backgroundColor: Colors.surfacePressed }]}
        >
          <Image source={botIcon} style={styles.icon} />
          <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">
            {selectedModel ? displayName(selectedModel) : "Modèle"}
          </Text>
        </Pressable>
      </View>

      <Modal visible={renderModal} transparent animationType="none" statusBarTranslucent onRequestClose={() => closeSheet()}>
        <View style={styles.backdropRoot}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]} />
          <Pressable style={StyleSheet.absoluteFill} onPress={() => closeSheet()} />
          <Pressable style={styles.sheetTouchArea} onPress={() => {}}>
            <Animated.View style={{ transform: [{ translateY: sheetY }] }}>
              <View style={[styles.inlineSheet, { paddingBottom: (Platform.OS === 'ios' ? 20 : 10) + insets.bottom }]}>
                <View style={styles.sheetHandleContainer} {...panResponder.panHandlers}>
                  <View style={styles.sheetHandle} />
                </View>

                <Text style={styles.sectionTitle}>Models</Text>
                <ScrollView style={{ maxHeight: MAX_MODELS_HEIGHT }} showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
                  {loading ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
                      <LottieView source={loadingAnimation} autoPlay loop style={{ width: 24, height: 16 }} />
                      <Text style={[styles.modelStatus, { paddingHorizontal: 0, paddingVertical: 0 }]}>Loading...</Text>
                    </View>
                  ) : models.length === 0 ? (
                    <View>
                      <Text style={{ color: Colors.error, textAlign: 'center', marginBottom: 12, paddingHorizontal: 12, fontSize: FontSizes.caption }}>
                        {isAvailable ? "No models found" : "Unable to fetch models / Ollama URL undefined"}
                      </Text>
                      {isAvailable && (
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
                    }).map((model) => (
                      <Pressable
                        key={model}
                        onPress={() => {
                          Vibration.vibrate(10);
                          closeSheet(() => onModelChange(model));
                        }}
                        style={({ pressed, hovered }) => [
                          styles.option,
                          model === selectedModel ? styles.optionSelected : (pressed || hovered) && { backgroundColor: Colors.overlaySubtle },
                          model === selectedModel && (pressed || hovered) && { backgroundColor: Colors.primaryActive }
                        ]}
                      >
                        <Text
                          style={[styles.optionText, model === selectedModel && styles.optionTextSelected]}
                        >
                          {displayName(model)}
                        </Text>
                      </Pressable>
                    ))
                  )}
                </ScrollView>

                {showReflection && (
                  <>
                    <View style={styles.separator} />
                    <Text style={styles.sectionTitle}>Reflection</Text>
                    {REFLECTIONS.map((item) => (
                      <Pressable
                        key={item.id}
                        onPress={() => {
                          Vibration.vibrate(10);
                          closeSheet(() => onReflectionChange(item.id));
                        }}
                        style={({ pressed, hovered }) => [
                          styles.option,
                          item.id === selectedReflection ? styles.optionSelected : (pressed || hovered) && { backgroundColor: Colors.overlaySubtle },
                          item.id === selectedReflection && (pressed || hovered) && { backgroundColor: Colors.primaryActive }
                        ]}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            item.id === selectedReflection && styles.optionTextSelected,
                          ]}
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    ))}
                  </>
                )}
              </View>
            </Animated.View>
          </Pressable>
        </View>
      </Modal>

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

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  containerLarge: {
    marginHorizontal: Spacing.xxl,
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
  },
  label: {
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    flexShrink: 1,
  },
  backdropRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    backgroundColor: Colors.scrimModal,
  },
  sheetTouchArea: {
    width: '100%',
  },
  inlineSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.huge2,
    borderTopRightRadius: Radius.huge2,
    paddingTop: 12,
    paddingHorizontal: 16,
    width: '100%',
  },
  sheetHandleContainer: {
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 10,
    marginTop: -10,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: Radius.xxl,
    backgroundColor: Colors.textMuted,
  },
  sectionTitle: {
    fontSize: FontSizes.label,
    color: Colors.textMuted,
    marginBottom: 8,
    marginTop: 4,
    fontFamily: Fonts.body,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  separator: {
    height: 16,
  },
  modelStatus: {
    fontSize: FontSizes.label,
    color: Colors.textMuted,
    fontStyle: "italic",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  option: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.xl,
    marginBottom: 4,
  },
  optionSelected: {
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: Colors.borderOnPrimary,
    borderRadius: Radius.md,
  },
  optionText: {
    fontSize: FontSizes.body,
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
  },
  optionTextSelected: {
    color: Colors.surface,
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

  },
  downloadText: {
    fontSize: FontSizes.caption,
    color: Colors.linkAlt,
    fontFamily: Fonts.mono,
  },
});
