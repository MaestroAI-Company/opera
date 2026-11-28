import { ReactNode } from "react";
import { ImageStyle, Pressable, StyleProp, StyleSheet, Text, TextStyle, Vibration, View, ViewStyle } from "react-native";
import { FontSizes, Fonts, Radius, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import AppIcon, { IconSource } from "./AppIcon";

export type ActionButtonProps = {
  icon?: IconSource;
  iconStyle?: StyleProp<ImageStyle>;
  label: string;
  labelStyle?: StyleProp<TextStyle>;
  rightElement?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  //highlight: white text/icon on the brand red, meant for a <Group style={{backgroundColor: Colors.primary}}>
  variant?: "default" | "highlight";
  //badge: icon in brand red on a tinted square, like the settings home rows
  iconBadge?: boolean;
  //off for plain navigation rows
  haptic?: boolean;
};

//action button for settings actions and lists, wrap in <Group> to get a shared frame
export default function ActionButton({
  icon,
  iconStyle,
  label,
  labelStyle,
  rightElement,
  onPress,
  disabled = false,
  style,
  variant = "default",
  iconBadge = false,
  haptic = true,
}: ActionButtonProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const isHighlight = variant === "highlight";

  return (
    <Pressable
      style={({ pressed, hovered }) => [
        styles.navItem,
        (pressed || hovered) && !disabled && (isHighlight ? { backgroundColor: Colors.primaryBright } : styles.navItemPressed),
        style,
      ]}
      onPress={() => {
        if (haptic) Vibration.vibrate(10);
        onPress?.();
      }}
      disabled={disabled || !onPress}
    >
      {icon && (iconBadge ? (
        <View style={styles.menuIconWrap}>
          <AppIcon source={icon} style={[styles.menuIcon, iconStyle]} tintColor={Colors.textOnPrimary} />
        </View>
      ) : (
        <AppIcon source={icon} style={[styles.menuIcon, iconStyle]} tintColor={isHighlight ? Colors.textOnPrimary : Colors.textPrimary} />
      ))}
      <Text style={[styles.navLabel, isHighlight && { color: Colors.textOnPrimary }, labelStyle]} numberOfLines={1} ellipsizeMode="tail">{label}</Text>
      {rightElement}
    </Pressable>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
  },
  navItemPressed: {
    backgroundColor: Colors.surfacePressed,
  },
  menuIcon: {
    width: 18,
    height: 18,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.xxl,
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: Colors.borderOnPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  navLabel: {
    flex: 1,
    fontSize: FontSizes.body,
    fontFamily: Fonts.mono,
    color: Colors.textPrimary,
  },
});
