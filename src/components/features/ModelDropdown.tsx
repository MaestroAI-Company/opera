import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Keyboard, LayoutRectangle, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, Vibration, View } from "react-native";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { AIModule } from "../../services/ai/AIModule";
import { getAICoreModelLabel } from "../../services/ai/AICoreProvider";
import NotificationModal from "../ui/NotificationModal";
import { Colors, Fonts, FontSizes, Radius } from "../../../constants/theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const arrowDownIcon = require("../../../assets/icons/down_arrow.png");
const downloadIcon = require("../../../assets/icons/download.png");
const thinkingIcon = require("../../../assets/icons/thinking.gif");

const REFLECTIONS = [
  { id: "none", label: "Quick" },
  { id: "low", label: "Low" },
  { id: "high", label: "High" },
];

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
  const [visible, setVisible] = useState(false);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const triggerRef = useRef<View>(null);
  const [triggerLayout, setTriggerLayout] = useState<LayoutRectangle | null>(null);
  const progress = useSharedValue(0);

  const iconStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${progress.value * 180}deg` }],
    };
  });

  const overlayAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: progress.value,
    };
  });

  const handleClose = (callback?: () => void) => {
    progress.set(withTiming(0, { duration: 200 }, (finished) => {
      if (finished) {
        runOnJS(setVisible)(false);
        if (callback) {
          runOnJS(callback)();
        }
      }
    }));
  };

  const [isAvailable, setIsAvailable] = useState(true);

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
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setTriggerLayout({ x, y, width, height } as LayoutRectangle);
      setVisible(true);
      progress.value = withTiming(1, { duration: 250 });
      fetchModels();
    });
  };

  //reposition menu on window resize while open
  useEffect(() => {
    if (!visible) return;
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setTriggerLayout({ x, y, width, height } as LayoutRectangle);
    });
  }, [visible, windowWidth, windowHeight]);

  const MAX_MODELS_HEIGHT = 200;
  const modelsHeight = models.length === 0 ? 80 : Math.min(models.length * 40, MAX_MODELS_HEIGHT);
  let finalMenuHeight = 30 + modelsHeight + 16 + 30 + REFLECTIONS.length * 40 + 24;

  const menuWidth = 220;
  let menuLeft = 0;
  let menuTop: number | undefined = 0;
  let menuBottom: number | undefined = undefined;

  if (triggerLayout) {
    menuLeft = triggerLayout.x + (triggerLayout.width / 2) - (menuWidth / 2);
    if (menuLeft + menuWidth > windowWidth - 16) {
      menuLeft = windowWidth - menuWidth - 16;
    }
    if (menuLeft < 16) {
      menuLeft = 16;
    }

    const spaceBelow = windowHeight - (triggerLayout.y + triggerLayout.height) - 16;
    const spaceAbove = triggerLayout.y - 16;

    if (finalMenuHeight <= spaceBelow) {
      menuTop = triggerLayout.y + triggerLayout.height + 4;
    } else if (spaceBelow >= 200 || spaceBelow >= spaceAbove) {
      menuTop = triggerLayout.y + triggerLayout.height + 4;
      finalMenuHeight = spaceBelow;
    } else {
      if (finalMenuHeight > spaceAbove) {
        finalMenuHeight = spaceAbove;
      }
      menuTop = undefined;
      menuBottom = windowHeight - triggerLayout.y + 4;
    }
  }

  const menuAnimatedStyle = useAnimatedStyle(() => {
    return {
      maxHeight: progress.value * finalMenuHeight,
      opacity: progress.value,
      overflow: "hidden",
    };
  });

  //friendly label for aicore variants
  const displayName = (model: string) =>
    model.startsWith("aicore-") ? getAICoreModelLabel(model) : model;

  return (
    <View style={styles.container}>
      <View ref={triggerRef} style={styles.shadowLayer}>
        <View style={styles.shadowBlock} />
        <Pressable
          onPress={handleOpen}
          style={({ pressed, hovered }) => [styles.trigger, (pressed || hovered) && { backgroundColor: Colors.surfacePressed }]}
        >
          <Animated.Image source={arrowDownIcon} style={[styles.icon, iconStyle]} />
          <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">
            {selectedModel ? displayName(selectedModel) : "Modèle"}
          </Text>
        </Pressable>
      </View>

      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={() => handleClose()}
      >
        <AnimatedPressable style={[styles.overlay, overlayAnimatedStyle]} onPress={() => handleClose()}>
          <AnimatedPressable
            style={[
              styles.menu,
              triggerLayout
                ? { top: menuTop, bottom: menuBottom, left: menuLeft }
                : {},
              menuAnimatedStyle,
            ]}
          >
            <Text style={styles.sectionTitle}>Models</Text>
            <ScrollView style={{ maxHeight: MAX_MODELS_HEIGHT }} showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
              {loading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
                  <Image source={thinkingIcon} style={{ width: 16, height: 16, tintColor: Colors.textMuted, opacity: 0.7 }} />
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
                        handleClose(() => setDownloadModalVisible(true));
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
                      handleClose(() => onModelChange(model));
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
                      handleClose(() => onReflectionChange(item.id));
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
          </AnimatedPressable>
        </AnimatedPressable>
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
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
  },
  menu: {
    position: "absolute",
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    borderWidth: 2,
    borderColor: Colors.border,
    padding: 12,
    width: 220,
    boxShadow: `0px 4px 12px ${Colors.overlay}`,
    elevation: 8,
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
