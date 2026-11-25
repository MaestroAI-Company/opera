import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  Vibration,
  View,
} from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { FontSizes, Fonts, Spacing, ThemeColors } from "../../../constants/theme";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { type IconSource } from "../ui/AppIcon";
import AppIcon from "../ui/AppIcon";
import { pressStyle } from "../ui/pressStyle";
import { useHomeEditing } from "./homeEditing";

//side of one square of the path
const PIXEL = 3;
const HUB_SIZE = 100;
const NODE_SIZE = 52;
const ICON_SIZE = 26;
const HUB_ICON_SIZE = 48;
const BASE_RADIUS = 110;
//room for a name beside the node
const LABEL_HEIGHT = 18;
const LABEL_WIDTH = 120;
//narrowest a name gets squeezed when the card is tight
const MIN_LABEL_WIDTH = 40;
//fragment mono advance, in em
const MONO_ADVANCE = 0.62;
//turn angles where a name offset is sampled, the native driver only interpolates
const LABEL_TURNS = Array.from({ length: 121 }, (_, i) => i * 3);
//one slow turn
const TURN_MS = 120000;
//extra reach around a node
const TAP_SLOP = 6;
//one circle going from the hub to its full size
const RIPPLE_MS = 7500;
//circles out at the same time
const RIPPLES = 2;
//strength of a circle at its peak
const RIPPLE_OPACITY = 0.45;
//share of the way out spent fading in
const RIPPLE_FADE_IN = 0.15;
//strength from center to edge, evenly spaced
const RIPPLE_WAVE = [0, 0.8, 0.5, 0.2, 0];

export type OrbitNode = {
  key: string;
  name: string;
  icon: IconSource;
  //red and linked to the hub
  connected: boolean;
  onPress?: () => void;
};

type HubOrbitProps = {
  hubIcon: IconSource;
  nodes: OrbitNode[];
  onHubPress?: () => void;
  //turns only while shown
  active?: boolean;
  //no path drawn under the devices
  bareHub?: boolean;
  //circles leaving the hub or coming back to it
  ripple?: "out" | "in";
};

type RipplesProps = {
  //size of the hub they leave from
  from: number;
  //radius where they fade out
  reach: number;
  active: boolean;
  //same circles played backward
  inward: boolean;
};

//circles growing from the hub, fading as they go
function Ripples({ from, reach, active, inward }: RipplesProps) {
  const styles = useThemedStyles(makeStyles);
  const Colors = useColors();
  const clock = useAnimatedValue(0);

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.timing(clock, {
        toValue: 1,
        duration: RIPPLE_MS,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, clock]);

  return (
    <View style={[styles.ripples, { width: 2 * reach, height: 2 * reach, marginLeft: -reach, marginTop: -reach }]} pointerEvents="none">
      {Array.from({ length: RIPPLES }, (_, k) => {
        //each circle starts a share of a loop later
        const shift = k / RIPPLES;
        const outward = shift
          ? clock.interpolate({ inputRange: [0, 1 - shift, 1 - shift + 0.0001, 1], outputRange: [shift, 1, 0, shift] })
          : clock;
        const progress = inward ? Animated.subtract(1, outward) : outward;
        return (
          <Animated.View
            key={k}
            style={[
              styles.ripple,
              {
                //fades in so a new circle never pops
                opacity: progress.interpolate({ inputRange: [0, RIPPLE_FADE_IN, 1], outputRange: [0, RIPPLE_OPACITY, 0] }),
                transform: [
                  {
                    scale: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [from / (2 * reach), 1],
                      easing: Easing.out(Easing.quad),
                    }),
                  },
                ],
              },
            ]}
          >
            {/* swell near the center easing out to the edge */}
            <Svg width="100%" height="100%" viewBox="0 0 2 2">
              <Defs>
                <RadialGradient id={`ripple-${k}`} cx="1" cy="1" r="1" gradientUnits="userSpaceOnUse">
                  {RIPPLE_WAVE.map((opacity, i) => (
                    <Stop key={i} offset={i / (RIPPLE_WAVE.length - 1)} stopColor={Colors.primary} stopOpacity={opacity} />
                  ))}
                </RadialGradient>
              </Defs>
              <Circle cx="1" cy="1" r="1" fill={`url(#ripple-${k})`} />
            </Svg>
          </Animated.View>
        );
      })}
    </View>
  );
}

