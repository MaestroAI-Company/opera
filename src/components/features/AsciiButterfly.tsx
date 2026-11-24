import { memo, useEffect, useRef, useState } from "react";
import { Animated, LayoutChangeEvent, StyleSheet, View } from "react-native";
import Svg, { G, Path } from "react-native-svg";
import { Colors } from "../../../constants/theme";

export type AsciiLayer = { ink: string; light: string; accent: string };
//shade fades a wing pair as it turns from the light, 0 is the drawn look
export type AsciiWing = AsciiLayer & { shade: number };
export type AsciiPose = { still: AsciiLayer; far: AsciiWing; near: AsciiWing };

//baked once from the butterfly art
export type AsciiFrames = {
  //grid size in squares, every pose fits in it
  cols: number;
  rows: number;
  //where the rest pose sits in the grid, it is what fills the view
  rest: { x: number; y: number; cols: number; rows: number };
  //share of a cell the square fills
  fill: number;
  //pose i has the wings turned by phiMin + i * phiStep degrees
  phiMin: number;
  phiStep: number;
  restPose: number;
  //one tap plays these flaps in a row, amp is the deepest stroke in degrees
  flaps: { amp: number; ms: number }[];
  //shape of one flap as [time, share of amp], eased between keys
  flapKeys: number[][];
  //optional lift over the whole sequence as [time share, squares up], eased between keys
  rise?: number[][];
  poses: AsciiPose[];
};

//flap angle for a time in the flap sequence, null once it is over
function flapAt(frames: AsciiFrames, elapsed: number): number | null {
  const keys = frames.flapKeys;
  let start = 0;
  for (const flap of frames.flaps) {
    if (elapsed < start + flap.ms) {
      const u = (elapsed - start) / flap.ms;
      let k = 1;
      while (k < keys.length - 1 && u > keys[k][0]) k++;
      const [u0, v0] = keys[k - 1];
      const [u1, v1] = keys[k];
      const t = (u - u0) / (u1 - u0);
      const eased = t * t * (3 - 2 * t);
      return flap.amp * (v0 + (v1 - v0) * eased);
    }
    start += flap.ms;
  }
  return null;
}

//squares the butterfly floats up at a time in the flap sequence
function riseAt(frames: AsciiFrames, elapsed: number): number {
  const keys = frames.rise;
  if (!keys) return 0;
  const total = frames.flaps.reduce((sum, flap) => sum + flap.ms, 0);
  const u = Math.min(1, elapsed / total);
  let k = 1;
  while (k < keys.length - 1 && u > keys[k][0]) k++;
  const [u0, v0] = keys[k - 1];
  const [u1, v1] = keys[k];
  const t = (u - u0) / (u1 - u0);
  return v0 + (v1 - v0) * t * t * (3 - 2 * t);
}

//nearest baked pose for a flap angle
function poseFor(frames: AsciiFrames, phi: number): number {
  const index = Math.round((phi - frames.phiMin) / frames.phiStep);
  return Math.max(0, Math.min(frames.poses.length - 1, index));
}

type LayerProps = {
  layer: AsciiLayer;
  //0 is the drawn look, it fades the ink and veils the white as a wing pair turns from the light
  shade: number;
  accentColor: string;
  fill: number;
};

function Layer({ layer, shade, accentColor, fill }: LayerProps) {
  //squares packed edge to edge draw each run as one solid stroke, a hair thicker so rows never show a seam
  const solid = fill >= 1;
  const stroke = solid ? 1.04 : fill;
  const dash = solid ? undefined : [fill, 1 - fill];
  const fade = 1 - shade * 0.5;
  return (
    <G>
      {!!layer.light && (
        <Path d={layer.light} stroke={Colors.surface} strokeWidth={stroke} strokeDasharray={dash} />
      )}
      {!!layer.light && shade > 0 && (
        <Path
          d={layer.light}
          stroke={Colors.textPrimary}
          strokeOpacity={shade * 0.4}
          strokeWidth={stroke}
          strokeDasharray={dash}
        />
      )}
      {!!layer.ink && (
        <Path
          d={layer.ink}
          stroke={Colors.textPrimary}
          strokeOpacity={fade}
          strokeWidth={stroke}
          strokeDasharray={dash}
        />
      )}
      {!!layer.accent && (
        <Path
          d={layer.accent}
          stroke={accentColor}
          strokeOpacity={fade}
          strokeWidth={stroke}
          strokeDasharray={dash}
        />
      )}
    </G>
  );
}

type Props = {
  frames: AsciiFrames;
  accentColor: string;
  //each new value plays the flap sequence once
  playKey: number;
};

//a butterfly drawn as a grid of squares, its wings flap in 3d around the body
//the rest pose fills the view like the contained image does, open wings may reach past it
function AsciiButterfly({ frames, accentColor, playKey }: Props) {
  const [pose, setPose] = useState(frames.restPose);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const playing = useRef(false);
  const frame = useRef(0);
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    //a tap during the flaps does not restart them
    if (playKey === 0 || playing.current) return;
    playing.current = true;
    const startedAt = Date.now();
    let last = frames.restPose;

    const tick = () => {
      const phi = flapAt(frames, Date.now() - startedAt);
      if (phi === null) {
        rise.setValue(0);
        setPose(frames.restPose);
        playing.current = false;
        return;
      }
      rise.setValue(riseAt(frames, Date.now() - startedAt));
      const next = poseFor(frames, phi);
      if (next !== last) {
        last = next;
        setPose(next);
      }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    //a new butterfly remounts this view
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  };

  const { rest, fill } = frames;
  const current = frames.poses[pose];
  const scale = size ? Math.min(size.width / rest.cols, size.height / rest.rows) : 0;
  const lift = { transform: [{ translateY: Animated.multiply(rise, -scale) }] };

  return (
    <Animated.View style={[styles.fill, lift]} onLayout={onLayout}>
      {size && scale > 0 && (
        <Svg
          width={frames.cols * scale}
          height={frames.rows * scale}
          viewBox={`0 0 ${frames.cols} ${frames.rows}`}
          style={{
            position: "absolute",
            left: size.width / 2 - (rest.x + rest.cols / 2) * scale,
            top: size.height / 2 - (rest.y + rest.rows / 2) * scale,
          }}
        >
          <Layer layer={current.still} shade={0} accentColor={accentColor} fill={fill} />
          <Layer layer={current.far} shade={current.far.shade} accentColor={accentColor} fill={fill} />
          <Layer layer={current.near} shade={current.near.shade} accentColor={accentColor} fill={fill} />
        </Svg>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: "100%",
    height: "100%",
  },
});

export default memo(AsciiButterfly);
