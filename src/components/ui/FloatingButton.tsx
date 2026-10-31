import { Image, ImageSourcePropType, Pressable, StyleSheet, View } from "react-native";
import { Radius, ThemeColors } from "../../../constants/theme";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { pressStyle } from "./pressStyle";

type FloatingButtonProps = {
  icon: ImageSourcePropType;
  onPress: () => void;
};

//red square with an ink shadow, placed by its parent
export default function FloatingButton({ icon, onPress }: FloatingButtonProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.container}>
      <View style={styles.shadow} pointerEvents="none" />
      <Pressable onPress={onPress} style={pressStyle(styles.button, "primary")}>
        <Image source={icon} style={styles.icon} tintColor={Colors.textOnPrimary} />
      </Pressable>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      width: 56,
      height: 56,
    },
    shadow: {
      position: "absolute",
      top: 4,
      left: -4,
      width: 56,
      height: 56,
      backgroundColor: Colors.shadowInk,
      borderRadius: Radius.huge,
    },
    button: {
      width: 56,
      height: 56,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: Colors.primary,
      borderWidth: 2,
      borderColor: Colors.borderOnPrimary,
      borderRadius: Radius.huge,
    },
    icon: {
      width: 24,
      height: 24,
    },
  });
