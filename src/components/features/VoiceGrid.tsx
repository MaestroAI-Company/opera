import { useEffect, useState } from "react";
import { LayoutChangeEvent, PixelRatio, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Reanimated, { type SharedValue, useAnimatedStyle, useFrameCallback, useSharedValue } from "react-native-reanimated";

const VOICE_TICK_MS = 60;
//caps cell count on wide bars
const VOICE_MAX_COLS = 80;
const VOICE_ROWS = 5;
//spreads the voice from the center
const VOICE_SHIFT_MS = 70;
//columns fading out per side
const VOICE_FADE_COLS = 8;
const VOICE_LEVELS = Array.from({ length: VOICE_ROWS }, (_, i) => i);

function VoiceCell({ col, row, cell, color, heights, cols }: { col: number; row: number; cell: number; color: string; heights: SharedValue<number[]>; cols: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    //deeper cells get more opaque
    const d = heights.value[col] - row;
    const alpha = d <= 0 ? 0 : d <= 1 ? 0.6 * d : Math.min(1, 0.6 + 0.2 * (d - 1));
    //soft edges avoid a hard cut
    const edge = Math.min(1, Math.min(col + 1, cols.value - col) / VOICE_FADE_COLS);
    return { opacity: alpha * edge };
  });
  //shared snapped edges avoid hairlines
  const snap = (n: number) => PixelRatio.roundToNearestPixel(n * cell);
  const left = snap(col);
  const bottom = snap(row);
  return <Reanimated.View style={[styles.cell, { backgroundColor: color, left, bottom, width: snap(col + 1) - left, height: snap(row + 1) - bottom }, style]} />;
}

//fills the size of its host
export default function VoiceGrid({ getVolume, color, style }: { getVolume: () => number; color: string; style?: StyleProp<ViewStyle> }) {
  const vol = useSharedValue(0);
  const energy = useSharedValue(0);
  const clock = useSharedValue(0);
  const history = useSharedValue<number[]>(Array(VOICE_MAX_COLS / 2).fill(0));
  const heights = useSharedValue<number[]>(Array(VOICE_MAX_COLS).fill(0));
  const colsShared = useSharedValue(0);
  const [grid, setGrid] = useState({ cols: 0, cell: 0 });
  //even columns keep the center between two
  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const cell = height / VOICE_ROWS;
    const next = Math.min(VOICE_MAX_COLS, 2 * Math.floor(width / (2 * cell)));
    colsShared.value = next;
    setGrid({ cols: next, cell });
  };

  useEffect(() => {
    const timer = setInterval(() => {
      vol.value = Math.min(1, getVolume() * 50);
    }, VOICE_TICK_MS);
    return () => clearInterval(timer);
  }, [vol, getVolume]);

  //ui thread keeps columns gliding
  useFrameCallback(frame => {
    const dt = Math.min(frame.timeSincePreviousFrame ?? 16, 50);
    const t = frame.timeSinceFirstFrame / 1000;
    //fast attack and slow release
    const target = vol.value;
    energy.value += (target - energy.value) * (1 - Math.exp(-dt / (target > energy.value ? 40 : 160)));

    clock.value += dt;
    if (clock.value >= VOICE_SHIFT_MS) {
      clock.value = 0;
      history.value = [energy.value, ...history.value.slice(0, VOICE_MAX_COLS / 2 - 1)];
    }

    const prev = heights.value;
    const total = colsShared.value;
    const half = total / 2;
    const next = new Array<number>(VOICE_MAX_COLS).fill(0);
    for (let c = 0; c < total; c++) {
      //farther columns read older samples
      const dist = c < half ? half - 1 - c : c - half;
      //idle breathing in silence
      const idle = 0.5 + 0.7 * (0.5 + 0.5 * Math.sin(t * 2.2 + c * 0.8));
      //offset waves avoid repeating columns
      const wobble = 0.7 + 0.3 * Math.sin(t * 4.3 + c * 1.7) * Math.sin(t * 1.9 + c * 0.5);
      const goal = Math.min(VOICE_ROWS, idle + history.value[dist] * (VOICE_ROWS - 1.2) * wobble);
      const tau = goal > prev[c] ? 50 : 140;
      next[c] = prev[c] + (goal - prev[c]) * (1 - Math.exp(-dt / tau));
    }
    heights.value = next;
  });

  return (
    <View onLayout={handleLayout} style={[styles.container, style]}>
      <View style={{ width: grid.cols * grid.cell, height: VOICE_ROWS * grid.cell }}>
        {Array.from({ length: grid.cols }, (_, col) =>
          VOICE_LEVELS.map(row => <VoiceCell key={`${col}-${row}`} col={col} row={row} cell={grid.cell} color={color} heights={heights} cols={colsShared} />)
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  cell: {
    position: "absolute",
  },
});
