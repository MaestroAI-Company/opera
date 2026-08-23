import { Image, ImageSourcePropType, Pressable, StyleProp, StyleSheet, Text, ViewStyle } from "react-native";
import { FontSizes, Fonts, Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";

export type NotificationBannerProps = {
  icon?: ImageSourcePropType;
  label: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

//highlighted notice needing action
export default function NotificationBanner({ icon, label, onPress, style }: NotificationBannerProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      style={({ pressed, hovered }) => [styles.banner, (pressed || hovered) && !!onPress && styles.bannerPressed, style]}
      onPress={onPress}
      disabled={!onPress}
    >
      {icon && <Image source={icon} style={styles.icon} tintColor={Colors.textOnPrimary} />}
      <Text style={styles.label} numberOfLines={1} ellipsizeMode="tail">{label}</Text>
    </Pressable>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.lg2,
    paddingHorizontal: Spacing.lg2,
    gap: Spacing.lg2,
    borderWidth: 2,
    borderColor: Colors.borderOnPrimary,
    borderRadius: Radius.xxl,
    backgroundColor: Colors.primary,
  },
  bannerPressed: {
    backgroundColor: Colors.primaryPressed,
  },
  icon: {
    width: 18,
    height: 18,
  },
  label: {
    flex: 1,
    fontSize: FontSizes.body,
    fontFamily: Fonts.mono,
    color: Colors.textOnPrimary,
  },
});