type OrbitLabelProps = {
  name: string;
  //slot of the device on the ring
  angle: number;
  turn: Animated.Value;
  nodeSize: number;
  gap: number;
  //width the name takes
  width: number;
  maxWidth: number;
  fontSize: number;
  idle: boolean;
};

//nearest the name box sits along the way out without touching the device
function reachOut(a: number, halfW: number, halfH: number, clear: number) {
  const ux = Math.sin(a);
  const uy = -Math.cos(a);
  let lo = 0;
  let hi = clear + halfW + halfH;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const dist = Math.hypot(Math.max(Math.abs(mid * ux) - halfW, 0), Math.max(Math.abs(mid * uy) - halfH, 0));
    if (dist < clear) lo = mid;
    else hi = mid;
  }
  return hi;
}

//the name stays on the far side of its device, away from the hub
function OrbitLabel({ name, angle, turn, nodeSize, gap, width, maxWidth, fontSize, idle }: OrbitLabelProps) {
  const styles = useThemedStyles(makeStyles);
  //upright frame of the device, the hub is behind it whatever the turn
  const offset = useMemo(() => {
    const x: number[] = [];
    const y: number[] = [];
    for (const t of LABEL_TURNS) {
      const a = ((angle + t) * Math.PI) / 180;
      const reach = reachOut(a, width / 2, LABEL_HEIGHT / 2, nodeSize / 2 + gap);
      x.push(reach * Math.sin(a));
      y.push(-reach * Math.cos(a));
    }
    return {
      x: turn.interpolate({ inputRange: LABEL_TURNS, outputRange: x }),
      y: turn.interpolate({ inputRange: LABEL_TURNS, outputRange: y }),
    };
  }, [angle, turn, nodeSize, gap, width]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.labelBox,
        { left: (nodeSize - LABEL_WIDTH) / 2, top: (nodeSize - LABEL_HEIGHT) / 2, transform: [{ translateX: offset.x }, { translateY: offset.y }] },
      ]}
    >
      <Text style={[styles.label, { maxWidth, fontSize }, idle && styles.labelIdle]} numberOfLines={1}>
        {name.toUpperCase()}
      </Text>
    </Animated.View>
  );
}

