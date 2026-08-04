import { useRef, useState } from "react";
import { Dimensions, LayoutRectangle, Modal, Pressable, ScrollView, StyleSheet, Text, Vibration, View } from "react-native";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const arrowDownIcon = require("../../../assets/icons/down_arrow.png");
const downloadIcon = require("../../../assets/icons/download.png");
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export type SelectorOption = {
  id: string;
  label: string;
  rightIcon?: any;
  rightIconTintColor?: string;
  onRightIconPress?: () => void;
  isDownload?: boolean;
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
  const progress = useSharedValue(0);
  const triggerRef = useRef<View>(null);
  const [triggerLayout, setTriggerLayout] = useState<LayoutRectangle | null>(null);

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

  const handleOpen = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setTriggerLayout({ x, y, width, height } as LayoutRectangle);
      setVisible(true);
      progress.value = withTiming(1, { duration: 250 });
    });
  };

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

  const selectedOption = options.find((o) => o.id === selectedValue);
  let finalMenuHeight = Math.min(options.length * 44 + (title ? 30 : 0) + 24, 300);

  const menuWidth = fullWidth && triggerLayout ? triggerLayout.width : 220;
  let menuLeft = 0;
  let menuTop: number | undefined = 0;
  let menuBottom: number | undefined = undefined;

  if (triggerLayout) {
    menuLeft = triggerLayout.x;
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
        <Animated.Image source={arrowDownIcon} style={[styles.icon, iconStyle]} />
        <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">
          {selectedOption ? selectedOption.label : placeholder}
        </Text>
      </Pressable>

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
                ? { top: menuTop, bottom: menuBottom, left: menuLeft, width: menuWidth }
                : {},
              menuAnimatedStyle,
            ]}
          >
            <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled={true} contentContainerStyle={{ paddingBottom: 4 }}>
              {title && <Text style={styles.sectionTitle}>{title}</Text>}
              {options.map((option) => (
                <Pressable
                  key={option.id}
                  onPress={() => {
                    Vibration.vibrate(10);
                    handleClose(() => onSelect(option.id));
                  }}
                  style={({ pressed }) => [
                    option.isDownload ? styles.downloadOption : styles.option,
                    option.id === selectedValue && !option.isDownload ? styles.optionSelected : pressed && !option.isDownload && { backgroundColor: "rgba(0, 0, 0, 0.05)" },
                    option.id === selectedValue && !option.isDownload && pressed && { backgroundColor: "#cc1414" },
                    option.isDownload && pressed && { backgroundColor: "#eaeaea" }
                  ]}
                >
                  {option.isDownload && (
                    <Animated.Image source={downloadIcon} style={[styles.downloadIcon, { tintColor: '#FF1A1A' }]} />
                  )}
                  <Text
                    style={[
                      option.isDownload ? styles.downloadText : styles.optionText,
                      option.id === selectedValue && !option.isDownload && styles.optionTextSelected,
                      !option.isDownload && option.rightIcon && { flex: 1 },
                    ]}
                  >
                    {option.label}
                  </Text>
                  {!option.isDownload && option.rightIcon && (
                    option.onRightIconPress ? (
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          Vibration.vibrate(10);
                          handleClose(() => option.onRightIconPress?.());
                        }}
                        hitSlop={8}
                        style={styles.rightIconPressable}
                      >
                        <Animated.Image
                          source={option.rightIcon}
                          style={[styles.rightIcon, option.rightIconTintColor ? { tintColor: option.rightIconTintColor } : null]}
                        />
                      </Pressable>
                    ) : (
                      <Animated.Image
                        source={option.rightIcon}
                        style={[styles.rightIcon, option.rightIconTintColor ? { tintColor: option.rightIconTintColor } : null]}
                      />
                    )
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </AnimatedPressable>
        </AnimatedPressable>
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
    paddingHorizontal: 12,
    height: 44,
    backgroundColor: "#fff",
    gap: 8,
    borderRadius: 10,
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
    fontSize: 13,
    color: "#000",
    fontFamily: "IBMPlexMono-Medium",
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
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 5,
    marginBottom: 4,
    borderWidth: 2,
    borderColor: "transparent",
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
    color: "#fff",
  },
  rightIconPressable: {
    justifyContent: "center",
    alignItems: "center",
    marginLeft: "auto",
    padding: 2,
  },
  rightIcon: {
    width: 18,
    height: 18,
    marginLeft: "auto",
  },
  downloadOption: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderStyle: "dashed",
    gap: 8,
    marginBottom: 4,
  },
  downloadIcon: {
    width: 16,
    height: 16,
  },
  downloadText: {
    fontSize: 13,
    color: "#FF1A1A",
    fontFamily: "IBMPlexMono-Medium",
  },
});
