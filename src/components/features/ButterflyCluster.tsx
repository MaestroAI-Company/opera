import { memo, useEffect, useMemo, useRef } from "react";
import {
  Animated,
  AppState,
  AppStateStatus,
  Easing,
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { Gyroscope } from "expo-sensors";
import { MAESTRO_BUTTERFLIES, useMaestroButterfly } from "./maestroButterfly";

const MAX_SHIFT = 16;
const DECAY = 0.92;
const GYRO_SPEED = 3.2;

export type ButterflyClusterProps = {
  style?: StyleProp<ViewStyle>;
  incognito?: boolean;
  delay?: number;
};

//maestro butterfly with gyro parallax
function ButterflyCluster({ style, incognito, delay = 250 }: ButterflyClusterProps) {
  const butterfly = MAESTRO_BUTTERFLIES[useMaestroButterfly()];
  const introAnim = useRef(new Animated.Value(0)).current;
  const gyro = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  //reveal butterfly on screen load
  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(introAnim, {
        toValue: 1,
        duration: 1100,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
        useNativeDriver: true,
      }).start();
    }, delay);

    return () => clearTimeout(timer);
  }, [introAnim, delay]);

  useEffect(() => {
    if (Platform.OS === "web") {
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

    if (AppState.currentState === "active") {
      subscribe();
    }

    //pause sensor when app backgrounded
    const appStateSub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") {
        subscribe();
      } else {
        unsubscribe();
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
      appStateSub.remove();
    };
  }, [gyro]);

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
          source={incognito ? butterfly.grey : butterfly.color}
          style={[styles.imageFill, { transform: gyroTransform }]}
          resizeMode="contain"
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
});

export default memo(ButterflyCluster);
