import { useEffect, useRef, useState } from "react";
import { Image, Keyboard, LayoutRectangle, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { AIModule } from "../src/services/ai/AIModule";
import NotificationModal from "./NotificationModal";

const arrowDownIcon = require("../assets/icons/down_arrow.png");
const downloadIcon = require("../assets/icons/download.png");

const REFLECTIONS = [
  { id: "quick", label: "Quick" },
  { id: "think", label: "Think" },
];

type ModelDropdownProps = {
  selectedModel: string;
  selectedReflection: string;
  onModelChange: (model: string) => void;
  onReflectionChange: (reflection: string) => void;
  rightElement?: React.ReactNode;
};

export default function ModelDropdown({
  selectedModel,
  selectedReflection,
  onModelChange,
  onReflectionChange,
  rightElement,
}: ModelDropdownProps) {
  const [visible, setVisible] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const triggerRef = useRef<View>(null);
  const [triggerLayout, setTriggerLayout] = useState<LayoutRectangle | null>(null);

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
      fetchModels();
    });
  };

  return (
    <View style={styles.container}>
      <View ref={triggerRef} style={styles.shadowLayer}>
        <View style={styles.shadowBlock} />
        <Pressable onPress={handleOpen} style={styles.trigger}>
          <Image source={arrowDownIcon} style={styles.icon} />
          <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">
            {selectedModel || "Modèle"}
          </Text>
        </Pressable>
      </View>
      {rightElement}

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
          <Pressable
            style={[
              styles.menu,
              triggerLayout
                ? { top: triggerLayout.y + triggerLayout.height + 4, left: triggerLayout.x }
                : {},
            ]}
          >
            <Text style={styles.sectionTitle}>Models</Text>
            {loading ? (
              <Text style={styles.modelStatus}>Loading...</Text>
            ) : models.length === 0 ? (
              <View>
                <Text style={{ color: '#ff4444', textAlign: 'center', marginBottom: 12, paddingHorizontal: 12, fontSize: 13 }}>
                  Unable to fetch models / Ollama URL undefined
                </Text>
                {isAvailable && (
                  <Pressable 
                    onPress={() => {
                      setVisible(false);
                      setDownloadModalVisible(true);
                    }} 
                    style={styles.downloadOption}
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
                    onModelChange(model);
                    setVisible(false);
                  }}
                  style={[styles.option, model === selectedModel && styles.optionSelected]}
                >
                  <Text
                    style={[styles.optionText, model === selectedModel && styles.optionTextSelected]}
                  >
                    {model}
                  </Text>
                </Pressable>
              ))
            )}

            <View style={styles.separator} />
            <Text style={styles.sectionTitle}>Reflection</Text>
            {REFLECTIONS.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => {
                  onReflectionChange(item.id);
                  setVisible(false);
                }}
                style={[styles.option, item.id === selectedReflection && styles.optionSelected]}
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
          </Pressable>
        </Pressable>
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
    borderRadius: 5,
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
    borderRadius: 5,
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
    fontFamily: "monospace",
    flexShrink: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  menu: {
    position: "absolute",
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#00000017",
    padding: 12,
    width: 220,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  sectionTitle: {
    fontSize: 12,
    color: "#888",
    marginBottom: 8,
    marginTop: 4,
    fontFamily: "monospace",
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
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  optionSelected: {
    backgroundColor: "#FF1A1A",
  },
  optionText: {
    fontSize: 15,
    color: "#000",
    fontFamily: "monospace",
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
    tintColor: "#0066cc",
  },
  downloadText: {
    fontSize: 13,
    color: "#0066cc",
    fontFamily: "monospace",
    fontWeight: "bold",
  },
});
