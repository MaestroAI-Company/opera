import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  AppState,
  AppStateStatus,
  DeviceEventEmitter,
  Easing,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { Gyroscope } from "expo-sensors";
import { Colors } from "../../../constants/theme";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { useAccent } from "../../hooks/useTheme";
import { AppEvents } from "../../services/events";
import { OverlayPresence } from "../../services/overlay/overlayPresence";
import AsciiButterfly from "./AsciiButterfly";
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
  //flaps on load and on tap
  flap?: boolean;
};

//maestro butterfly with gyro parallax
function ButterflyCluster({
  style,
  incognito,
  delay = 250,
  parallax = true,
  intro = true,
  voiceColor = false,
  flap = false,
}: ButterflyClusterProps) {
  const butterflyId = useMaestroButterfly();
  const color = useVoiceColor();
  //every butterfly follows the app accent when it is applied
  const accent = useAccent();
  const [flapKey, setFlapKey] = useState(0);
  const accentColor = incognito ? Colors.incognito : voiceColor ? color : accent;
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

  //flap while the butterfly rises
  useEffect(() => {
    if (!flap) return;
    //start with the intro scaling
    const timer = setTimeout(() => setFlapKey((key) => key + 1), delay);
    return () => clearTimeout(timer);
  }, [delay, flap]);

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
    <View pointerEvents="box-none" style={style}>
      <Animated.View
        style={[styles.imageFill, { opacity: introOpacity, transform: introTransform }]}
      >
        <Animated.View style={[styles.imageFill, { transform: gyroTransform }]}>
          <Pressable
            style={styles.imageFill}
            disabled={!flap}
            onPress={() => setFlapKey((key) => key + 1)}
          >
            <AsciiButterfly
              key={butterflyId}
              frames={MAESTRO_BUTTERFLIES[butterflyId].frames}
              accentColor={accentColor ?? Colors.primary}
              playKey={flapKey}
            />
          </Pressable>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  imageFill: {
    width: "100%",
    height: "100%",
  },
});

export default memo(ButterflyCluster);
