import { Pressable, StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";

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
      backgroundColor: checked ? "#FFFFFF" : "#FF1A1A",
    };
  });

  return (
    <Pressable
      style={({ pressed }) => [
        styles.track,
        checked ? styles.trackChecked : styles.trackUnchecked,
        pressed && !disabled && { opacity: 0.8 },
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
    borderRadius: 14,
    padding: 2,
    justifyContent: "center",
    borderWidth: 2,
  },
  trackChecked: {
    backgroundColor: "#FF1A1A",
    borderColor: "#E60000",
  },
  trackUnchecked: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E5E5E5",
  },
  thumb: {
    width: 16,
    height: 16,
    borderRadius: 10,
  },
});
