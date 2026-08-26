import { useEffect } from "react";
import { Animated, Easing, Image, ImageSourcePropType, Pressable, StyleSheet, Text } from "react-native";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { useColors, useThemedStyles } from "../../hooks/useTheme";

const ENTRANCE_DURATION = 260;
const ENTRANCE_SCALE = 0.1;
const ENTRANCE_BOUNCE = 1;

export type SuggestionPillProps = {
  icon: ImageSourcePropType;
  label: string;
  onPress: () => void;
  width?: number;
  disabled?: boolean;
};

//mirror of the source pill
export default function SuggestionPill({ icon, label, onPress, width, disabled = false }: SuggestionPillProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);

  //streaming mounts give free stagger
  const entrance = useAnimatedValue(0);
  useEffect(() => {
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: ENTRANCE_DURATION,
      easing: Easing.out(Easing.back(ENTRANCE_BOUNCE)),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [entrance]);

  return (
    <Animated.View
      style={{
        width,
        opacity: entrance.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" }),
        transform: [
          { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [ENTRANCE_SCALE, 1] }) },
        ],
      }}
    >
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed, hovered }) => [
          styles.pill,
          !disabled && (pressed || hovered) && { backgroundColor: Colors.surfacePressed },
          disabled && { opacity: 0.4 },
        ]}
      >
        <Image source={icon} style={styles.icon} tintColor={Colors.textMuted} />
        <Text style={styles.label}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  pill: {
    flex: 1,
    alignItems: "flex-start",
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: Radius.xxl,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  icon: {
    width: 20,
    height: 20,
  },
  label: {
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: FontSizes.label,
    lineHeight: 17,
  },
});
