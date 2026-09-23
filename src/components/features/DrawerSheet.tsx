import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  Animated,
  BackHandler,
  Keyboard,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { useThemedStyles } from "../../hooks/useTheme";
import { dragDrawer, gestureVelocity, releaseOpens, settleDrawer } from "./drawerAnimation";

//slide fallback before real measure
const CLOSED_SLIDE = 420;

//lets an outside gesture drag a sheet one to one
const sheetTravels = new WeakMap<Animated.Value, number>();
export function sheetTravel(progress: Animated.Value): number {
  return sheetTravels.get(progress) ?? CLOSED_SLIDE;
}

export type DrawerSheetProps = {
  visible: boolean;
  onClose: () => void;
  mode: "overlay" | "lift";
  progress?: Animated.Value;
  isLargeScreen?: boolean;
  isDesktop?: boolean;
  liftOffset?: number;
  //extra native-driven translateY (eg. keyboard follow), composed with the drawer's own slide
  //keyboard hook hands out an AnimatedMultiplication
  keyboardTranslateY?: Animated.AnimatedNode;
  children: ReactNode;
  sheetStyle?: StyleProp<ViewStyle>;
  desktopStyle?: StyleProp<ViewStyle>;
  handleContainerStyle?: StyleProp<ViewStyle>;
  handleStyle?: StyleProp<ViewStyle>;
};

export default function DrawerSheet({
  visible,
  onClose,
  mode,
  progress: externalProgress,
  isLargeScreen = false,
  isDesktop = false,
  liftOffset = 0,
  keyboardTranslateY,
  children,
  sheetStyle,
  desktopStyle,
  handleContainerStyle,
  handleStyle,
}: DrawerSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const isLift = mode === "lift";
  const ownedProgress = useAnimatedValue(0);
  const progress = isLift ? ownedProgress : externalProgress ?? ownedProgress;
  const nativeDriver = !isLift;
  //outside gesture needs it mounted to show
  const keepMounted = !isLift && externalProgress !== undefined;
  const [rendered, setRendered] = useState(visible);
  const [contentHeight, setContentHeight] = useState(0);
  //sheet slides exactly its own height
  const travel = contentHeight || CLOSED_SLIDE;

  useEffect(() => {
    sheetTravels.set(progress, travel);
  }, [progress, travel]);

  const settle = useCallback(
    (open: boolean, velocity = 0) => {
      settleDrawer(progress, open, velocity, nativeDriver, () => {
        if (!open) setRendered(false);
      });
    },
    [progress, nativeDriver]
  );

  useEffect(() => {
    if (visible) setRendered(true);
    settle(visible);
  }, [visible, settle]);

  const dismiss = useCallback((velocity = 0) => {
    //keyboard lift would hold it on screen
    Keyboard.dismiss();
    settle(false, velocity);
    onClose();
  }, [settle, onClose]);

  //pull down moves the sheet with the finger
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          gestureState.dy > 8 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderMove: (_, gestureState) => {
          dragDrawer(progress, 1 - gestureState.dy / travel);
        },
        onPanResponderRelease: (_, gestureState) => {
          const velocity = -gestureVelocity(gestureState.vy, travel);
          if (releaseOpens(1 - gestureState.dy / travel, -gestureState.vy)) {
            settle(true, velocity);
          } else {
            dismiss(velocity);
          }
        },
        onPanResponderTerminate: () => settle(true),
      }),
    [dismiss, settle, progress, travel]
  );

  //overlay only: hardware back and desktop escape dismiss it, lift sits inside a screen
  //that already arbitrates its own back-press priority (eg. recording > sheet)
  useEffect(() => {
    if (isLift || !visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      dismiss();
      return true;
    });
    return () => sub.remove();
  }, [isLift, visible, dismiss]);

  useEffect(() => {
    if (isLift || !visible || Platform.OS !== "web") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isLift, visible, dismiss]);

  const handle = (
    <View style={[styles.handleContainer, handleContainerStyle]}>
      <View style={[styles.handle, handleStyle]} />
    </View>
  );

  if (isLift) {
    if (!rendered) return null;
    const measuring = contentHeight === 0;
    return (
      <Animated.View
        onLayout={(e: LayoutChangeEvent) => setContentHeight(e.nativeEvent.layout.height)}
        pointerEvents={visible ? "auto" : "none"}
        style={
          measuring
            ? styles.measuring
            : {
              //open state eats the safe area below so the sheet reaches the screen edge
              marginBottom: progress.interpolate({ inputRange: [0, 1], outputRange: [-contentHeight, -liftOffset] }),
              transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [liftOffset, 0] }) }],
            }
        }
      >
        <View style={sheetStyle} {...panResponder.panHandlers}>
          {handle}
          {children}
        </View>
      </Animated.View>
    );
  }

  if (!rendered && !keepMounted) return null;

  const translateYMobile = progress.interpolate({ inputRange: [0, 1], outputRange: [travel, 0] });
  const translateYDesktop = progress.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] });
  const translateYMobileWithKeyboard = keyboardTranslateY ? Animated.add(translateYMobile, keyboardTranslateY) : translateYMobile;

  return (
    <View style={styles.root} pointerEvents={visible ? "auto" : "none"}>
      <Animated.View style={[styles.overlay, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => dismiss()} />
      </Animated.View>

      {isLargeScreen || isDesktop ? (
        <View style={styles.desktopRootWrapper} pointerEvents="box-none">
          {/* box-none re-enables hit testing on the web, so the closed card has to opt out itself */}
          <Animated.View
            pointerEvents={visible ? "auto" : "none"}
            style={[desktopStyle, { opacity: progress, transform: [{ translateY: translateYDesktop }] }]}
          >
            {children}
          </Animated.View>
        </View>
      ) : (
        <Animated.View
          pointerEvents={visible ? "auto" : "none"}
          onLayout={(e: LayoutChangeEvent) => setContentHeight(e.nativeEvent.layout.height)}
          style={[sheetStyle, { transform: [{ translateY: translateYMobileWithKeyboard }] }]}
          {...panResponder.panHandlers}
        >
          {handle}
          {children}
        </Animated.View>
      )}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    elevation: 1000,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: Colors.scrimDrawer,
  },
  desktopRootWrapper: {
    ...StyleSheet.absoluteFill,
    alignItems: "flex-end",
    paddingRight: Spacing.xl2,
    paddingBottom: Spacing.xl2,
    justifyContent: "flex-end",
  },
  measuring: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },
  handleContainer: {
    alignItems: "center",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: Radius.pill,
    backgroundColor: Colors.textMuted,
  },
});
