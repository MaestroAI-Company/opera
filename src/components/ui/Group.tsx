import { ReactNode } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { Radius, ThemeColors } from "../../../constants/theme";
import { useThemedStyles } from "../../hooks/useTheme";

type GroupProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

//shared bordered frame: place multiple borderless elements (inputs, selectors, sliders, action buttons) inside to get one outline instead of each managing its own
export default function Group({ children, style }: GroupProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.layer}>
      <View style={[styles.box, style]}>{children}</View>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    layer: {
      position: "relative",
    },
    box: {
      position: "relative",
      borderWidth: 2,
      borderColor: Colors.border,
      borderRadius: Radius.xxl,
      backgroundColor: Colors.surface,
      zIndex: 1,
      overflow: "hidden",
    },
  });
