import { ReactNode } from "react";
import { Image, ImageSourcePropType, Pressable, StyleProp, StyleSheet, Text, ViewStyle } from "react-native";
import { FontSizes, Fonts, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";

export type ActionButtonProps = {
  icon?: ImageSourcePropType;
  label: string;
  rightElement?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  iconTintColor?: string;
  labelColor?: string;
};

//action button for settings actions and lists, wrap in <Group> to get a shared frame
export default function ActionButton({
  icon,
  label,
  rightElement,
  onPress,
  disabled = false,
  style,
  iconTintColor,
  labelColor,
}: ActionButtonProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      style={({ pressed, hovered }) => [
        styles.navItem,
        (pressed || hovered) && !disabled && styles.navItemPressed,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || !onPress}
    >
      {icon && <Image source={icon} style={styles.menuIcon} tintColor={iconTintColor ?? Colors.textPrimary} />}
      <Text style={[styles.navLabel, labelColor && { color: labelColor }]} numberOfLines={1} ellipsizeMode="tail">{label}</Text>
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
  navLabel: {
    flex: 1,
    fontSize: FontSizes.body,
    fontFamily: Fonts.mono,
    color: Colors.textPrimary,
  },
});
