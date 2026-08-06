import { Pressable, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { Colors, Radius } from "../../../constants/theme";

type ToggleProps = {
  checked: boolean;
  onToggle: (value: boolean) => void;
  disabled?: boolean;
};

// custom toggle switch component matching design
export default function Toggle({ checked, onToggle, disabled = false }: ToggleProps) {
  const thumbStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateX: withTiming(checked ? 16 : 0, { duration: 200 }),
        },
      ],
      backgroundColor: checked ? Colors.surface : Colors.primary,
    };
  });

  return (
    <Pressable
      style={({ pressed, hovered }) => [
        styles.track,
        checked ? styles.trackChecked : styles.trackUnchecked,
        (pressed || hovered) && !disabled && { opacity: 0.8 },
        disabled && { opacity: 0.5 },
      ]}
      onPress={() => !disabled && onToggle(!checked)}
      disabled={disabled}
    >
      <Animated.View style={[styles.thumb, thumbStyle]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 40,
    height: 24,
    borderRadius: Radius.xl2,
    padding: 2,
    justifyContent: "center",
    borderWidth: 2,
  },
  trackChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.borderOnPrimary,
  },
  trackUnchecked: {
    backgroundColor: Colors.surface,
    borderColor: Colors.surfaceCode,
  },
  thumb: {
    width: 16,
    height: 16,
    borderRadius: Radius.xxl,
  },
});
