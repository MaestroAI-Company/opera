import { ReactNode } from "react";
import { Image, ImageSourcePropType, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { FontSizes, Fonts, Radius, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";

export type ActionButtonProps = {
  icon?: ImageSourcePropType;
  label: string;
  rightElement?: ReactNode;
  onPress?: () => void;
  standalone?: boolean;
  isLast?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

//action button for settings actions and lists
export default function ActionButton({
  icon,
  label,
  rightElement,
  onPress,
  standalone = false,
  isLast = false,
  disabled = false,
  style,
}: ActionButtonProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);

  const content = (
    <Pressable
      style={({ pressed, hovered }) => [
        styles.navItem,
        isLast && styles.navItemLast,
        (pressed || hovered) && !disabled && styles.navItemPressed,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || !onPress}
    >
      {icon && <Image source={icon} style={styles.menuIcon} tintColor={Colors.textPrimary} />}
      <Text style={styles.navLabel}>{label}</Text>
      {rightElement}
    </Pressable>
  );

  if (standalone) {
    return (
      <View style={styles.groupShadowLayer}>
        <View style={styles.groupBox}>
          {content}
        </View>
      </View>
    );
  }

  return content;
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  groupShadowLayer: {
    position: "relative",
    marginBottom: 0,
  },
  groupBox: {
    position: "relative",
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: Radius.xxl,
    backgroundColor: Colors.surface,
    zIndex: 1,
    overflow: "hidden",
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
  },
  navItemLast: {
    marginBottom: 0,
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
