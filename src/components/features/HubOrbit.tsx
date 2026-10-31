import { useEffect } from "react";
import {
  Animated,
  Easing,
  Image,
  ImageSourcePropType,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from "react-native";
import { FontSizes, Fonts, Spacing, ThemeColors } from "../../../constants/theme";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { pressStyle } from "../ui/pressStyle";

//side of one square of the path
const PIXEL = 3;
const HUB_SIZE = 100;
const NODE_SIZE = 52;
const ICON_SIZE = 26;
const HUB_ICON_SIZE = 48;
const BASE_RADIUS = 110;
//room for a name under the node
const LABEL_HEIGHT = 18;
const LABEL_WIDTH = 120;
//one slow turn
const TURN_MS = 120000;

export type OrbitNode = {
  key: string;
  name: string;
  icon: ImageSourcePropType;
  //red and linked to the hub
  connected: boolean;
  onPress?: () => void;
};

type HubOrbitProps = {
  hubIcon: ImageSourcePropType;
  nodes: OrbitNode[];
  onHubPress?: () => void;
  //turns only while shown
  active?: boolean;
};

//the hub at the center, its devices turning around it
export default function HubOrbit({ hubIcon, nodes, onHubPress, active = true }: HubOrbitProps) {
  const styles = useThemedStyles(makeStyles);
  const Colors = useColors();
  const turn = useAnimatedValue(0);

  useEffect(() => {
    if (!active) return;
    turn.setValue(0);
    const loop = Animated.loop(
      Animated.timing(turn, {
        toValue: 360,
        duration: TURN_MS,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, turn]);

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
    <View style={[styles.stage, { width: side, height: stageHeight }]}>
      {/* path of the devices, still so the squares stay upright */}
      <View style={[styles.path, { width: 2 * radius, height: 2 * radius, top: stageHeight / 2 - radius }]} pointerEvents="none">
        {pixels.map((pixel, i) => (
          <View key={i} style={[styles.pixel, { width: pixelSize, height: pixelSize }, pixel]} />
        ))}
      </View>
      <Animated.View
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
                <Pressable
                  disabled={!node.onPress}
                  style={pressStyle(
                    [styles.circle, styles.nodeCircle, { width: nodeSize, height: nodeSize, borderRadius: nodeSize / 2 }, node.connected && styles.nodeConnected],
                    node.connected ? "primary" : "surface",
                  )}
                  onPress={() => {
                    Vibration.vibrate(8);
                    node.onPress?.();
                  }}
                >
                  <Image
                    source={node.icon}
                    style={{ width: ICON_SIZE * scale, height: ICON_SIZE * scale }}
                    tintColor={node.connected ? Colors.textOnPrimary : Colors.textPrimary}
                  />
                </Pressable>
                <Text style={[styles.label, { top: nodeSize + Spacing.sm, left: (nodeSize - LABEL_WIDTH) / 2, fontSize: FontSizes.label * scale }, !node.connected && styles.labelIdle]} numberOfLines={1}>
                  {node.name.toUpperCase()}
                </Text>
              </Animated.View>
            </View>
          );
        })}
      </Animated.View>

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
          <Image source={hubIcon} style={{ width: HUB_ICON_SIZE * scale, height: HUB_ICON_SIZE * scale }} tintColor={Colors.textOnPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
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
    label: {
      position: "absolute",
      top: NODE_SIZE + Spacing.sm,
      left: (NODE_SIZE - LABEL_WIDTH) / 2,
      width: LABEL_WIDTH,
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
