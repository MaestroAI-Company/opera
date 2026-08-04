import { useEffect, useRef, useState } from "react";
import { Dimensions, Image, Keyboard, LayoutRectangle, Modal, Pressable, ScrollView, StyleSheet, Text, Vibration, View } from "react-native";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { AIModule } from "../../services/ai/AIModule";
import { getAICoreModelLabel } from "../../services/ai/AICoreProvider";
import NotificationModal from "../ui/NotificationModal";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const arrowDownIcon = require("../../../assets/icons/down_arrow.png");
const downloadIcon = require("../../../assets/icons/download.png");
const thinkingIcon = require("../../../assets/icons/thinking.gif");
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

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
};

export default function ModelDropdown({
  selectedModel,
  selectedReflection,
  showReflection,
  onModelChange,
  onReflectionChange,
}: ModelDropdownProps) {
  const [visible, setVisible] = useState(false);
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
    progress.value = withTiming(0, { duration: 200 }, (finished) => {
      if (finished) {
        runOnJS(setVisible)(false);
        if (callback) {
          runOnJS(callback)();
        }
      }
    });
  };

  const [isAvailable, setIsAvailable] = useState(true);

  const fetchModels = async () => {
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
    } catch (e) {
      setModels([]);
    } finally {
      setLoading(false);
      setHasFetched(true);
    }
  };

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
    fetchModels();
  }, []);

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

  const MAX_MODELS_HEIGHT = 200;
  const modelsHeight = models.length === 0 ? 80 : Math.min(models.length * 40, MAX_MODELS_HEIGHT);
  let finalMenuHeight = 30 + modelsHeight + 16 + 30 + REFLECTIONS.length * 40 + 24;

  const menuWidth = 220;
  let menuLeft = 0;
  let menuTop: number | undefined = 0;
  let menuBottom: number | undefined = undefined;

  if (triggerLayout) {
    menuLeft = triggerLayout.x + (triggerLayout.width / 2) - (menuWidth / 2);
    if (menuLeft + menuWidth > SCREEN_WIDTH - 16) {
      menuLeft = SCREEN_WIDTH - menuWidth - 16;
    }
    if (menuLeft < 16) {
      menuLeft = 16;
    }

    const spaceBelow = SCREEN_HEIGHT - (triggerLayout.y + triggerLayout.height) - 16;
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
      menuBottom = SCREEN_HEIGHT - triggerLayout.y + 4;
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
          style={({ pressed }) => [styles.trigger, pressed && { backgroundColor: "#eaeaea" }]}
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
                  <Image source={thinkingIcon} style={{ width: 16, height: 16, tintColor: '#888888', opacity: 0.7 }} />
                  <Text style={[styles.modelStatus, { paddingHorizontal: 0, paddingVertical: 0 }]}>Loading...</Text>
                </View>
              ) : models.length === 0 ? (
                <View>
                  <Text style={{ color: '#ff4444', textAlign: 'center', marginBottom: 12, paddingHorizontal: 12, fontSize: 13 }}>
                    {isAvailable ? "No models found" : "Unable to fetch models / Ollama URL undefined"}
                  </Text>
                  {isAvailable && (
                    <Pressable
                      onPress={() => {
                        handleClose(() => setDownloadModalVisible(true));
                      }}
                      style={({ pressed }) => [styles.downloadOption, pressed && { backgroundColor: "#eaeaea" }]}
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
                    style={({ pressed }) => [
                      styles.option,
                      model === selectedModel ? styles.optionSelected : pressed && { backgroundColor: "rgba(0, 0, 0, 0.05)" },
                      model === selectedModel && pressed && { backgroundColor: "#cc1414" }
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
                    style={({ pressed }) => [
                      styles.option,
                      item.id === selectedReflection ? styles.optionSelected : pressed && { backgroundColor: "rgba(0, 0, 0, 0.05)" },
                      item.id === selectedReflection && pressed && { backgroundColor: "#cc1414" }
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
    backgroundColor: "#00000013",
    borderRadius: 10,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#00000017",
    paddingHorizontal: 12,
    height: 44,
    backgroundColor: "#fff",
    gap: 8,
    borderRadius: 10,
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
    fontSize: 15,
    color: "#000",
    fontFamily: "IBMPlexMono-Medium",
    flexShrink: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  menu: {
    position: "absolute",
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#00000017",
    padding: 12,
    width: 220,
    boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.15)",
    elevation: 8,
  },
  sectionTitle: {
    fontSize: 12,
    color: "#888",
    marginBottom: 8,
    marginTop: 4,
    fontFamily: "Jakarta",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  separator: {
    height: 16,
  },
  modelStatus: {
    fontSize: 12,
    color: "#888",
    fontStyle: "italic",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  option: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 4,
  },
  optionSelected: {
    backgroundColor: "#FF1A1A",
    borderWidth: 2,
    borderColor: "#ffffff52",
  },
  optionText: {
    fontSize: 15,
    color: "#000",
    fontFamily: "IBMPlexMono-Medium",
  },
  optionTextSelected: {
    color: "#FFF",
  },
  downloadOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderStyle: "dashed",
    gap: 8,
    marginVertical: 4,
  },
  downloadIcon: {
    width: 16,
    height: 16,
    
  },
  downloadText: {
    fontSize: 13,
    color: "#0066cc",
    fontFamily: "IBMPlexMono-Medium",
  },
});
