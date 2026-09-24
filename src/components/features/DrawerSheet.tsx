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
import Reanimated, { useAnimatedStyle } from "react-native-reanimated";
import { Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { useKeyboardLift } from "../../hooks/useKeyboardLift";
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
  //sheet sits on the keyboard, needs a maxHeight in sheetStyle
  avoidKeyboard?: boolean;
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
  avoidKeyboard = false,
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
  const measured = contentHeight > 0;
  //sheet slides exactly its own height
  const travel = contentHeight || CLOSED_SLIDE;
  //desktop card only fades, no height needed
  const slides = isLift || !(isLargeScreen || isDesktop);

  useEffect(() => {
    sheetTravels.set(progress, travel);
  }, [progress, travel]);

  const settle = useCallback(
    (open: boolean, velocity = 0) => {
      settleDrawer(progress, open, velocity, nativeDriver, () => {
        if (open) return;
        setRendered(false);
        //content may differ next time
        if (!keepMounted) setContentHeight(0);
      });
    },
    [progress, nativeDriver, keepMounted]
  );

  useEffect(() => {
    if (visible) {
      setRendered(true);
      //sliding a guessed height pops tall sheets in
      if (slides && !measured) return;
    } else if (slides && !measured) {
      //never shown, nothing to animate out
      setRendered(false);
      return;
    }
    settle(visible);
  }, [visible, slides, measured, settle]);

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
    return (
      <Animated.View
        onLayout={(e: LayoutChangeEvent) => setContentHeight(e.nativeEvent.layout.height)}
        pointerEvents={visible ? "auto" : "none"}
        style={
          !measured
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
          style={[sheetStyle, { transform: [{ translateY: translateYMobile }] }, !measured && styles.hidden]}
          {...panResponder.panHandlers}
        >
          {handle}
          {children}
          {avoidKeyboard && <KeyboardSpacer />}
        </Animated.View>
      )}
    </View>
  );
}

//grows with the keyboard, maxHeight shrinks the content instead
function KeyboardSpacer() {
  const keyboardHeight = useKeyboardLift();
  const style = useAnimatedStyle(() => ({ height: keyboardHeight.value }));
  return <Reanimated.View style={style} />;
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
  hidden: {
    opacity: 0,
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
