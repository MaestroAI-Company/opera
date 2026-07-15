import { useRef, useState } from "react";
import { Dimensions, Image, LayoutRectangle, Modal, Pressable, StyleSheet, Text, Vibration, View } from "react-native";

const arrowDownIcon = require("../assets/icons/down_arrow.png");
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

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
  fullWidth?: boolean;
};

export default function Selector({
  options,
  selectedValue,
  onSelect,
  placeholder = "Select...",
  title,
  fullWidth = false,
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

  const menuWidth = fullWidth && triggerLayout ? triggerLayout.width : 220;
  let menuLeft = 0;
  let menuTop = 0;

  if (triggerLayout) {
    menuLeft = triggerLayout.x;
    if (menuLeft + menuWidth > SCREEN_WIDTH - 16) {
      menuLeft = SCREEN_WIDTH - menuWidth - 16;
    }
    if (menuLeft < 16) {
      menuLeft = 16;
    }

    const estimatedMenuHeight = options.length * 40 + (title ? 30 : 0) + 24;
    menuTop = triggerLayout.y + triggerLayout.height + 4;
    if (menuTop + estimatedMenuHeight > SCREEN_HEIGHT - 16) {
      const upwardTop = triggerLayout.y - estimatedMenuHeight - 4;
      if (upwardTop > 16) {
        menuTop = upwardTop;
      }
    }
  }

  return (
    <View style={[styles.container, fullWidth && styles.containerFullWidth]}>
      <Pressable
        onPress={handleOpen}
        style={({ pressed }) => [
          styles.trigger, 
          fullWidth && styles.triggerFullWidth, 
          pressed && { backgroundColor: "#eaeaea" }
        ]}
        ref={triggerRef}
      >
        <Image source={arrowDownIcon} style={styles.icon} />
        <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">
          {selectedOption ? selectedOption.label : placeholder}
        </Text>
      </Pressable>

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
                ? { top: menuTop, left: menuLeft, width: menuWidth }
                : {},
            ]}
          >
            {title && <Text style={styles.sectionTitle}>{title}</Text>}
            {options.map((option) => (
              <Pressable
                key={option.id}
                onPress={() => {
                  Vibration.vibrate(10);
                  onSelect(option.id);
                  setVisible(false);
                }}
                style={({ pressed }) => [
                  styles.option, 
                  option.id === selectedValue ? styles.optionSelected : pressed && { backgroundColor: "rgba(0, 0, 0, 0.05)" },
                  option.id === selectedValue && pressed && { backgroundColor: "#cc1414" }
                ]}
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
  containerFullWidth: {
    width: "100%",
    alignItems: "stretch",
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
    minWidth: 120,
    maxWidth: 240,
    overflow: "hidden",
    position: "relative",
    zIndex: 1,
  },
  triggerFullWidth: {
    width: "100%",
    maxWidth: "100%",
  },
  icon: {
    width: 18,
    height: 18,
  },
  label: {
    fontSize: 15,
    color: "#000",
    fontFamily: "monospace",
    flex: 1,
    textAlign: "right",
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
