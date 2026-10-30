import { LinearGradient } from "expo-linear-gradient";
import { createContext, forwardRef, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  Animated,
  BackHandler,
  Keyboard,
  LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  StyleSheet,
  View,
  ViewProps,
  ViewStyle,
} from "react-native";
import {
  KeyboardAwareScrollView,
  KeyboardAwareScrollViewProps,
  KeyboardAwareScrollViewRef,
} from "react-native-keyboard-controller";
import Reanimated, { useAnimatedStyle } from "react-native-reanimated";
import { Radius, Spacing, ThemeColors } from "../../../constants/theme";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { useKeyboardLift } from "../../hooks/useKeyboardLift";
import { usePredictiveBack } from "../../hooks/usePredictiveBack";
import { useColors, useThemedStyles } from "../../hooks/useTheme";
import DrawerBackButton from "./DrawerBackButton";
import { dragDrawer, gestureVelocity, releaseOpens, settleDrawer } from "./drawerAnimation";

//slide fallback before real measure
const CLOSED_SLIDE = 420;
//closed sheet parks below so no edge peeks
const CLOSED_MARGIN = 80;
const FADE_STEPS = 8;
//content pads by the same amount
const FADE_EXTRA = Spacing.xxl;

//smoothstep avoids a kink on short fades
function fadeStops(clear: string): [string, string, ...string[]] {
  const rgb = clear.match(/\d+/g)?.slice(0, 3).join(",") ?? "0,0,0";
  const stops = Array.from({ length: FADE_STEPS }, (_, i) => {
    const t = i / (FADE_STEPS - 1);
    const alpha = 1 - t * t * (3 - 2 * t);
    return `rgba(${rgb},${alpha.toFixed(3)})`;
  });
  return stops as [string, string, ...string[]];
}

//bled once a SheetBody covers the band
type SheetInsets = { bottom: number; fade: number; bled: boolean };
const SheetInsetsContext = createContext<SheetInsets>({ bottom: 0, fade: 0, bled: false });

const fadeBottomStyle = StyleSheet.create({
  fade: { position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 1 },
});
//basis auto keeps auto height sheets sized
const scrollFill = { flexGrow: 1, flexShrink: 1 } as const;

//sits beside the scroll, none for static sheets
function SheetFade() {
  const Colors = useColors();
  const { bottom, fade } = useContext(SheetInsetsContext);
  const colors = useMemo(
    () => [...fadeStops(Colors.groupedBackgroundClear)].reverse() as [string, string, ...string[]],
    [Colors.groupedBackgroundClear]
  );
  return <LinearGradient colors={colors} style={[fadeBottomStyle.fade, { height: bottom + fade }]} pointerEvents="none" />;
}

//wrapper clips top, android ignores radius
function useSheetScroll(style: StyleProp<ViewStyle>, contentContainerStyle: StyleProp<ViewStyle>) {
  const { bottom, fade, bled } = useContext(SheetInsetsContext);
  const content = StyleSheet.flatten(contentContainerStyle) ?? {};
  //margin so the clip matches the cards
  const side = Number(content.paddingHorizontal ?? 0);
  return {
    wrapStyle: [style, scrollWrap, { marginHorizontal: side }, !bled && { marginBottom: -bottom }],
    contentContainerStyle: [content, { paddingHorizontal: 0, paddingBottom: Number(content.paddingBottom ?? 0) + bottom + fade }],
  };
}

//matches the cards inside a sheet
const scrollWrap = {
  flexGrow: 1,
  flexShrink: 1,
  borderTopLeftRadius: Radius.xxl + Spacing.md,
  borderTopRightRadius: Radius.xxl + Spacing.md,
  overflow: "hidden",
} as const;

//pages bleed into the band as one block
export function SheetBody({ style, ...props }: ViewProps) {
  const { bottom, fade } = useContext(SheetInsetsContext);
  const inner = useMemo(() => ({ bottom, fade, bled: true }), [bottom, fade]);
  return (
    <>
      <SheetInsetsContext.Provider value={inner}>
        <View {...props} style={[style, { marginBottom: -bottom }]} />
      </SheetInsetsContext.Provider>
      <SheetFade />
    </>
  );
}

//drop-in ScrollView for a sheet body
export const SheetScrollView = forwardRef<ScrollView, ScrollViewProps>(function SheetScrollView(props, ref) {
  const { wrapStyle, contentContainerStyle } = useSheetScroll(props.style, props.contentContainerStyle);
  const { bled } = useContext(SheetInsetsContext);
  return (
    <>
      <View style={wrapStyle}>
        <ScrollView {...props} ref={ref} style={scrollFill} contentContainerStyle={contentContainerStyle} />
      </View>
      {!bled && <SheetFade />}
    </>
  );
});

