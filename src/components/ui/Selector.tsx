import { useEffect, useRef, useState } from "react";
import { LayoutChangeEvent, LayoutRectangle, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, Vibration, View } from "react-native";
import Animated, { interpolateColor, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Colors, Fonts, FontSizes, Radius } from "../../../constants/theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const arrowDownIcon = require("../../../assets/icons/down_arrow.png");
const downloadIcon = require("../../../assets/icons/download.png");

const LONG_PRESS_DELAY = 180;
const BREAK_RATIO = 0.85; // fraction of a row's height the finger must pull past to break free toward the next anchor
const ROW_GAP = 4; // matches option/downloadOption marginBottom

// rubber-band curve: approaches but never exceeds `dim`, resisting harder the further it's pulled
const rubberBand = (d: number, dim: number) => {
  if (dim <= 0) return 0;
  const sign = d < 0 ? -1 : 1;
  return sign * dim * (1 - 1 / (1 + Math.abs(d) / dim));
};

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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const progress = useSharedValue(0);
  const triggerRef = useRef<View>(null);
  const [triggerLayout, setTriggerLayout] = useState<LayoutRectangle | null>(null);

  //floating pill drag-to-select, mirrors ThemeSelector but vertical
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [rowLayoutsVersion, setRowLayoutsVersion] = useState(0);

  const pillY = useSharedValue(0);
  const pillHeight = useSharedValue(0);
  const pillScale = useSharedValue(1);
  const pillLit = useSharedValue(0);

  const rowLayoutsRef = useRef<({ y: number; height: number } | undefined)[]>([]);
  const armedRef = useRef(false);
  const startYRef = useRef(0);
  const previewIndexRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  //keeps PanResponder callbacks (created once) reading fresh props instead of their mount-time values
  const latestRef = useRef({ options, selectedValue, onSelect });
  latestRef.current = { options, selectedValue, onSelect };

  const selectedIndex = Math.max(0, options.findIndex((o) => o.id === selectedValue));
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  const activeIndex = previewIndex ?? selectedIndex;

  const isPlainOption = (index: number) => {
    const o = options[index];
    return !!o && !o.isDownload && !o.rightIcon;
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleRowLayout = (index: number) => (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    const existing = rowLayoutsRef.current[index];
    if (existing && existing.y === y && existing.height === height) return;
    rowLayoutsRef.current[index] = { y, height };
    setRowLayoutsVersion((v) => v + 1);
  };

  //reset measured rows when the option list itself changes shape
  const optionsKey = options.map((o) => o.id).join("|");
  useEffect(() => {
    rowLayoutsRef.current = [];
    setRowLayoutsVersion((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey]);

  //park the pill on the selected row whenever it's not being dragged
  useEffect(() => {
    if (previewIndex !== null) return;
    const layout = rowLayoutsRef.current[selectedIndex];
    if (!layout || !isPlainOption(selectedIndex)) return;
    pillY.value = withTiming(layout.y, { duration: 180 });
    pillHeight.value = withTiming(layout.height, { duration: 180 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedValue, rowLayoutsVersion, visible]);

  const pillPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      //keep the gesture even though it starts inside a ScrollView that wants vertical pans for itself
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        armedRef.current = false;
        startYRef.current = pillY.value;
        previewIndexRef.current = selectedIndexRef.current;
        clearLongPressTimer();
        longPressTimerRef.current = setTimeout(() => {
          armedRef.current = true;
          pillScale.value = withTiming(1.04, { duration: 120 });
          pillLit.value = withTiming(1, { duration: 120 });
        }, LONG_PRESS_DELAY);
      },
      onPanResponderMove: (_e, gestureState) => {
        if (!armedRef.current) return;
        const layouts = rowLayoutsRef.current;
        const { options: liveOptions } = latestRef.current;
        const maxIndex = layouts.length - 1;
        const isPlainAt = (i: number) => !!layouts[i] && !liveOptions[i]?.isDownload && !liveOptions[i]?.rightIcon;

        let anchor = previewIndexRef.current ?? selectedIndexRef.current;
        if (!layouts[anchor]) return;
        const rawY = startYRef.current + gestureState.dy;

        //pulled toward its current row; past BREAK_RATIO it snaps loose and gets grabbed by the next one
        let d = rawY - layouts[anchor]!.y;
        let slot = layouts[anchor]!.height + ROW_GAP;
        while (Math.abs(d) >= slot * BREAK_RATIO) {
          const dir = d > 0 ? 1 : -1;
          let next = anchor + dir;
          while (next >= 0 && next <= maxIndex && !isPlainAt(next)) next += dir;
          if (next < 0 || next > maxIndex || next === anchor) break;
          anchor = next;
          d = rawY - layouts[anchor]!.y;
          slot = layouts[anchor]!.height + ROW_GAP;
        }

        if (anchor !== previewIndexRef.current) {
          previewIndexRef.current = anchor;
          setPreviewIndex(anchor);
          Vibration.vibrate(10);
        }

        pillY.value = layouts[anchor]!.y + rubberBand(d, slot);
        pillHeight.value = withTiming(layouts[anchor]!.height, { duration: 100 });
      },
      onPanResponderRelease: () => {
        clearLongPressTimer();
        if (armedRef.current) {
          const idx = previewIndexRef.current ?? selectedIndexRef.current;
          const layout = rowLayoutsRef.current[idx];
          pillScale.value = withTiming(1, { duration: 150 });
          pillLit.value = withTiming(0, { duration: 150 });
          if (layout) {
            pillY.value = withTiming(layout.y, { duration: 150 });
            pillHeight.value = withTiming(layout.height, { duration: 150 });
          }
          armedRef.current = false;
          previewIndexRef.current = null;
          setPreviewIndex(null);
          const newId = latestRef.current.options[idx]?.id;
          if (newId) {
            handleClose(() => latestRef.current.onSelect(newId));
          }
        }
      },
      onPanResponderTerminate: () => {
        clearLongPressTimer();
        if (armedRef.current) {
          const layout = rowLayoutsRef.current[selectedIndexRef.current];
          pillScale.value = withTiming(1, { duration: 150 });
          pillLit.value = withTiming(0, { duration: 150 });
          if (layout) {
            pillY.value = withTiming(layout.y, { duration: 150 });
            pillHeight.value = withTiming(layout.height, { duration: 150 });
          }
        }
        armedRef.current = false;
        previewIndexRef.current = null;
        setPreviewIndex(null);
      },
    })
  ).current;

  const pillAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pillY.value }, { scale: pillScale.value }],
    height: pillHeight.value,
    backgroundColor: interpolateColor(pillLit.value, [0, 1], [Colors.primary, Colors.primaryBright]),
  }));

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

  //reposition menu on window resize while open
  useEffect(() => {
    if (!visible) return;
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setTriggerLayout({ x, y, width, height } as LayoutRectangle);
    });
  }, [visible, windowWidth, windowHeight]);

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

  const selectedOption = options.find((o) => o.id === selectedValue);
  let finalMenuHeight = Math.min(options.length * 44 + (title ? 30 : 0) + 24, 300);

  const menuWidth = fullWidth && triggerLayout ? triggerLayout.width : 220;
  let menuLeft = 0;
  let menuTop: number | undefined = 0;
  let menuBottom: number | undefined = undefined;

  if (triggerLayout) {
    menuLeft = triggerLayout.x;
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

  return (
    <View style={[styles.container, fullWidth && styles.containerFullWidth]}>
      <Pressable
        onPress={handleOpen}
        style={({ pressed, hovered }) => [
          styles.trigger,
          fullWidth && styles.triggerFullWidth,
          (pressed || hovered) && { backgroundColor: Colors.surfacePressed }
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
            <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled={true} contentContainerStyle={{ paddingBottom: 4, paddingHorizontal: 8 }}>
              {title && <Text style={styles.sectionTitle}>{title}</Text>}
              <View style={styles.optionsList}>
                {options.map((option, index) => {
                  //plain rows are represented by the floating pill instead of their own highlight
                  const isSpecialActive = index === activeIndex && !option.isDownload && !isPlainOption(index);
                  return (
                    <Pressable
                      key={option.id}
                      onLayout={handleRowLayout(index)}
                      onPress={() => {
                        Vibration.vibrate(10);
                        handleClose(() => onSelect(option.id));
                      }}
                      style={({ pressed, hovered }) => [
                        option.isDownload ? styles.downloadOption : styles.option,
                        isSpecialActive ? styles.optionSelected : (pressed || hovered) && !option.isDownload && { backgroundColor: Colors.overlaySubtle },
                        isSpecialActive && (pressed || hovered) && { backgroundColor: Colors.primaryActive },
                        option.isDownload && (pressed || hovered) && { backgroundColor: Colors.surfacePressed }
                      ]}
                    >
                      {option.isDownload && (
                        <Animated.Image source={downloadIcon} style={[styles.downloadIcon, { tintColor: Colors.primary }]} />
                      )}
                      <Text
                        style={[
                          option.isDownload ? styles.downloadText : styles.optionText,
                          isSpecialActive && styles.optionTextSelected,
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
                            style={({ pressed, hovered }) => [styles.rightIconPressable, (pressed || hovered) && { backgroundColor: Colors.overlaySubtle }]}
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
                  );
                })}
                {rowLayoutsRef.current[activeIndex] && isPlainOption(activeIndex) && (
                  <Animated.View style={[styles.pill, pillAnimatedStyle]} {...pillPanResponder.panHandlers}>
                    <Text style={[styles.optionText, styles.optionTextSelected]} numberOfLines={1}>
                      {options[activeIndex]?.label}
                    </Text>
                  </Animated.View>
                )}
              </View>
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
    borderColor: Colors.border,
    paddingHorizontal: 12,
    height: 44,
    backgroundColor: Colors.surface,
    gap: 8,
    borderRadius: Radius.xxl,
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
    fontSize: FontSizes.caption,
    color: Colors.textPrimary,
    fontFamily: Fonts.mono,
    flex: 1,
    textAlign: "right",
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
    paddingVertical: 6,
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
  },
  optionTextSelected: {
    color: Colors.surface,
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
    backgroundColor: Colors.surfaceSubtle,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.codeBlockText,
    borderStyle: "dashed",
    gap: 8,
    marginBottom: 4,
  },
  downloadIcon: {
    width: 16,
    height: 16,
  },
  downloadText: {
    fontSize: FontSizes.caption,
    color: Colors.primary,
    fontFamily: Fonts.mono,
  },
});
