import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, View } from "react-native";
import { Colors, Fonts, FontSizes, Radius } from "../../../constants/theme";

export type ActionButtonProps = {
  icon: ImageSourcePropType;
  title: string;
  description: string;
  onPress?: () => void;
};

export default function ActionButton({
  icon,
  title,
  description,
  onPress,
}: ActionButtonProps) {
  return (
    <Pressable
      style={({ pressed, hovered }) => [
        styles.container,
        (pressed || hovered) && styles.containerPressed,
      ]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.iconContainer}>
        <Image
          source={icon}
          style={styles.icon}
          tintColor={Colors.textSecondary}
        />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    borderWidth: 2,
    borderColor: Colors.border,
    padding: 8,
    gap: 12,
  },
  containerPressed: {
    backgroundColor: Colors.surfacePressed,
  },
  iconContainer: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  icon: {
    width: 20,
    height: 20,
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.bodyMd,
    color: Colors.textSecondary,
  },
  description: {
    fontFamily: Fonts.body,
    fontSize: FontSizes.label,
    color: Colors.textMuted,
    lineHeight: 16,
  },
});
