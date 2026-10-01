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
  Easing,
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { Gyroscope } from "expo-sensors";
import { useAnimatedValue } from "../../hooks/useAnimatedValue";
import { MAESTRO_BUTTERFLIES, useMaestroButterfly } from "./maestroButterfly";

const MAX_SHIFT = 16;
const DECAY = 0.92;
const GYRO_SPEED = 3.2;
//shared by the intro and the flight
const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

export type ButterflyClusterProps = {
  style?: StyleProp<ViewStyle>;
  incognito?: boolean;
  delay?: number;
  //flies in from this frame, skips intro
  from?: DOMRect | null;
  ref?: Ref<View>;
  parallax?: boolean;
};

//maestro butterfly with gyro parallax
function ButterflyCluster({
  style,
  incognito,
  delay = 250,
  from,
  ref,
  parallax = true,
}: ButterflyClusterProps) {
  const butterfly = MAESTRO_BUTTERFLIES[useMaestroButterfly()];
  const introAnim = useAnimatedValue(from ? 1 : 0);
  const gyro = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const flightAnim = useAnimatedValue(0);
  //window frame it lands on
  const [landing, setLanding] = useState<DOMRect | null>(null);
  const viewRef = useRef<View>(null);
  useImperativeHandle(ref, () => viewRef.current!, []);

  //sync read so the chat never paints unpushed
  useLayoutEffect(() => {
    if (!from || !viewRef.current) return;
    setLanding(viewRef.current.getBoundingClientRect());
    //layout props need the js driver
    Animated.timing(flightAnim, {
      toValue: 1,
      duration: 700,
      easing: EASE_OUT,
      useNativeDriver: false,
    }).start();
  }, [from, flightAnim]);

  //reveal butterfly on screen load
  useEffect(() => {
    if (from) return;
    const timer = setTimeout(() => {
      Animated.timing(introAnim, {
        toValue: 1,
        duration: 1100,
        easing: EASE_OUT,
        useNativeDriver: true,
      }).start();
    }, delay);

    return () => clearTimeout(timer);
  }, [introAnim, delay, from]);

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

  const flightStyle = useMemo(() => {
    if (!from) return null;
    //hidden until measured
    if (!landing) return { opacity: 0 };
    //starts at home size, pushes chat down
    return {
      marginTop: flightAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [from.y - landing.y, 0],
      }),
      width: flightAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [from.width, landing.width],
      }),
      height: flightAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [from.height, landing.height],
      }),
    };
  }, [from, landing, flightAnim]);

  return (
    <Animated.View ref={viewRef} pointerEvents="none" style={[style, flightStyle]}>
      <Animated.View
        style={[styles.imageFill, { opacity: introOpacity, transform: introTransform }]}
      >
        <Animated.Image
          source={incognito ? butterfly.grey : butterfly.color}
          style={[styles.imageFill, { transform: gyroTransform }]}
          resizeMode="contain"
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  imageFill: {
    width: "100%",
    height: "100%",
  },
});

export default memo(ButterflyCluster);