export const SheetKeyboardAwareScrollView = forwardRef<KeyboardAwareScrollViewRef, KeyboardAwareScrollViewProps>(
  function SheetKeyboardAwareScrollView(props, ref) {
    const { wrapStyle, contentContainerStyle } = useSheetScroll(props.style, props.contentContainerStyle);
    const { bled } = useContext(SheetInsetsContext);
    return (
      <>
        <View style={wrapStyle}>
          <KeyboardAwareScrollView {...props} ref={ref} style={scrollFill} contentContainerStyle={contentContainerStyle} />
        </View>
        {!bled && <SheetFade />}
      </>
    );
  }
);

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
  //desktop card hangs off its trigger instead of centering, no close button
  anchored?: boolean;
  liftOffset?: number;
  //sheet sits on the keyboard, needs a maxHeight in sheetStyle
  avoidKeyboard?: boolean;
  //android back/gesture checks this first; true means it navigated inside the
  //sheet itself, so the sheet stays open instead of dismissing
  onBackPress?: () => boolean;
  children: ReactNode;
  sheetStyle?: StyleProp<ViewStyle>;
  //size and placement only, the card look is shared
  desktopStyle?: StyleProp<ViewStyle>;
  handleContainerStyle?: StyleProp<ViewStyle>;
  handleStyle?: StyleProp<ViewStyle>;
  //transparent windows show it as grey
  hideScrim?: boolean;
};

export default function DrawerSheet({
  visible,
  onClose,
  mode,
  progress: externalProgress,
  isLargeScreen = false,
  isDesktop = false,
  anchored = false,
  liftOffset = 0,
  avoidKeyboard = false,
  onBackPress,
  children,
  sheetStyle,
  desktopStyle,
  handleContainerStyle,
  handleStyle,
  hideScrim = false,
}: DrawerSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const isLift = mode === "lift";
  const insetBottom = Number(StyleSheet.flatten(sheetStyle)?.paddingBottom ?? 0);
  const insets = useMemo(() => ({ bottom: insetBottom, fade: FADE_EXTRA, bled: false }), [insetBottom]);
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

  //android back gesture pulls the sheet down, release closes it
  //unless onBackPress claims it to navigate inside the sheet instead
  usePredictiveBack(visible, {
    onProgress: (p) => dragDrawer(progress, 1 - p),
    onCancel: () => settle(true),
    onBack: () => (onBackPress?.() ? settle(true) : dismiss()),
  });

  //overlay only: hardware back and desktop escape dismiss it, lift sits inside a screen
  //that already arbitrates its own back-press priority (eg. recording > sheet)
  useEffect(() => {
    if (isLift || !visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (onBackPress?.()) return true;
      dismiss();
      return true;
    });
    return () => sub.remove();
  }, [isLift, visible, dismiss, onBackPress]);

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

  const translateYMobile = progress.interpolate({ inputRange: [0, 1], outputRange: [travel + CLOSED_MARGIN, 0] });
  const translateYDesktop = progress.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] });

  return (
    <View style={styles.root} pointerEvents={visible ? "auto" : "none"}>
      <Animated.View style={[styles.overlay, hideScrim && styles.overlayHidden, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => dismiss()} />
      </Animated.View>

      {isLargeScreen || isDesktop ? (
        <View style={styles.desktopRootWrapper} pointerEvents="box-none">
          {/* box-none re-enables hit testing on the web, so the closed card has to opt out itself */}
          <Animated.View
            pointerEvents={visible ? "auto" : "none"}
            style={[styles.desktopCard, desktopStyle, { opacity: progress, transform: [{ translateY: translateYDesktop }] }]}
          >
            {!anchored && (
              <View style={styles.desktopHeader}>
                <DrawerBackButton kind="close" onPress={() => dismiss()} />
              </View>
            )}
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
          <SheetInsetsContext.Provider value={insets}>{children}</SheetInsetsContext.Provider>
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
  overlayHidden: {
    backgroundColor: "transparent",
  },
  desktopRootWrapper: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xxl2,
  },
  desktopCard: {
    backgroundColor: Colors.groupedBackground,
    //same as the settings window
    borderRadius: Radius.window,
    borderWidth: 2,
    borderColor: Colors.border,
    boxShadow: `-6px 6px 0px ${Colors.shadowInk}`,
    elevation: 5,
    overflow: "hidden",
    //content scrolls instead of leaving the screen
    maxWidth: "100%",
    maxHeight: "100%",
    paddingBottom: Spacing.lg,
  },
  desktopHeader: {
    paddingTop: Spacing.lg2,
    paddingHorizontal: Spacing.lg2,
    paddingBottom: Spacing.md,
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
    width: 48,
    height: 4,
    borderRadius: Radius.pill,
    backgroundColor: Colors.textMuted,
  },
});
