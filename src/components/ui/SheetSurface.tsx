import { ReactNode, useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
} from "react-native";
import { Radius, ThemeColors } from "../../../constants/theme";
import { useThemedStyles } from "../../hooks/useTheme";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";

//clears the tallest sheet content so it starts fully off-screen
const SHEET_OFFSET = 500;

//a sheet floating over the ui owns every gesture, the screen behind must stay inert
let openOverlaySheets = 0;
export function hasOpenOverlaySheet(): boolean {
  return openOverlaySheets > 0;
}

//trigger position in window coordinates, from measureInWindow
export type AnchorRect = { x: number; y: number; width: number; height: number };

const ANCHOR_GAP = 8;
const ANCHOR_MARGIN = 8;

type SheetSurfaceProps = {
  visible: boolean;
  //true: the sheet sits under the ui and lifts it, false: it floats over it
  lift: boolean;
  //space kept below a lifting sheet, it has to clear it to sit off-screen
  liftOffset?: number;
  //set to drop the panel under its trigger instead of docking it as a sheet
  anchor?: AnchorRect | null;
  anchorWidth?: number;
  onClose: () => void;
  onClosed?: () => void;
  children: ReactNode;
  rootStyle?: StyleProp<ViewStyle>;
  touchAreaStyle?: StyleProp<ViewStyle>;
  sheetStyle?: StyleProp<ViewStyle>;
  handleStyle?: StyleProp<ViewStyle>;
};

