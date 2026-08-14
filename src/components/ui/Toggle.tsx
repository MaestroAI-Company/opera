import { useEffect, useRef } from "react";
import { PanResponder, StyleSheet, Vibration } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Colors, Radius } from "../../../constants/theme";

type ToggleProps = {
  checked: boolean;
  onToggle: (value: boolean) => void;
  disabled?: boolean;
};

const TRAVEL = 16;
const TAP_TOLERANCE = 3;

//custom draggable toggle switch matching design
export default function Toggle({ checked, onToggle, disabled = false }: ToggleProps) {
  const translateX = useSharedValue(checked ? TRAVEL : 0);
  const scale = useSharedValue(1);
  const pressed = useSharedValue(0);

  const startXRef = useRef(0);
  //reads fresh props not mount-time values
  const latestRef = useRef({ checked, onToggle, disabled });
  latestRef.current = { checked, onToggle, disabled };

  //sync thumb to external state changes
  useEffect(() => {
    translateX.value = withTiming(checked ? TRAVEL : 0, { duration: 200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !latestRef.current.disabled,
      onMoveShouldSetPanResponder: () => !latestRef.current.disabled,
      //keep gesture vs drawer's swipe-to-close
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        startXRef.current = translateX.value;
        scale.value = withTiming(1.2, { duration: 120 });
        pressed.value = withTiming(1, { duration: 120 });
      },
      onPanResponderMove: (_e, g) => {
        translateX.value = Math.min(TRAVEL, Math.max(0, startXRef.current + g.dx));
      },
      onPanResponderRelease: (_e, g) => {
        const { checked: isChecked, onToggle: cb } = latestRef.current;
        const isTap = Math.abs(g.dx) < TAP_TOLERANCE;
        const next = isTap ? !isChecked : translateX.value >= TRAVEL / 2;
        translateX.value = withTiming(next ? TRAVEL : 0, { duration: 200 });
        scale.value = withTiming(1, { duration: 150 });
        pressed.value = withTiming(0, { duration: 150 });
        if (next !== isChecked) {
          Vibration.vibrate(10);
          cb(next);
        }
      },
      onPanResponderTerminate: () => {
        const { checked: isChecked } = latestRef.current;
        translateX.value = withTiming(isChecked ? TRAVEL : 0, { duration: 200 });
        scale.value = withTiming(1, { duration: 150 });
        pressed.value = withTiming(0, { duration: 150 });
      },
    })
  ).current;

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { scale: scale.value }],
    backgroundColor: checked ? Colors.surface : Colors.primary,
  }));

  const trackStyle = useAnimatedStyle(() => ({
    opacity: disabled ? 0.5 : 1 - 0.2 * pressed.value,
  }));

  return (
    <Animated.View
      style={[
        styles.track,
        checked ? styles.trackChecked : styles.trackUnchecked,
        trackStyle,
      ]}
      {...panResponder.panHandlers}
    >
      <Animated.View style={[styles.thumb, thumbStyle]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 40,
    height: 24,
    borderRadius: Radius.xl2,
    padding: 2,
    justifyContent: "center",
    borderWidth: 2,
  },
  trackChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.borderOnPrimary,
  },
  trackUnchecked: {
    backgroundColor: Colors.surface,
    borderColor: Colors.surfaceCode,
  },
  thumb: {
    width: 16,
    height: 16,
    borderRadius: Radius.xxl,
    borderWidth: 2,
    borderColor: Colors.borderOnPrimary,
  },
});