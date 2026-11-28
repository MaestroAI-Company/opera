import React, { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Reanimated, {
  type SharedValue,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";

import { Radius } from "../../../constants/theme";
import { useColors } from "../../hooks/useTheme";

const GLOW_POLL_MS = 50;
const GLOW_BLEND_MS = 140;
const GLOW_IDLE_OFF_MS = 900;

//local dimming grid, two rows of lights hugging the top and bottom edges
const COLS = 10;
const CELLS = COLS * 2;
//the grid stays on the straight part of the bar
const GRID_INSET = Radius.window - 1;
//one lap of the thinking light
const ORBIT_LAP_MS = 3200;
//long soft tail, short ramp ahead of the head
const ORBIT_TAIL = 12;
const ORBIT_AHEAD = 3;
//rings of lights spreading from the centre, one per column pair
const RINGS = COLS / 2;
const RING_FALLOFF = 0.85;
const RING_LAG_MS = 110;
//centre light dips softly once per cycle, rings carry the dip outward
const VOICE_PULSE_S = 1.5;
const VOICE_PULSE_DEPTH = 0.45;
//radians per second of the reply see-saw, about 3s per cycle
const REPLY_SWING = 2.1;

type ChatBarGlowProps = {
  isRecording: boolean;
  isGenerating: boolean;
  isThinking: boolean;
  incognito: boolean;
  getVolume: () => number;
};

//reactive light behind the bar: thinking light orbits, voice spreads from the centre, reply glows
export default function ChatBarGlow({ isRecording, isGenerating, isThinking, incognito, getVolume }: ChatBarGlowProps) {
  const Colors = useColors();
  //idle, recording, thinking, replying
  const mode = isRecording ? 1 : isGenerating ? (isThinking ? 2 : 3) : 0;

  const modeShared = useSharedValue(mode);
  //easing weight of voice, thinking and reply layers
  const weights = useSharedValue<number[]>([0, 0, 0]);
  const levels = useSharedValue<number[]>([0, 0, 0, 0, 0]);
  const micTarget = useSharedValue(0);
  const micEnergy = useSharedValue(0);
  const phase = useSharedValue(0);
  const head = useSharedValue(0);

  const frameCallback = useFrameCallback((frame) => {
    const dt = Math.min(frame.timeSincePreviousFrame ?? 16, 50);

    //fast attack and slow release for voice level
    const level = micTarget.value;
    const tau = level > micEnergy.value ? 120 : 380;
    micEnergy.value += (level - micEnergy.value) * (1 - Math.exp(-dt / tau));

    //layers fade in and out so modes never pop
    const m = modeShared.value;
    const w = weights.value;
    const k = 1 - Math.exp(-dt / GLOW_BLEND_MS);
    weights.value = [
      w[0] + ((m === 1 ? 1 : 0) - w[0]) * k,
      w[1] + ((m === 2 ? 1 : 0) - w[1]) * k,
      w[2] + ((m === 3 ? 1 : 0) - w[2]) * k,
    ];

    //each ring follows the inner one, which makes the voice travel outward
    const prev = levels.value;
    const kr = 1 - Math.exp(-dt / RING_LAG_MS);
    //smooth dip of the centre so each wave stands out
    const dip = 0.5 + 0.5 * Math.cos((2 * Math.PI * phase.value) / VOICE_PULSE_S);
    const gate = 1 - VOICE_PULSE_DEPTH * dip;
    const next = [prev[0] + (micEnergy.value * gate - prev[0]) * (1 - Math.exp(-dt / 80)), 0, 0, 0, 0];
    for (let i = 1; i < RINGS; i++) next[i] = prev[i] + (next[i - 1] * RING_FALLOFF - prev[i]) * kr;
    levels.value = next;

    phase.value += dt / 1000;
    head.value = (head.value + (dt / ORBIT_LAP_MS) * CELLS) % CELLS;
  }, false);

  useEffect(() => {
    modeShared.set(mode);
    if (mode !== 0) {
      frameCallback.setActive(true);
      return;
    }
    //let the fade out finish before stopping frames
    const timer = setTimeout(() => frameCallback.setActive(false), GLOW_IDLE_OFF_MS);
    return () => clearTimeout(timer);
  }, [mode, modeShared, frameCallback]);

  useEffect(() => {
    if (!isRecording) {
      micTarget.set(0);
      return;
    }
    const gain = Platform.OS === "web" ? 14 : 1.4;
    const timer = setInterval(() => {
      micTarget.set(Math.min(1, Math.max(0, getVolume() * gain)));
    }, GLOW_POLL_MS);
    return () => clearInterval(timer);
  }, [isRecording, getVolume, micTarget]);

  const color = incognito ? Colors.incognito : Colors.primary;
  const brightColor = incognito ? Colors.incognitoBright : Colors.primaryBright;

  return (
    <View pointerEvents="none" style={styles.backdrop}>
      <ReplyLobe color={color} weights={weights} phase={phase} />
      <ReplyLobe color={brightColor} tint weights={weights} phase={phase} />
      <View style={styles.grid}>
        {Array.from({ length: CELLS }, (_, i) => (
          <GlowCell
            key={i}
            row={i < COLS ? 0 : 1}
            col={i % COLS}
            color={color}
            weights={weights}
            levels={levels}
            head={head}
            phase={phase}
          />
        ))}
      </View>
    </View>
  );
}

//one light of the grid, driven by the thinking orbit, the voice rings and the reply see-saw
function GlowCell({
  row,
  col,
  color,
  weights,
  levels,
  head,
  phase,
}: {
  row: 0 | 1;
  col: number;
  color: string;
  weights: SharedValue<number[]>;
  levels: SharedValue<number[]>;
  head: SharedValue<number>;
  phase: SharedValue<number>;
}) {
  //position on the loop: top row goes right, bottom row comes back
  const index = row === 0 ? col : CELLS - 1 - col;
  const ring = Math.floor(Math.abs(col - (COLS - 1) / 2));

  const animatedStyle = useAnimatedStyle(() => {
    const [wVoice, wThink, wReply] = weights.value;

    //signed distance behind the head, smoothstep on both sides
    const behind = ((((head.value - index + ORBIT_AHEAD) % CELLS) + CELLS) % CELLS) - ORBIT_AHEAD;
    const t = behind < 0 ? 1 + behind / ORBIT_AHEAD : Math.max(0, 1 - behind / ORBIT_TAIL);
    const think = 0.1 + 0.9 * t * t * (3 - 2 * t);

    const voice = 0.2 + 0.8 * levels.value[ring];

    //slow see-saw, top and bottom rows in opposite phase with a slight lean along the bar
    const swing = 0.5 + 0.5 * Math.sin(phase.value * REPLY_SWING - col * 0.12);
    const reply = 0.12 + 0.73 * (row === 0 ? swing : 1 - swing);

    return { opacity: wVoice * voice + wThink * think + wReply * reply };
  });

  return (
    <Reanimated.View
      style={[
        styles.cell,
        row === 0 ? styles.cellTop : styles.cellBottom,
        { left: `${col * (100 / COLS)}%`, backgroundColor: color, boxShadow: `0px ${row === 0 ? 0 : 4}px 24px 7px ${color}` },
        animatedStyle,
      ]}
    />
  );
}

//soft reply base, the tint layer drifts in and out to shift the overall color
function ReplyLobe({
  color,
  tint = false,
  weights,
  phase,
}: {
  color: string;
  tint?: boolean;
  weights: SharedValue<number[]>;
  phase: SharedValue<number>;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const wReply = weights.value[2];
    const drift = 0.5 + 0.5 * Math.sin(phase.value * (tint ? 0.8 : 1.1));
    return { opacity: wReply * (tint ? 0.4 * drift : 0.2 + 0.05 * drift) };
  });

  return (
    <Reanimated.View
      style={[styles.lobe, { backgroundColor: color, boxShadow: `0px 5px 24px 8px ${color}` }, animatedStyle]}
    />
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  lobe: {
    position: "absolute",
    top: 8,
    bottom: 8,
    left: 20,
    right: 20,
    borderRadius: Radius.window,
  },
  grid: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: GRID_INSET,
    right: GRID_INSET,
  },
  cell: {
    position: "absolute",
    width: `${100 / COLS}%`,
    height: 8,
    borderRadius: 3,
  },
  //bodies stay under the bar, only the glow leaks out
  cellTop: {
    top: 8,
  },
  cellBottom: {
    bottom: 8,
  },
});
