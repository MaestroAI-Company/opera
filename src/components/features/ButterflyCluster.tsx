import {
  memo,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
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
import Reanimated, {
  Easing as ReanimatedEasing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { AppEvents } from "../../services/events";
import { OverlayPresence } from "../../services/overlay/overlayPresence";
import { MAESTRO_BUTTERFLIES, useMaestroButterfly } from "./maestroButterfly";

const MAX_SHIFT = 16;
const DECAY = 0.92;
const GYRO_SPEED = 3.2;
//shared by the intro and the flight
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

type Flight = {
  top: number;
  width: number;
  height: number;
  toWidth: number;
  toHeight: number;
};

export type ButterflyClusterProps = {
  style?: StyleProp<ViewStyle>;
  incognito?: boolean;
  delay?: number;
  //flies in from this frame, skips intro
  from?: DOMRect | null;
  ref?: Ref<View>;
  parallax?: boolean;
  intro?: boolean;
};

//maestro butterfly with gyro parallax
function ButterflyCluster({
  style,
  incognito,
  delay = 250,
  from,
  ref,
  parallax = true,
  intro = true,
}: ButterflyClusterProps) {
  const butterfly = MAESTRO_BUTTERFLIES[useMaestroButterfly()];
  //flight or no intro starts fully shown
  const introAnim = useAnimatedValue(from || !intro ? 1 : 0);
  const gyro = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const flightProgress = useSharedValue(0);
  //plain numbers, worklets cannot read DOMRect getters
  const [flight, setFlight] = useState<Flight | null>(null);
  const viewRef = useRef<View>(null);
  useImperativeHandle(ref, () => viewRef.current!, []);

  //sync read so the chat never paints unpushed
  useLayoutEffect(() => {
    if (!from || !viewRef.current) return;
    const to = viewRef.current.getBoundingClientRect();
    setFlight({
      top: from.y - to.y,
      width: from.width,
      height: from.height,
      toWidth: to.width,
      toHeight: to.height,
    });
  }, [from]);

  //ui thread keeps it smooth while the chat mounts
  const flightStyle = useAnimatedStyle(() => {
    if (!flight) return {};
    const p = flightProgress.value;
    return {
      marginTop: interpolate(p, [0, 1], [flight.top, 0]),
      width: interpolate(p, [0, 1], [flight.width, flight.toWidth]),
      height: interpolate(p, [0, 1], [flight.height, flight.toHeight]),
    };
  });

  //after the style mapper so it starts at zero
  useEffect(() => {
    if (!flight) return;
    flightProgress.set(
      withTiming(1, { duration: 700, easing: ReanimatedEasing.bezier(...EASE_OUT) }),
    );
  }, [flight, flightProgress]);

  //reveal butterfly on screen load
  useEffect(() => {
    if (from || !intro) return;
    const timer = setTimeout(() => {
      Animated.timing(introAnim, {
        toValue: 1,
        duration: 1100,
        easing: Easing.bezier(...EASE_OUT),
        useNativeDriver: true,
      }).start();
    }, delay);

    return () => clearTimeout(timer);
  }, [introAnim, delay, from, intro]);

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
    <Reanimated.View
      ref={viewRef}
      pointerEvents="none"
      style={[
        style,
        //hidden until measured
        from && !flight && styles.hidden,
        //starts at home size, pushes chat down
        flight && { marginTop: flight.top, width: flight.width, height: flight.height },
        flightStyle,
      ]}
    >
      <Animated.View
        style={[styles.imageFill, { opacity: introOpacity, transform: introTransform }]}
      >
        <Animated.Image
          source={incognito ? butterfly.grey : butterfly.color}
          style={[styles.imageFill, { transform: gyroTransform }]}
          resizeMode="contain"
        />
      </Animated.View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  imageFill: {
    width: "100%",
    height: "100%",
  },
  hidden: {
    opacity: 0,
  },
});

export default memo(ButterflyCluster);