export default function SheetSurface({
  visible,
  lift,
  liftOffset = 0,
  anchor = null,
  anchorWidth = 320,
  onClose,
  onClosed,
  children,
  rootStyle,
  touchAreaStyle,
  sheetStyle,
  handleStyle,
}: SheetSurfaceProps) {
  const styles = useThemedStyles(makeStyles);
  const { width: windowWidth } = useWindowDimensions();
  //kept mounted until the close animation finishes
  const [rendered, setRendered] = useState(visible);
  const [contentHeight, setContentHeight] = useState(0);

  const backdropOpacity = useAnimatedValue(0);
  const sheetY = useAnimatedValue(SHEET_OFFSET);
  const liftProgress = useAnimatedValue(0);

  //handlers and measurements the gesture reads, kept out of render
  const onClosedRef = useRef(onClosed);
  const onCloseRef = useRef(onClose);
  const heightRef = useRef(0);
  const liftRef = useRef(lift);
  useEffect(() => {
    onClosedRef.current = onClosed;
    onCloseRef.current = onClose;
    heightRef.current = contentHeight;
    liftRef.current = lift;
  });

  //scrim fades in place, sheet slides, driven separately so the modal itself does no transform
  useEffect(() => {
    if (visible) {
      setRendered(true);
      if (lift) return;
      backdropOpacity.setValue(0);
      sheetY.setValue(SHEET_OFFSET);
      //let the sheet actually mount before animating, avoids a stutter on open
      const raf = requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(backdropOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
          Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, overshootClamping: true, bounciness: 0, speed: 14 }),
        ]).start();
      });
      return () => cancelAnimationFrame(raf);
    }

    const finish = () => {
      setRendered(false);
      onClosedRef.current?.();
    };
    if (lift) {
      //same spring as the opening, so the ui riding on top stays glued to the sheet
      Animated.spring(liftProgress, { toValue: 0, useNativeDriver: false, overshootClamping: true, bounciness: 0, speed: 14 }).start(finish);
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.timing(sheetY, { toValue: SHEET_OFFSET, duration: 180, useNativeDriver: true }),
      ]).start(finish);
    }
  }, [visible, lift, backdropOpacity, sheetY, liftProgress]);

  //escape closes a floating panel, expected on desktop
  useEffect(() => {
    if (Platform.OS !== "web" || lift || !rendered) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lift, rendered]);

  //flag the screen behind as inert while an overlaying sheet is on screen
  useEffect(() => {
    if (lift || !rendered) return;
    openOverlaySheets++;
    return () => { openOverlaySheets--; };
  }, [lift, rendered]);

  //lifting animates a height, so it can only start once the sheet is measured
  const liftOpenedRef = useRef(false);
  useEffect(() => {
    if (!lift) return;
    if (!visible) {
      liftOpenedRef.current = false;
      return;
    }
    if (liftOpenedRef.current || contentHeight === 0) return;
    liftOpenedRef.current = true;
    Animated.spring(liftProgress, { toValue: 1, useNativeDriver: false, overshootClamping: true, bounciness: 0, speed: 14 }).start();
  }, [visible, lift, contentHeight, liftProgress]);

  //drag handle mirrors a native sheet's swipe-to-dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_e, gestureState) => {
        if (gestureState.dy <= 0) return;
        if (liftRef.current) {
          const height = heightRef.current || SHEET_OFFSET;
          liftProgress.setValue(Math.max(0, 1 - gestureState.dy / height));
        } else {
          sheetY.setValue(gestureState.dy);
          backdropOpacity.setValue(Math.max(0, 1 - gestureState.dy / SHEET_OFFSET));
        }
      },
      onPanResponderRelease: (_e, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          onCloseRef.current();
        } else if (liftRef.current) {
          Animated.spring(liftProgress, { toValue: 1, useNativeDriver: false, overshootClamping: true, bounciness: 0, speed: 14 }).start();
        } else {
          Animated.parallel([
            Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, overshootClamping: true, bounciness: 0, speed: 14 }),
            Animated.timing(backdropOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
          ]).start();
        }
      },
    })
  ).current;

  if (!rendered) return null;

  //an anchored panel is dismissed by clicking outside, it needs no drag handle
  const sheet = (
    <View style={[styles.sheet, sheetStyle]}>
      {!anchor && (
        <View style={styles.handleContainer} {...panResponder.panHandlers}>
          <View style={[styles.handle, handleStyle]} />
        </View>
      )}
      {children}
    </View>
  );

  if (anchor) {
    //drops under its trigger, centered on it and kept inside the window
    const left = Math.max(
      ANCHOR_MARGIN,
      Math.min(anchor.x + anchor.width / 2 - anchorWidth / 2, windowWidth - anchorWidth - ANCHOR_MARGIN)
    );
    return (
      <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={[
            styles.anchoredPanel,
            { top: anchor.y + anchor.height + ANCHOR_GAP, left, width: anchorWidth },
            {
              opacity: backdropOpacity,
              transform: [
                { translateY: backdropOpacity.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) },
                { scale: backdropOpacity.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
              ],
            },
          ]}
        >
          {sheet}
        </Animated.View>
      </Modal>
    );
  }

  if (lift) {
    //the negative margin alone slides the sheet down and drops the ui above with it, one to one
    //the translation only covers what is kept below the sheet, so it ends up fully off-screen
    //first open measures out of flow, otherwise the sheet would flash at full height
    const measuring = contentHeight === 0;
    return (
      <Animated.View
        onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)}
        style={measuring ? styles.measuring : {
          marginBottom: liftProgress.interpolate({ inputRange: [0, 1], outputRange: [-contentHeight, 0] }),
          transform: [{ translateY: liftProgress.interpolate({ inputRange: [0, 1], outputRange: [liftOffset, 0] }) }],
        }}
      >
        {sheet}
      </Animated.View>
    );
  }

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.backdropRoot, rootStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Pressable style={[styles.touchArea, touchAreaStyle]} onPress={() => {}}>
          <Animated.View style={{ transform: [{ translateY: sheetY }] }}>{sheet}</Animated.View>
        </Pressable>
      </View>
    </Modal>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  backdropRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    backgroundColor: Colors.scrimModal,
  },
  touchArea: {
    width: "100%",
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.huge2,
    borderTopRightRadius: Radius.huge2,
    paddingTop: 12,
    width: "100%",
  },
  anchoredPanel: {
    position: "absolute",
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
    marginBottom: 12,
    paddingVertical: 10,
    marginTop: -10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: Radius.xxl,
    backgroundColor: Colors.textMuted,
  },
});
