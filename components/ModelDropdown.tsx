import { useEffect, useRef, useState } from "react";
import { Image, LayoutRectangle, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { AIModule } from "../src/services/ai/AIModule";

const arrowDownIcon = require("../assets/icons/down_arrow.png");

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
  const triggerRef = useRef<View>(null);
  const [triggerLayout, setTriggerLayout] = useState<LayoutRectangle | null>(null);

  useEffect(() => {
    setLoading(true);
    AIModule.getAvailableModels()
      .then((fetched) => {
        setModels(fetched);
        if (fetched.length > 0 && !selectedModel) {
          onModelChange(fetched[0]);
        }
      })
      .catch(() => setModels([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedModel) {
      AIModule.preloadModel(selectedModel).catch(console.error);
    }
  }, [selectedModel]);

  const handlePullModel = () => {
    setLoading(true);
    AIModule.downloadService("gemma4")
      .then(() => AIModule.getAvailableModels())
      .then((fetched) => {
        setModels(fetched);
        if (fetched.length > 0) onModelChange(fetched[0]);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const handleOpen = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setTriggerLayout({ x, y, width, height } as LayoutRectangle);
      setVisible(true);
    });
  };

  return (
    <View style={styles.container}>
      <View ref={triggerRef} style={styles.shadowLayer}>
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
              <Pressable onPress={handlePullModel} style={styles.option}>
                <Text style={[styles.optionText, { color: "#0066cc" }]}>gemma4</Text>
              </Pressable>
            ) : (
              models.map((model) => (
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  shadowLayer: {},
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#00000017",
    paddingHorizontal: 12,
    height: 36,
    backgroundColor: "#fff",
    gap: 8,
    borderRadius: 5,
    maxWidth: 180,
    overflow: "hidden",
  },
  icon: {
    width: 16,
    height: 16,
  },
  label: {
    fontSize: 16,
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
    fontSize: 16,
    color: "#888",
    marginBottom: 8,
    marginTop: 4,
  },
  separator: {
    height: 16,
  },
  modelStatus: {
    fontSize: 14,
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
    fontSize: 18,
    color: "#000",
    fontFamily: "monospace",
  },
  optionTextSelected: {
    color: "#FFF",
  },
});
