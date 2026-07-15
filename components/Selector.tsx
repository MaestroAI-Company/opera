import { useRef, useState } from "react";
import { Image, LayoutRectangle, Modal, Pressable, StyleSheet, Text, View } from "react-native";

const arrowDownIcon = require("../assets/icons/down_arrow.png");

export type SelectorOption = {
  id: string;
  label: string;
};

type SelectorProps = {
  options: SelectorOption[];
  selectedValue: string;
  onSelect: (value: string) => void;
  placeholder?: string;
  title?: string;
};

export default function Selector({
  options,
  selectedValue,
  onSelect,
  placeholder = "Select...",
  title,
}: SelectorProps) {
  const [visible, setVisible] = useState(false);
  const triggerRef = useRef<View>(null);
  const [triggerLayout, setTriggerLayout] = useState<LayoutRectangle | null>(null);

  const handleOpen = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setTriggerLayout({ x, y, width, height } as LayoutRectangle);
      setVisible(true);
    });
  };

  const selectedOption = options.find((o) => o.id === selectedValue);

  return (
    <View style={styles.container}>
      <View ref={triggerRef} style={styles.shadowLayer}>
        <View style={styles.shadowBlock} />
        <Pressable onPress={handleOpen} style={styles.trigger}>
          <Image source={arrowDownIcon} style={styles.icon} />
          <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">
            {selectedOption ? selectedOption.label : placeholder}
          </Text>
        </Pressable>
      </View>

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
            {title && <Text style={styles.sectionTitle}>{title}</Text>}
            {options.map((option) => (
              <Pressable
                key={option.id}
                onPress={() => {
                  onSelect(option.id);
                  setVisible(false);
                }}
                style={[styles.option, option.id === selectedValue && styles.optionSelected]}
              >
                <Text
                  style={[
                    styles.optionText,
                    option.id === selectedValue && styles.optionTextSelected,
                  ]}
                >
                  {option.label}
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
    alignItems: "flex-start",
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
    minWidth: 140,
    maxWidth: 240,
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
});
