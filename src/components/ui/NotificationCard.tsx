import { Image, ImageSourcePropType, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { FontSizes, Fonts, Spacing, ThemeColors } from "../../../constants/theme";
import { useThemedStyles } from "../../hooks/useTheme";
import Group from "./Group";

export type NotificationCardProps = {
  image: ImageSourcePropType;
  title: string;
  description?: string;
  onPress?: () => void;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
};

//image left, text right, closable
export default function NotificationCard({
  image,
  title,
  description,
  onPress,
  onDismiss,
  style,
}: NotificationCardProps) {
  const styles = useThemedStyles(makeStyles);

  return (
    <Group style={style}>
      <Pressable
        style={({ pressed, hovered }) => [styles.row, (pressed || hovered) && !!onPress && styles.rowPressed]}
        onPress={onPress}
        disabled={!onPress}
      >
        <Image source={image} style={styles.image} resizeMode="contain" />
        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          {!!description && <Text style={styles.description} numberOfLines={3}>{description}</Text>}
        </View>
      </Pressable>

      {!!onDismiss && (
        <Pressable
          onPress={onDismiss}
          hitSlop={12}
          style={({ pressed, hovered }) => [styles.close, (pressed || hovered) && styles.closePressed]}
        >
          <Text style={styles.closeLabel}>✕</Text>
        </Pressable>
      )}
    </Group>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg2,
    //room for the close button
    paddingRight: Spacing.xxl2,
    gap: Spacing.lg2,
  },
  rowPressed: {
    backgroundColor: Colors.surfacePressed,
  },
  image: {
    width: 64,
    height: 64,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: FontSizes.lg,
    fontFamily: Fonts.mono,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  description: {
    fontSize: FontSizes.bodyMd,
    fontFamily: Fonts.body,
    color: Colors.textMuted,
  },
  close: {
    position: "absolute",
    top: Spacing.md,
    right: Spacing.md,
    padding: Spacing.xs,
  },
  closePressed: {
    opacity: 0.6,
  },
  closeLabel: {
    fontSize: FontSizes.label,
    fontFamily: Fonts.mono,
    color: Colors.textMuted,
  },
});
