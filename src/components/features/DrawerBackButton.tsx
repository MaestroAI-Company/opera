import { useEffect, useMemo } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, View } from "react-native";
import { Radius, ThemeColors } from "../../../constants/theme";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import { pressStyle } from "../ui/pressStyle";
import { DRAWER_NATIVE_DRIVER } from "./drawerAnimation";

const arrowIcon = require("../../../assets/icons/arrow.png");
const cancelIcon = require("../../../assets/icons/cancel.png");

type DrawerBackButtonProps = {
  kind: "back" | "close";
  onPress: () => void;
  //surface and ink shadow once content scrolls under it
  scrolled?: boolean;
  //grows and lightens on mount and on every change
  pulseKey?: string;
};

export default function DrawerBackButton({
  kind,
  onPress,
  scrolled = false,
  pulseKey,
}: DrawerBackButtonProps) {
  const Colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const pulse = useAnimatedValue(0);

  useEffect(() => {
    if (pulseKey === undefined) return;
    pulse.setValue(0);
    Animated.sequence([
      Animated.timing(pulse, {
        toValue: 1,
        duration: 120,
        easing: Easing.out(Easing.quad),
        useNativeDriver: DRAWER_NATIVE_DRIVER,
      }),
      Animated.timing(pulse, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.quad),
        useNativeDriver: DRAWER_NATIVE_DRIVER,
      }),
    ]).start();
  }, [pulseKey, pulse]);

  //built once, the drawer re-renders often
  const pulseStyle = useMemo(
    () => ({
      opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }),
      transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) }],
    }),
    [pulse],
  );

  return (
    <View style={styles.container}>
      {scrolled && <View style={styles.shadow} pointerEvents="none" />}
      <Animated.View style={pulseStyle}>
        <Pressable
          onPress={onPress}
          hitSlop={12}
          style={pressStyle(
            [styles.button, scrolled && styles.buttonScrolled],
            scrolled ? "surface" : "fade",
          )}
        >
          <Image
            source={kind === "close" ? cancelIcon : arrowIcon}
            style={kind === "close" ? styles.closeIcon : styles.backIcon}
            tintColor={Colors.textPrimary}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      width: 40,
      height: 40,
    },
    shadow: {
      position: "absolute",
      top: 4,
      left: -4,
      width: 40,
      height: 40,
      backgroundColor: Colors.shadowInk,
      borderRadius: Radius.xxl,
    },
    button: {
      width: 40,
      height: 40,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: Radius.xxl,
    },
    buttonScrolled: {
      backgroundColor: Colors.surface,
    },
    closeIcon: {
      width: 18,
      height: 18,
    },
    backIcon: {
      width: 18,
      height: 18,
      transform: [{ rotate: "-180deg" }],
    },
  });
