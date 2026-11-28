import { useEffect } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, Vibration } from "react-native";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import AppIcon, { IconSource } from "./AppIcon";
import { pressStyle } from "./pressStyle";

const ENTRANCE_DURATION = 320;
const ENTRANCE_DELAY_STEP = 90;
const ENTRANCE_SCALE = 0.94;
const ENTRANCE_RISE = 8;
//barely overshoots
const ENTRANCE_BOUNCE = 1.1;

export type SuggestionPillProps = {
  icon: IconSource;
  label: string;
  onPress: () => void;
  width?: number;
  //position in the list, staggers the entrance
  index?: number;
  disabled?: boolean;
};

//mirror of the source pill
export default function SuggestionPill({ icon, label, onPress, width, index = 0, disabled = false }: SuggestionPillProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);

  //streaming mounts add their own stagger
  const entrance = useAnimatedValue(0);
  useEffect(() => {
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: ENTRANCE_DURATION,
      delay: index * ENTRANCE_DELAY_STEP,
      easing: Easing.out(Easing.back(ENTRANCE_BOUNCE)),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [entrance, index]);

  return (
    <Animated.View
      style={{
        width,
        opacity: entrance.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" }),
        transform: [
          { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [ENTRANCE_RISE, 0] }) },
          { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [ENTRANCE_SCALE, 1] }) },
        ],
      }}
    >
      <Pressable
        onPress={() => {
          Vibration.vibrate(10);
          onPress();
        }}
        disabled={disabled}
        style={pressStyle([styles.pill, disabled && { opacity: 0.4 }], !disabled && "surface")}
      >
        <AppIcon source={icon} style={styles.icon} tintColor={Colors.textMuted} />
        <Text style={styles.label}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  pill: {
    //grow keeps height auto in a column
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: Radius.huge,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  icon: {
    width: 20,
    height: 20,
  },
  label: {
    flex: 1,
    color: Colors.textSecondary,
    fontFamily: Fonts.mono,
    fontSize: FontSizes.label,
    lineHeight: 17,
  },
});
