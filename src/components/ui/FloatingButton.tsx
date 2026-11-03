import {
  Animated as RNAnimated,
  Image,
  ImageSourcePropType,
  Pressable,
  StyleSheet,
  Vibration,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Radius, ThemeColors } from "../../../constants/theme";
import { useShadowShift } from "../../hooks/useShadowShift";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { pressStyle } from "./pressStyle";

type FloatingButtonProps = {
  icon: ImageSourcePropType;
  onPress: () => void;
};

//how far the button can pull from its anchor before resistance dominates
const DRAG_RANGE = 18;
//how much of the pull the shadow echoes, so it stays visibly tethered
const SHADOW_FOLLOW_RATIO = 0.5;

//rubber-band curve resists further pull
const rubberBand = (d: number, dim: number) => {
  "worklet";
  if (dim <= 0) return 0;
  const sign = d < 0 ? -1 : 1;
  return sign * dim * (1 - 1 / (1 + Math.abs(d) / dim));
};

//red square with an ink shadow, placed by its parent
export default function FloatingButton({ icon, onPress }: FloatingButtonProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const shadowShift = useShadowShift();

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .activeOffsetY([-10, 10])
    .onUpdate((e) => {
      //resist the radial pull, not each axis on its own, so the reach is a circle
      const distance = Math.sqrt(e.translationX ** 2 + e.translationY ** 2);
      const pulled = rubberBand(distance, DRAG_RANGE);
      const ratio = distance > 0 ? pulled / distance : 0;
      translateX.value = e.translationX * ratio;
      translateY.value = e.translationY * ratio;
    })
    .onEnd(() => {
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  //shadow echoes the pull at a reduced ratio, so it stays tethered to the button
  const shadowDragStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value * SHADOW_FOLLOW_RATIO },
      { translateY: translateY.value * SHADOW_FOLLOW_RATIO },
    ],
  }));

  return (
    <View style={styles.container}>
      <RNAnimated.View
        style={[styles.shadowAnchor, { transform: shadowShift.getTranslateTransform() }]}
        pointerEvents="none">
        <Animated.View style={[styles.shadow, shadowDragStyle]} />
      </RNAnimated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={animatedStyle}>
          <Pressable
            onPressIn={() => {
              scale.value = withTiming(1.2, { duration: 120 });
            }}
            onPressOut={() => {
              scale.value = withTiming(1, { duration: 150 });
            }}
            onPress={() => {
              Vibration.vibrate(10);
              onPress();
            }}
            style={pressStyle(styles.button, "primary")}>
            <Image source={icon} style={styles.icon} tintColor={Colors.textOnPrimary} />
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      width: 56,
      height: 56,
    },
    shadowAnchor: {
      position: "absolute",
      top: 4,
      left: -4,
      width: 56,
      height: 56,
    },
    shadow: {
      width: 56,
      height: 56,
      backgroundColor: Colors.shadowInk,
      borderRadius: Radius.huge,
    },
    button: {
      width: 56,
      height: 56,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: Colors.primary,
      borderWidth: 2,
      borderColor: Colors.borderOnPrimary,
      borderRadius: Radius.huge,
    },
    icon: {
      width: 24,
      height: 24,
    },
  });
