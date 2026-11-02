import { Image, ImageSourcePropType, Pressable, StyleSheet, Vibration, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Radius, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { pressStyle } from "./pressStyle";

type FloatingButtonProps = {
  icon: ImageSourcePropType;
  onPress: () => void;
};

//red square with an ink shadow, placed by its parent
export default function FloatingButton({ icon, onPress }: FloatingButtonProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <View style={styles.shadow} pointerEvents="none" />
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
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      width: 56,
      height: 56,
    },
    shadow: {
      position: "absolute",
      top: 4,
      left: -4,
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
