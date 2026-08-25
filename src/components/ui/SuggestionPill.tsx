import { useEffect } from "react";
import { Animated, Easing, Image, ImageSourcePropType, Pressable, StyleSheet, Text } from "react-native";
import { FontSizes, Fonts, Radius, ThemeColors } from "../../../constants/theme";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { useColors, useThemedStyles } from "../../hooks/useTheme";

const ENTRANCE_DURATION = 180;
//how far the pill rises into place
const ENTRANCE_RISE = 8;

export type SuggestionPillProps = {
  icon: ImageSourcePropType;
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

//mirror of the source pill
export default function SuggestionPill({ icon, label, onPress, disabled = false }: SuggestionPillProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);

  //streaming mounts give free stagger
  const entrance = useAnimatedValue(0);
  useEffect(() => {
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: ENTRANCE_DURATION,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [entrance]);

  return (
    <Animated.View
      style={{
        opacity: entrance,
        transform: [
          { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [ENTRANCE_RISE, 0] }) },
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
        <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: Radius.xxl,
    paddingLeft: 6,
    paddingRight: 10,
    paddingVertical: 6,
    gap: 6,
    //fits a five word label
    maxWidth: 300,
  },
  icon: {
    width: 20,
    height: 20,
  },
  label: {
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: FontSizes.label,
    flexShrink: 1,
  },
});
