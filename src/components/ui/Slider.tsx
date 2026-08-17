import { useEffect, useRef, useState } from "react";
import { LayoutChangeEvent, PanResponder, Pressable, StyleSheet, Text, Vibration, View } from "react-native";
import Animated, { interpolateColor, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { FontSizes, Fonts, Radius, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";

export type SliderOption = {
  id: string;
  label: string;
};

type SliderProps = {
  selectedValue: string;
  onSelect: (value: string) => void;
  options: SliderOption[];
};

const LONG_PRESS_DELAY = 180;
const BREAK_RATIO = 0.6; // fraction of a slot the finger must cross to hand the pill to the next one
const SLOT_TRANSITION = LinearTransition.duration(200);

//elastic resistance beyond bounds
const rubberBand = (d: number, dim: number) => {
  if (dim <= 0) return 0;
  const sign = d < 0 ? -1 : 1;
  return sign * dim * (1 - 1 / (1 + Math.abs(d) / dim));
};

export default function Slider({
  selectedValue,
  onSelect,
  options,
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

  //while dragging, the pill "hovers" a slot; that slot grows and pushes the others aside
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  const pillX = useSharedValue(0);
  const scale = useSharedValue(1);
  const pillLit = useSharedValue(0);

  const trackWidthRef = useRef(0);
  const armedRef = useRef(false);
  const startXRef = useRef(0);
  const previewIndexRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  //measured center (in px from the track's left edge) of each slot, updated as flex resizes them
  const slotCentersRef = useRef<number[]>([]);

  //step = distance the pill travels between two adjacent options, used only while actively dragging
  const stepFor = (width: number) => (options.length > 0 ? width / options.length : 0);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  //park pill on the selected slot's real (measured) center when not being dragged
  useEffect(() => {
    if (previewIndex === null && trackWidth > 0) {
      const measured = slotCentersRef.current[selectedIndex];
      const step = stepFor(trackWidth);
      const fallback = selectedIndex * step + step / 2;
      pillX.value = withTiming(measured ?? fallback, { duration: 180 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, trackWidth, previewIndex]);

  const handleTrackLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    trackWidthRef.current = width;
    setTrackWidth(width);
    const step = stepFor(width);
    pillX.value = selectedIndexRef.current * step + step / 2;
  };

  const handleSlotLayout = (index: number) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    slotCentersRef.current[index] = x + width / 2;
    //keep the parked pill glued to the slot as it grows/shrinks, without re-touching drag state
    if (previewIndexRef.current === null && index === selectedIndexRef.current) {
      pillX.value = withTiming(x + width / 2, { duration: 180 });
    }
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
        //require hold before drag, like picking the handle up
        longPressTimerRef.current = setTimeout(() => {
          armedRef.current = true;
          scale.value = withTiming(1.15, { duration: 120 });
          pillLit.value = withTiming(1, { duration: 120 });
        }, LONG_PRESS_DELAY);
      },
      onPanResponderMove: (_e, gestureState) => {
        if (!armedRef.current) return;
        const step = stepFor(trackWidthRef.current);
        if (step <= 0) return;
        const currentOptions = optionsRef.current;
        const maxIndex = currentOptions.length - 1;
        const rawX = startXRef.current + gestureState.dx;

        let anchor = previewIndexRef.current ?? selectedIndexRef.current;
        let d = rawX - (anchor * step + step / 2);
        while (Math.abs(d) >= step * BREAK_RATIO) {
          const next = Math.min(maxIndex, Math.max(0, anchor + (d > 0 ? 1 : -1)));
          if (next === anchor) break;
          anchor = next;
          d = rawX - (anchor * step + step / 2);
        }
        if (anchor !== previewIndexRef.current) {
          previewIndexRef.current = anchor;
          setPreviewIndex(anchor);
          Vibration.vibrate(10);
        }
        pillX.value = anchor * step + step / 2 + rubberBand(d, step);
      },
      onPanResponderRelease: () => {
        clearLongPressTimer();
        if (armedRef.current) {
          const step = stepFor(trackWidthRef.current);
          const currentOptions = optionsRef.current;
          const idx = previewIndexRef.current ?? selectedIndexRef.current;
          scale.value = withTiming(1, { duration: 150 });
          pillLit.value = withTiming(0, { duration: 150 });
          pillX.value = withTiming(idx * step + step / 2, { duration: 150 });
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
          const step = stepFor(trackWidthRef.current);
          scale.value = withTiming(1, { duration: 150 });
          pillLit.value = withTiming(0, { duration: 150 });
          pillX.value = withTiming(selectedIndexRef.current * step + step / 2, { duration: 150 });
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
  const activeOption = options[activeIndex] ?? options[0];

  return (
    <View style={styles.container}>
      <View style={styles.track} onLayout={handleTrackLayout}>
        {/* ticks: plain flex slots, the active one grows and naturally pushes its neighbors */}
        {options.map((option, index) => {
          const isActive = index === activeIndex;
          return (
            <Animated.View
              key={option.id}
              layout={SLOT_TRANSITION}
              onLayout={handleSlotLayout(index)}
              style={[styles.slot, isActive && styles.slotActive]}
            >
              <Pressable
                onPress={() => {
                  if (option.id !== selectedValue) Vibration.vibrate(10);
                  onSelect(option.id);
                }}
                style={styles.slotPressable}
              >
                {!isActive && <View style={[styles.tick, index < activeIndex && styles.tickFilled]} />}
              </Pressable>
            </Animated.View>
          );
        })}

        {/* pill: floats above the track and is dragged directly by the finger, in px */}
        {trackWidth > 0 && activeOption && (
          <Animated.View
            style={[styles.pill, pillAnimatedStyle]}
            {...panResponder.panHandlers}
          >
            <Text style={styles.pillText} numberOfLines={1} adjustsFontSizeToFit>
              {activeOption.label}
            </Text>
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
    borderRadius: Radius.xxl,
    borderWidth: 2,
    borderColor: Colors.border,
    height: 44,
    paddingHorizontal: 4,
    width: "100%",
  },
  track: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: "100%",
  },
  //inactive slots share the leftover space evenly; the active one grows to make room for the pill's label
  slot: {
    flex: 1,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  slotActive: {
    flexGrow: 3,
    flexBasis: 0,
  },
  slotPressable: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
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
    left: -38,
    top: "50%",
    marginTop: -16,
    width: 76,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.borderOnPrimary,
    paddingHorizontal: 4,
  },
  pillText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.bodyMd,
    color: Colors.textOnPrimary,
  },
});
