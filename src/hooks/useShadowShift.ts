import { useEffect, useState } from "react";
import { Animated, AppState, Platform } from "react-native";
import { Gyroscope } from "expo-sensors";

//small shadow drift, kept subtle
const MAX_SHIFT = 1.5;
const GYRO_SPEED = 1.2;
const DECAY = 0.92;

//offset driven by the gyroscope for sticker shadows
export function useShadowShift() {
  const [shift] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));

  useEffect(() => {
    if (Platform.OS === "web") return;

    let isMounted = true;
    let sub: { remove: () => void } | null = null;
    const current = { x: 0, y: 0 };
    let wasAtRest = true;

    const subscribe = () => {
      if (sub) return;
      Gyroscope.isAvailableAsync().then((available) => {
        if (!available || !isMounted || sub) return;
        Gyroscope.setUpdateInterval(50);
        sub = Gyroscope.addListener(({ x, y }) => {
          //skip updates when resting immobile
          const isInputZero = Math.abs(x) < 0.02 && Math.abs(y) < 0.02;
          const isMotionZero = Math.abs(current.x) < 0.005 && Math.abs(current.y) < 0.005;
          if (isInputZero && isMotionZero) {
            if (wasAtRest) return;
            wasAtRest = true;
            current.x = 0;
            current.y = 0;
            Animated.spring(shift, { toValue: { x: 0, y: 0 }, tension: 26, friction: 9, useNativeDriver: true }).start();
            return;
          }
          wasAtRest = false;
          //decay settles shadow back to rest
          current.x = current.x * DECAY + y * GYRO_SPEED;
          current.y = current.y * DECAY + x * GYRO_SPEED;

          const tx = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, current.x));
          const ty = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, current.y));

          Animated.spring(shift, {
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

    if (AppState.currentState === "active") subscribe();
    //sensor sleeps with the app
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") subscribe();
      else unsubscribe();
    });

    return () => {
      isMounted = false;
      unsubscribe();
      appStateSub.remove();
    };
  }, [shift]);

  return shift;
}
