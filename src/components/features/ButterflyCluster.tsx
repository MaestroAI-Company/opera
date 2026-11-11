import { memo, useEffect, useMemo, useRef } from "react";
import {
  Animated,
  AppState,
  AppStateStatus,
  DeviceEventEmitter,
  Easing,
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { Gyroscope } from "expo-sensors";
import { Colors } from "../../../constants/theme";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { AppEvents } from "../../services/events";
import { OverlayPresence } from "../../services/overlay/overlayPresence";
import { MAESTRO_BUTTERFLIES, useMaestroButterfly, useVoiceColor } from "./maestroButterfly";

const MAX_SHIFT = 16;
const DECAY = 0.92;
const GYRO_SPEED = 3.2;
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export type ButterflyClusterProps = {
  style?: StyleProp<ViewStyle>;
  incognito?: boolean;
  delay?: number;
  parallax?: boolean;
  intro?: boolean;
  //accent takes the voice color
  voiceColor?: boolean;
};

//maestro butterfly with gyro parallax
function ButterflyCluster({
  style,
  incognito,
  delay = 250,
  parallax = true,
  intro = true,
  voiceColor = false,
}: ButterflyClusterProps) {
  const butterfly = MAESTRO_BUTTERFLIES[useMaestroButterfly()];
  const color = useVoiceColor();
  //no intro starts fully shown
  const introAnim = useAnimatedValue(intro ? 0 : 1);
  const gyro = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  //reveal butterfly on screen load
  useEffect(() => {
    if (!intro) return;
    const timer = setTimeout(() => {
      Animated.timing(introAnim, {
        toValue: 1,
        duration: 1100,
        easing: Easing.bezier(...EASE_OUT),
        useNativeDriver: true,
      }).start();
    }, delay);

    return () => clearTimeout(timer);
  }, [introAnim, delay, intro]);

  useEffect(() => {
    if (Platform.OS === "web" || !parallax) {
      gyro.setValue({ x: 0, y: 0 });
      return;
    }

    let isMounted = true;
    let sub: { remove: () => void } | null = null;
    const current = { x: 0, y: 0 };
    let wasAtRest = false;

    const subscribe = () => {
      if (sub) return;
      Gyroscope.isAvailableAsync().then((available) => {
        if (!available || !isMounted) return;

        Gyroscope.setUpdateInterval(50);
        sub = Gyroscope.addListener(({ x, y }) => {
          //skip updates when resting immobile
          const isInputZero = Math.abs(x) < 0.02 && Math.abs(y) < 0.02;
          const isMotionZero = Math.abs(current.x) < 0.08 && Math.abs(current.y) < 0.08;

          if (isInputZero && isMotionZero) {
            if (wasAtRest) return;
            wasAtRest = true;
            current.x = 0;
            current.y = 0;
            Animated.spring(gyro, {
              toValue: { x: 0, y: 0 },
              tension: 26,
              friction: 9,
              useNativeDriver: true,
            }).start();
            return;
          }

          wasAtRest = false;

          //accumulate angular motion with gentle decay
          current.x = current.x * DECAY + y * GYRO_SPEED;
          current.y = current.y * DECAY + x * GYRO_SPEED;

          //clamp bounds to prevent detachment
          const tx = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, current.x));
          const ty = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, current.y));

          Animated.spring(gyro, {
            toValue: { x: tx, y: ty },
            tension: 26,
            friction: 9,
            useNativeDriver: true,
          }).start();
        });
      });
    };

    const unsubscribe = () => {
      sub?.remove();
      sub = null;
    };

    //overlay resume keeps app backgrounded
    const shouldListen = () => AppState.currentState === "active" && !OverlayPresence.isShown();

    if (shouldListen()) {
      subscribe();
    }

    //pause sensor when app backgrounded
    const appStateSub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active" && shouldListen()) {
        subscribe();
      } else {
        unsubscribe();
      }
    });
    //each spring rerenders the hidden butterfly
    const overlaySub = DeviceEventEmitter.addListener(AppEvents.overlayVisibility, () => {
      if (shouldListen()) {
        subscribe();
      } else {
        unsubscribe();
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
      appStateSub.remove();
      overlaySub.remove();
    };
  }, [gyro, parallax]);

  const gyroTransform = useMemo(
    () => [
      { translateX: gyro.x },
      { translateY: gyro.y },
      {
        rotate: gyro.x.interpolate({
          inputRange: [-16, 16],
          outputRange: ["-4deg", "4deg"],
          extrapolate: "clamp",
        }),
      },
    ],
    [gyro],
  );

  //fade in early during ascent
  const introOpacity = useMemo(
    () =>
      introAnim.interpolate({
        inputRange: [0, 0.35, 1],
        outputRange: [0, 1, 1],
        extrapolate: "clamp",
      }),
    [introAnim],
  );

  const introTransform = useMemo(
    () => [
      {
        translateY: introAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [60, 0],
        }),
      },
      {
        scale: introAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.35, 1],
        }),
      },
    ],
    [introAnim],
  );

  return (
    <View pointerEvents="none" style={style}>
      <Animated.View
        style={[styles.imageFill, { opacity: introOpacity, transform: introTransform }]}
      >
        <Animated.Image
          source={butterfly.base}
          style={[styles.imageFill, { transform: gyroTransform }]}
          resizeMode="contain"
          resizeMethod="resize"
        />
        <Animated.Image
          source={butterfly.accent}
          tintColor={incognito ? Colors.incognito : voiceColor ? color : undefined}
          style={[styles.imageFill, styles.imageOverlay, { transform: gyroTransform }]}
          resizeMode="contain"
          resizeMethod="resize"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  imageFill: {
    width: "100%",
    height: "100%",
  },
  //stacks the accent layer exactly over the base layer
  imageOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
  },
});

export default memo(ButterflyCluster);
