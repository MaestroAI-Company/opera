import { Colors, Fonts, FontSizes, Radius } from "../../../constants/theme";
import { useEffect, useRef, useState } from "react";
import { Image, LayoutChangeEvent, PanResponder, Pressable, StyleSheet, Text, Vibration, View } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

// load theme icons
const autoIcon = require("../../../assets/icons/auto.png");
const lightIcon = require("../../../assets/icons/light.png");
const darkIcon = require("../../../assets/icons/dark.png");

type ThemeSelectorProps = {
  selectedValue: string;
  onSelect: (value: string) => void;
};

const GAP = 4;
const LONG_PRESS_DELAY = 180;
const BREAK_RATIO = 0.85; // fraction of a slot the finger must pull past to break free toward the next anchor

// rubber-band curve: approaches but never exceeds `dim`, resisting harder the further it's pulled
const rubberBand = (d: number, dim: number) => {
  if (dim <= 0) return 0;
  const sign = d < 0 ? -1 : 1;
  return sign * dim * (1 - 1 / (1 + Math.abs(d) / dim));
};

// theme selector component
export default function ThemeSelector({ selectedValue, onSelect }: ThemeSelectorProps) {
  const options = [
    { id: "system", label: "Auto" },
    { id: "light", label: "Light" },
    { id: "dark", label: "Dark" },
  ];

  const selectedIndex = Math.max(0, options.findIndex((o) => o.id === selectedValue));
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [buttonWidth, setButtonWidth] = useState(0);

  const pillX = useSharedValue(0);
  const scale = useSharedValue(1);
  const pillLit = useSharedValue(0);

  const buttonWidthRef = useRef(0);
  const armedRef = useRef(false);
  const startXRef = useRef(0);
  const previewIndexRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  // park the pill on the selected slot whenever it's not being dragged
  useEffect(() => {
    if (previewIndex === null && buttonWidth > 0) {
      pillX.value = withTiming(selectedIndex * (buttonWidth + GAP), { duration: 180 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedValue, buttonWidth]);

  const handleLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    const bw = (width - GAP * (options.length - 1)) / options.length;
    buttonWidthRef.current = bw;
    setButtonWidth(bw);
    pillX.value = selectedIndex * (bw + GAP);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      //keep the gesture even if an ancestor (eg. the settings drawer's swipe-to-close) tries to steal it
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        armedRef.current = false;
        startXRef.current = pillX.value;
        previewIndexRef.current = selectedIndex;
        clearLongPressTimer();
        //require a hold before dragging starts, matching press-and-drag gesture
        longPressTimerRef.current = setTimeout(() => {
          armedRef.current = true;
          scale.value = withTiming(1.2, { duration: 120 });
          pillLit.value = withTiming(1, { duration: 120 });
        }, LONG_PRESS_DELAY);
      },
      onPanResponderMove: (_e, gestureState) => {
        if (!armedRef.current) return;
        const bw = buttonWidthRef.current;
        const slot = bw + GAP;
        const maxIndex = options.length - 1;
        //unclamped: how far the finger has actually travelled from where the drag began
        const rawX = startXRef.current + gestureState.dx;

        //pulled toward its current anchor; past BREAK_RATIO it snaps loose and gets grabbed by the next one
        let anchor = previewIndexRef.current ?? selectedIndex;
        let d = rawX - anchor * slot;
        while (Math.abs(d) >= slot * BREAK_RATIO) {
          const next = Math.min(maxIndex, Math.max(0, anchor + (d > 0 ? 1 : -1)));
          if (next === anchor) break;
          anchor = next;
          d = rawX - anchor * slot;
        }
        if (anchor !== previewIndexRef.current) {
          previewIndexRef.current = anchor;
          setPreviewIndex(anchor);
          Vibration.vibrate(10);
        }
        pillX.value = anchor * slot + rubberBand(d, slot);
      },
      onPanResponderRelease: () => {
        clearLongPressTimer();
        if (armedRef.current) {
          const bw = buttonWidthRef.current;
          const idx = previewIndexRef.current ?? selectedIndex;
          scale.value = withTiming(1, { duration: 150 });
          pillLit.value = withTiming(0, { duration: 150 });
          pillX.value = withTiming(idx * (bw + GAP), { duration: 150 });
          const newValue = options[idx].id;
          armedRef.current = false;
          previewIndexRef.current = null;
          setPreviewIndex(null);
          if (newValue !== selectedValue) onSelect(newValue);
        }
      },
      onPanResponderTerminate: () => {
        clearLongPressTimer();
        if (armedRef.current) {
          const bw = buttonWidthRef.current;
          scale.value = withTiming(1, { duration: 150 });
          pillLit.value = withTiming(0, { duration: 150 });
          pillX.value = withTiming(selectedIndex * (bw + GAP), { duration: 150 });
        }
        armedRef.current = false;
        previewIndexRef.current = null;
        setPreviewIndex(null);
      },
    })
  ).current;

  const pillAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }, { scale: scale.value }],
    backgroundColor: interpolateColor(pillLit.value, [0, 1], [Colors.primary, Colors.primaryBright]),
  }));

  const activeIndex = previewIndex ?? selectedIndex;
  const activeOption = options[activeIndex];

  // get icon based on the previewed/selected value
  const getSelectedIcon = () => {
    switch (activeOption.id) {
      case "light":
        return lightIcon;
      case "dark":
        return darkIcon;
      case "system":
      default:
        return autoIcon;
    }
  };

  return (
    <View style={styles.container}>
      <Image source={getSelectedIcon()} style={styles.icon} />
      <View style={styles.optionsContainer} onLayout={handleLayout}>
        {options.map((option) => (
          <Pressable
            key={option.id}
            onPress={() => {
              if (option.id !== selectedValue) Vibration.vibrate(10);
              onSelect(option.id);
            }}
            style={({ pressed, hovered }) => [styles.optionButton, (pressed || hovered) && { backgroundColor: Colors.surfacePressed }]}
          >
            <Text style={styles.optionText}>{option.label}</Text>
          </Pressable>
        ))}
        {buttonWidth > 0 && (
          <Animated.View style={[styles.pill, { width: buttonWidth }, pillAnimatedStyle]} {...panResponder.panHandlers}>
            <Text style={styles.pillText}>{activeOption.label}</Text>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    borderWidth: 2,
    borderColor: Colors.border,
    height: 44,
    paddingLeft: 12,
    paddingRight: 4,
    width: "100%",
  },
  icon: {
    width: 18,
    height: 18,

    marginRight: 10,

  },
  optionsContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: "100%",
    gap: 4,
  },
  optionButton: {
    flex: 1,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: Radius.md,
  },
  pill: {
    position: "absolute",
    left: 0,
    top: "50%",
    marginTop: -16,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.borderOnPrimary,
  },
  optionText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.bodyMd,
    color: Colors.textPrimary,
  },
  pillText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.bodyMd,
    color: Colors.surface,
  },
});
