import { useEffect, useState } from "react";
import { Animated, Platform } from "react-native";
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

    Gyroscope.isAvailableAsync().then((available) => {
      if (!available || !isMounted) return;

      Gyroscope.setUpdateInterval(50);
      sub = Gyroscope.addListener(({ x, y }) => {
        //decay keeps the shadow settling back at rest
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

    return () => {
      isMounted = false;
      sub?.remove();
    };
  }, [shift]);

  return shift;
}
