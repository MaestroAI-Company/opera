import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  Animated,
  BackHandler,
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
import { dragDrawer, gestureVelocity, settleDrawer } from "./drawerAnimation";

//distance the finger must travel to fully open/close by drag alone
const PULL_DISTANCE = 280;

//slide fallback before real measure
const CLOSED_SLIDE = 420;

export type DrawerSheetProps = {
  visible: boolean;
  onClose: () => void;
  //overlay floats above everything behind a backdrop and can be dismissed with back/escape,
  //lift grows in place and pushes whatever sits below it in the layout, like a native input accessory
  mode: "overlay" | "lift";
  //owned by the caller so an external gesture (eg. a home screen swipe-up) can drag it live, overlay only
  progress?: Animated.Value;
  //overlay only: docks a card bottom-right instead of the mobile sheet
  isLargeScreen?: boolean;
  isDesktop?: boolean;
  //lift only: space the sheet must clear to sit fully off-screen
  liftOffset?: number;
  children: ReactNode;
  sheetStyle?: StyleProp<ViewStyle>;
  desktopStyle?: StyleProp<ViewStyle>;
  handleContainerStyle?: StyleProp<ViewStyle>;
  handleStyle?: StyleProp<ViewStyle>;
};

//fluid drawer, driven by PanResponder + spring, no Modal involved. shared skeleton for every
//panel that slides in from the bottom, either lifting the ui above it or floating over it
export default function DrawerSheet({
  visible,
  onClose,
  mode,
  progress: externalProgress,
  isLargeScreen = false,
  isDesktop = false,
  liftOffset = 0,
  children,
  sheetStyle,
  desktopStyle,
  handleContainerStyle,
  handleStyle,
}: DrawerSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const isLift = mode === "lift";

  //marginBottom (lift) can't run on the native driver, so lift always owns a js-driven value
  const ownedProgress = useAnimatedValue(0);
  const progress = isLift ? ownedProgress : externalProgress ?? ownedProgress;
  const nativeDriver = !isLift;

  //fully closed content unmounts
  //frees thumbnails and stops web ghost clicks
  const [rendered, setRendered] = useState(visible);
  const [contentHeight, setContentHeight] = useState(0);

  const settle = useCallback(
    (open: boolean, velocity = 0) => {
      settleDrawer(progress, open, velocity, nativeDriver, () => {
        if (!open) setRendered(false);
      });
    },
    [progress, nativeDriver]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remount content before it animates open
    if (visible) setRendered(true);
    settle(visible);
  }, [visible, settle]);

  const dismiss = useCallback(() => {
    settle(false);
    onClose();
  }, [settle, onClose]);

  //mobile pull down gesture, dismisses past a threshold, otherwise snaps back open
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          gestureState.dy > 8 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderMove: (_, gestureState) => {
          dragDrawer(progress, Math.max(0, Math.min(1, 1 - gestureState.dy / PULL_DISTANCE)));
        },
        onPanResponderRelease: (_, gestureState) => {
          const velocity = -gestureVelocity(gestureState.vy, PULL_DISTANCE);
          if (gestureState.dy > 70 || gestureState.vy > 0.5) {
            dismiss();
          } else {
            settle(true, velocity);
          }
        },
        onPanResponderTerminate: () => settle(true),
      }),
    [dismiss, settle, progress]
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
    //first pass measures out of flow, otherwise the sheet would flash at full height
    const measuring = contentHeight === 0;
    return (
      <Animated.View
        onLayout={(e: LayoutChangeEvent) => setContentHeight(e.nativeEvent.layout.height)}
        pointerEvents={visible ? "auto" : "none"}
        style={
          measuring
            ? styles.measuring
            : {
                marginBottom: progress.interpolate({ inputRange: [0, 1], outputRange: [-contentHeight, 0] }),
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

  if (!rendered) return null;

  //tall sheets need their real height
  const closedOffset = Math.max(contentHeight, CLOSED_SLIDE);
  const translateYMobile = progress.interpolate({ inputRange: [0, 1], outputRange: [closedOffset, 0] });
  const translateYDesktop = progress.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] });

  return (
    <View style={styles.root} pointerEvents={visible ? "auto" : "none"}>
      <Animated.View style={[styles.overlay, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
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
          style={[sheetStyle, { transform: [{ translateY: translateYMobile }] }]}
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
