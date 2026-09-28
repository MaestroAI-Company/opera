import { useEffect, useRef, useState } from "react";
import { Image, ImageSourcePropType, LayoutChangeEvent, PanResponder, Pressable, StyleSheet, Vibration, View } from "react-native";
import Animated, { Easing, interpolate, interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { FontSizes, Fonts, Radius, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { pressStyle } from "./pressStyle";

export type SliderOption = {
  id: string;
  label: string;
  icon?: ImageSourcePropType;
};

type SliderProps = {
  selectedValue: string;
  onSelect: (value: string) => void;
  options: SliderOption[];
  icon?: ImageSourcePropType;
};

const GAP = 4;
const LONG_PRESS_DELAY = 180;
const BREAK_RATIO = 0.85;
const PILL_MIN_WIDTH = 64;

//rubber-band curve resists further pull
const rubberBand = (d: number, dim: number) => {
  if (dim <= 0) return 0;
  const sign = d < 0 ? -1 : 1;
  return sign * dim * (1 - 1 / (1 + Math.abs(d) / dim));
};

//calculate handle position within bounds
const getPillX = (index: number, bw: number, pw: number, totalWidth: number, count: number) => {
  if (count <= 1 || totalWidth <= pw) return 0;
  const rawCenter = index * (bw + GAP) + bw / 2;
  return Math.max(0, Math.min(totalWidth - pw, rawCenter - pw / 2));
};

//discrete option slider with ticks
export default function Slider({
  selectedValue,
  onSelect,
  options,
  icon,
}: SliderProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selectedValueRef = useRef(selectedValue);
  selectedValueRef.current = selectedValue;

  const selectedIndex = Math.max(0, options.findIndex((o) => o.id === selectedValue));
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;

  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [buttonWidth, setButtonWidth] = useState(0);
  const [pillWidth, setPillWidth] = useState(0);

  const pillX = useSharedValue(0);
  const scale = useSharedValue(1);
  const pillLit = useSharedValue(0);
  const labelPulse = useSharedValue(0);

  const buttonWidthRef = useRef(0);
  const pillWidthRef = useRef(0);
  const trackWidthRef = useRef(0);
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

  //park pill on selected slot
  useEffect(() => {
    if (previewIndex === null && buttonWidth > 0 && pillWidth > 0) {
      const targetX = getPillX(selectedIndex, buttonWidth, pillWidth, trackWidthRef.current, options.length);
      pillX.value = withTiming(targetX, { duration: 180 });
    }
  }, [selectedIndex, buttonWidth, pillWidth, pillX, previewIndex, options.length]);

  const handleLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    const count = optionsRef.current.length;
    const bw = count > 0 ? (width - GAP * (count - 1)) / count : 0;
    const pw = Math.max(bw, PILL_MIN_WIDTH);
    buttonWidthRef.current = bw;
    pillWidthRef.current = pw;
    trackWidthRef.current = width;
    setButtonWidth(bw);
    setPillWidth(pw);
    pillX.value = getPillX(selectedIndexRef.current, bw, pw, width, count);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      //keep gesture when drawer scrolls
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        armedRef.current = false;
        startXRef.current = pillX.value;
        previewIndexRef.current = selectedIndexRef.current;
        clearLongPressTimer();
        //require hold before drag
        longPressTimerRef.current = setTimeout(() => {
          armedRef.current = true;
          scale.value = withTiming(1.2, { duration: 120 });
          pillLit.value = withTiming(1, { duration: 120 });
        }, LONG_PRESS_DELAY);
      },
      onPanResponderMove: (_e, gestureState) => {
        if (!armedRef.current) return;
        const bw = buttonWidthRef.current;
        const pw = pillWidthRef.current;
        const tw = trackWidthRef.current;
        const slot = bw + GAP;
        const currentOptions = optionsRef.current;
        const maxIndex = currentOptions.length - 1;
        const rawX = startXRef.current + gestureState.dx;

        let anchor = previewIndexRef.current ?? selectedIndexRef.current;
        const anchorX = getPillX(anchor, bw, pw, tw, currentOptions.length);
        let d = rawX - anchorX;
        while (Math.abs(d) >= slot * BREAK_RATIO) {
          const next = Math.min(maxIndex, Math.max(0, anchor + (d > 0 ? 1 : -1)));
          if (next === anchor) break;
          anchor = next;
          const newAnchorX = getPillX(anchor, bw, pw, tw, currentOptions.length);
          d = rawX - newAnchorX;
        }
        if (anchor !== previewIndexRef.current) {
          previewIndexRef.current = anchor;
          setPreviewIndex(anchor);
          Vibration.vibrate(10);
        }
        const currentAnchorX = getPillX(anchor, bw, pw, tw, currentOptions.length);
        pillX.value = currentAnchorX + rubberBand(d, slot);
      },
      onPanResponderRelease: () => {
        clearLongPressTimer();
        if (armedRef.current) {
          const bw = buttonWidthRef.current;
          const pw = pillWidthRef.current;
          const tw = trackWidthRef.current;
          const currentOptions = optionsRef.current;
          const idx = previewIndexRef.current ?? selectedIndexRef.current;
          const targetX = getPillX(idx, bw, pw, tw, currentOptions.length);
          scale.value = withTiming(1, { duration: 150 });
          pillLit.value = withTiming(0, { duration: 150 });
          pillX.value = withTiming(targetX, { duration: 150 });
          const newValue = currentOptions[idx]?.id;
          armedRef.current = false;
          previewIndexRef.current = null;
          setPreviewIndex(null);
          if (newValue && newValue !== selectedValueRef.current) onSelectRef.current(newValue);
        }
      },
      onPanResponderTerminate: () => {
        clearLongPressTimer();
        if (armedRef.current) {
          const bw = buttonWidthRef.current;
          const pw = pillWidthRef.current;
          const tw = trackWidthRef.current;
          const targetX = getPillX(selectedIndexRef.current, bw, pw, tw, optionsRef.current.length);
          scale.value = withTiming(1, { duration: 150 });
          pillLit.value = withTiming(0, { duration: 150 });
          pillX.value = withTiming(targetX, { duration: 150 });
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

  const labelPulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(labelPulse.value, [0, 1], [1, 0.6]),
    transform: [{ scale: interpolate(labelPulse.value, [0, 1], [1, 1.2]) }],
  }));

  const activeIndex = previewIndex ?? selectedIndex;
  const activeOption = options[activeIndex] ?? options[0];
  const iconSource = icon ?? activeOption?.icon;

  //pulse the pill label when it switches option
  const shownIndexRef = useRef(activeIndex);
  useEffect(() => {
    if (shownIndexRef.current === activeIndex) return;
    shownIndexRef.current = activeIndex;
    labelPulse.set(withSequence(
      withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 160, easing: Easing.in(Easing.quad) }),
    ));
  }, [activeIndex, labelPulse]);

  return (
    <View style={[styles.container, !iconSource && styles.containerNoIcon]}>
      {iconSource && <Image source={iconSource} style={styles.icon} />}
      <View style={styles.optionsContainer} onLayout={handleLayout}>
        {options.map((option, index) => (
          <Pressable
            key={option.id}
            onPress={() => {
              if (option.id !== selectedValue) Vibration.vibrate(10);
              onSelect(option.id);
            }}
            style={pressStyle(styles.slot, "surface")}
          >
            <View style={[styles.tick, index < activeIndex && styles.tickFilled]} />
          </Pressable>
        ))}
        {pillWidth > 0 && activeOption && (
          <Animated.View style={[styles.pill, { width: pillWidth }, pillAnimatedStyle]} {...panResponder.panHandlers}>
            <Animated.Text style={[styles.pillText, labelPulseStyle]} numberOfLines={1} adjustsFontSizeToFit>{activeOption.label}</Animated.Text>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    height: 44,
    paddingLeft: 12,
    paddingRight: 4,
    width: "100%",
  },
  containerNoIcon: {
    paddingLeft: 4,
  },
  icon: {
    width: 18,
    height: 18,
    marginRight: 10,
    tintColor: Colors.textPrimary,
  },
  optionsContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: "100%",
    gap: 4,
  },
  slot: {
    flex: 1,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: Radius.md,
  },
  tick: {
    width: 6,
    height: 10,
    borderRadius: Radius.xs,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  tickFilled: {
    backgroundColor: Colors.primary,
    borderColor: Colors.borderOnPrimary,
  },
  pill: {
    position: "absolute",
    left: 0,
    top: "50%",
    marginTop: -18,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.borderOnPrimary,
    paddingHorizontal: 6,
  },
  pillText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.bodyMd,
    color: Colors.textOnPrimary,
  },
});