//the hub at the center, its devices turning around it
export default function HubOrbit({ hubIcon, nodes, onHubPress, active = true, bareHub = false, ripple }: HubOrbitProps) {
  const styles = useThemedStyles(makeStyles);
  const Colors = useColors();
  const turn = useAnimatedValue(0);
  const angleRef = useRef(0);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const pressedNode = useRef<OrbitNode | undefined>(undefined);
  //room the card gives, a name can't leave it
  const { width: windowWidth } = useWindowDimensions();
  const [avail, setAvail] = useState(windowWidth);

  //the ring turns natively, keep its angle for taps
  useEffect(() => {
    const id = turn.addListener(({ value }) => {
      angleRef.current = value;
    });
    return () => turn.removeListener(id);
  }, [turn]);

  //still while the home is edited, the drag has the frames
  const editing = useHomeEditing();

  useEffect(() => {
    if (!active || editing) return;
    const useNativeDriver = Platform.OS !== "web";
    let loop: Animated.CompositeAnimation | undefined;
    //a pause keeps the angle, the turn resumes from it
    const rest = Animated.timing(turn, {
      toValue: 360,
      duration: TURN_MS * (1 - angleRef.current / 360),
      easing: Easing.linear,
      useNativeDriver,
    });
    rest.start(({ finished }) => {
      if (!finished) return;
      turn.setValue(0);
      loop = Animated.loop(
        Animated.timing(turn, {
          toValue: 360,
          duration: TURN_MS,
          easing: Easing.linear,
          useNativeDriver,
        }),
      );
      loop.start();
    });
    return () => {
      rest.stop();
      loop?.stop();
    };
  }, [active, editing, turn]);

  //more devices need a wider ring
  const baseRadius = Math.max(BASE_RADIUS, (nodes.length * (NODE_SIZE + Spacing.xl2)) / (2 * Math.PI));
  const baseSide = 2 * (baseRadius + NODE_SIZE / 2 + LABEL_HEIGHT + Spacing.sm);
  const side = baseSide;
  const scale = 1;
  const radius = baseRadius * scale;
  const nodeSize = NODE_SIZE * scale;
  const hubSize = HUB_SIZE * scale;
  const pixelSize = Math.max(PIXEL, Math.round(PIXEL * scale));
  const stageHeight = side;
  //connected devices touch the hub
  const nearRadius = hubSize / 2 + nodeSize / 2;
  const orbitAngle = turn.interpolate({ inputRange: [0, 360], outputRange: ["0deg", "360deg"] });
  //names and icons stay upright while the ring turns
  const upright = turn.interpolate({ inputRange: [0, 360], outputRange: ["0deg", "-360deg"] });
  const labelFont = FontSizes.label * scale;
  const gap = Spacing.sm;
  //a name pointing sideways reaches out, so it is cut to what the card leaves
  const nameRoom = Math.min(LABEL_WIDTH, Math.max(MIN_LABEL_WIDTH, avail / 2 - radius - nodeSize / 2 - gap));
  const nameWidths = nodes.map((node) => Math.min(nameRoom, node.name.length * MONO_ADVANCE * labelFont));
  const stageWidth = 2 * (radius + nodeSize / 2 + gap + Math.max(LABEL_HEIGHT, ...nameWidths));

  //the node under a tap, from the ring angle at that moment
  const findNode = (x: number, y: number) => {
    const cx = stageWidth / 2;
    const cy = stageHeight / 2;
    let hit: OrbitNode | undefined;
    let best = nodeSize / 2 + TAP_SLOP;
    nodes.forEach((node, index) => {
      if (!node.onPress) return;
      const a = ((index * 360) / nodes.length + angleRef.current) * (Math.PI / 180);
      const d = node.connected ? nearRadius : radius;
      const dist = Math.hypot(x - (cx + d * Math.sin(a)), y - (cy - d * Math.cos(a)));
      if (dist < best) {
        best = dist;
        hit = node;
      }
    });
    return hit;
  };

  //whole pixels keep the squares crisp
  const count = Math.round((2 * Math.PI * radius) / (pixelSize * 3));
  const pixels = Array.from({ length: count }, (_, i) => {
    const a = (i * 2 * Math.PI) / count;
    return {
      left: Math.round(radius + radius * Math.sin(a) - pixelSize / 2),
      top: Math.round(radius - radius * Math.cos(a) - pixelSize / 2),
    };
  });

  return (
    <View style={styles.fit} onLayout={(e) => setAvail(e.nativeEvent.layout.width)}>
      <View style={[styles.stage, { width: stageWidth, height: stageHeight }]}>
        {ripple && (
          <View style={[styles.rippleCenter, { left: stageWidth / 2, top: stageHeight / 2 }]} pointerEvents="none">
            {/* past the devices so it reaches them */}
            <Ripples from={hubSize} reach={radius + nodeSize} active={active && !editing} inward={ripple === "in"} />
          </View>
        )}
        {/* path of the devices, still so the squares stay upright */}
        {!bareHub && (
          <View style={[styles.path, { width: 2 * radius, height: 2 * radius, top: stageHeight / 2 - radius }]} pointerEvents="none">
            {pixels.map((pixel, i) => (
              <View key={i} style={[styles.pixel, { width: pixelSize, height: pixelSize }, pixel]} />
            ))}
          </View>
        )}
        <Animated.View
          pointerEvents="none"
          style={{
            width: 2 * radius,
            height: 2 * radius,
            marginTop: stageHeight / 2 - radius,
            transform: [{ rotate: orbitAngle }],
          }}
        >
          {nodes.map((node, index) => {
            const angle = (index * 360) / nodes.length;
            return (
              <View key={node.key} style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${angle}deg` }] }]} pointerEvents="box-none">
                <Animated.View
                  style={[
                    styles.node,
                    { left: radius - nodeSize / 2, top: (node.connected ? radius - nearRadius : 0) - nodeSize / 2, width: nodeSize, height: nodeSize, transform: [{ rotate: `${-angle}deg` }, { rotate: upright }] },
                  ]}
                  pointerEvents="box-none"
                >
                  <View
                    style={pressStyle(
                      [styles.circle, styles.nodeCircle, { width: nodeSize, height: nodeSize, borderRadius: nodeSize / 2 }, node.connected && styles.nodeConnected],
                      node.connected ? "primary" : "surface",
                    )({ pressed: pressedKey === node.key && !!node.onPress, hovered: false })}
                  >
                    <AppIcon
                      source={node.icon}
                      style={{ width: ICON_SIZE * scale, height: ICON_SIZE * scale }}
                      tintColor={node.connected ? Colors.textOnPrimary : Colors.textPrimary}
                    />
                  </View>
                  <OrbitLabel
                    name={node.name}
                    angle={angle}
                    turn={turn}
                    nodeSize={nodeSize}
                    gap={gap}
                    width={nameWidths[index]}
                    maxWidth={nameRoom}
                    fontSize={labelFont}
                    idle={!node.connected}
                  />
                </Animated.View>
              </View>
            );
          })}
        </Animated.View>
  
        {/* taps resolved here, above the moving ring */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPressIn={(e) => {
            pressedNode.current = findNode(e.nativeEvent.locationX, e.nativeEvent.locationY);
            setPressedKey(pressedNode.current?.key ?? null);
          }}
          onPressOut={() => setPressedKey(null)}
          onPress={() => {
            //web clicks carry no position, so reuse the node found at press start
            const node = pressedNode.current;
            pressedNode.current = undefined;
            if (!node) return;
            Vibration.vibrate(8);
            node.onPress?.();
          }}
        />
  
        {/* above the devices */}
        <View style={[styles.hubWrap, { top: (stageHeight - hubSize) / 2 }]} pointerEvents="box-none">
          <Pressable
            disabled={!onHubPress}
            style={pressStyle([styles.circle, styles.hub, { width: hubSize, height: hubSize, borderRadius: hubSize / 2 }], "primary")}
            onPress={() => {
              Vibration.vibrate(8);
              onHubPress?.();
            }}
          >
            <AppIcon source={hubIcon} style={{ width: HUB_ICON_SIZE * scale, height: HUB_ICON_SIZE * scale }} tintColor={Colors.textOnPrimary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    fit: {
      alignSelf: "stretch",
      alignItems: "center",
    },
    stage: {
      alignSelf: "center",
      alignItems: "center",
    },
    hubWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      alignItems: "center",
    },
    circle: {
      alignItems: "center",
      justifyContent: "center",
    },
    path: {
      position: "absolute",
      alignSelf: "center",
    },
    rippleCenter: {
      position: "absolute",
    },
    ripples: {
      alignItems: "center",
      justifyContent: "center",
    },
    ripple: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    pixel: {
      position: "absolute",
      width: PIXEL,
      height: PIXEL,
      backgroundColor: Colors.border,
    },
    hub: {
      width: HUB_SIZE,
      height: HUB_SIZE,
      borderRadius: HUB_SIZE / 2,
      backgroundColor: Colors.primary,
      borderWidth: 2,
      borderColor: Colors.borderOnPrimary,
    },
    hubIcon: {
      width: HUB_ICON_SIZE,
      height: HUB_ICON_SIZE,
    },
    node: {
      position: "absolute",
      top: -NODE_SIZE / 2,
      width: NODE_SIZE,
      height: NODE_SIZE,
    },
    nodeCircle: {
      width: NODE_SIZE,
      height: NODE_SIZE,
      borderRadius: NODE_SIZE / 2,
      backgroundColor: Colors.surfacePressed,
      borderWidth: 2,
      borderColor: Colors.border,
    },
    nodeConnected: {
      backgroundColor: Colors.primary,
      borderColor: Colors.borderOnPrimary,
    },
    nodeIcon: {
      width: ICON_SIZE,
      height: ICON_SIZE,
    },
    labelBox: {
      position: "absolute",
      width: LABEL_WIDTH,
      height: LABEL_HEIGHT,
      alignItems: "center",
      justifyContent: "center",
    },
    label: {
      //web caps text at its parent width
      maxWidth: LABEL_WIDTH,
      textAlign: "center",
      fontFamily: Fonts.mono,
      fontSize: FontSizes.label,
      color: Colors.textPrimary,
    },
    labelIdle: {
      color: Colors.textSecondary,
    },
  });
