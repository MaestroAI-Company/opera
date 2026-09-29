import { memo, useEffect, useMemo, useRef, useState } from "react";
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

const butterflyLeft = MAESTRO_BUTTERFLIES.butterfly4.color;
const butterflyBottom = MAESTRO_BUTTERFLIES.butterfly3.color;

const MAX_SHIFT = 16;
const DECAY = 0.92;
const GYRO_SPEED = 3.2;

export type ButterflyClusterProps = {
  style?: StyleProp<ViewStyle>;
  incognito?: boolean;
  delay?: number;
};

//cluster with gyro parallax
function ButterflyCluster({ style, incognito, delay = 250 }: ButterflyClusterProps) {
  const maestro = useMaestroButterfly();
  //a single butterfly takes the lead spot
  const lead = MAESTRO_BUTTERFLIES[maestro === "cluster" ? "butterfly2" : maestro];
  //lead alone, same layout as incognito
  const alone = incognito || maestro !== "cluster";
  const [containerSize, setContainerSize] = useState({ width: 250, height: 250 });
  const incognitoAnim = useRef(new Animated.Value(incognito ? 1 : 0)).current;
  const aloneAnim = useAnimatedValue(alone ? 1 : 0);
  const introAnim = useRef(new Animated.Value(0)).current;

  //reveal cluster on screen load
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

  //animate between cluster and incognito
  useEffect(() => {
    const timing = (value: Animated.Value, on: boolean) =>
      Animated.timing(value, {
        toValue: on ? 1 : 0,
        duration: 160,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        useNativeDriver: true,
      });
    Animated.parallel([timing(incognitoAnim, !!incognito), timing(aloneAnim, alone)]).start();
  }, [incognito, alone, incognitoAnim, aloneAnim]);

  const leftGyro = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const topRightGyro = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const bottomGyro = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  useEffect(() => {
    if (Platform.OS === "web") {
      leftGyro.setValue({ x: 0, y: 0 });
      topRightGyro.setValue({ x: 0, y: 0 });
      bottomGyro.setValue({ x: 0, y: 0 });
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
            Animated.spring(topRightGyro, {
              toValue: { x: 0, y: 0 },
              tension: 26,
              friction: 9,
              useNativeDriver: true,
            }).start();
            if (!alone) {
              Animated.spring(leftGyro, {
                toValue: { x: 0, y: 0 },
                tension: 22,
                friction: 9.5,
                useNativeDriver: true,
              }).start();
              Animated.spring(bottomGyro, {
                toValue: { x: 0, y: 0 },
                tension: 18,
                friction: 10,
                useNativeDriver: true,
              }).start();
            }
            return;
          }

          wasAtRest = false;

          //accumulate angular motion with gentle decay
          current.x = current.x * DECAY + y * GYRO_SPEED;
          current.y = current.y * DECAY + x * GYRO_SPEED;

          //clamp bounds to prevent detachment
          const tx = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, current.x));
          const ty = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, current.y));

          //light responsive flutter for top butterfly
          Animated.spring(topRightGyro, {
            toValue: { x: tx * 1.15, y: ty * 0.9 },
            tension: 26,
            friction: 9,
            useNativeDriver: true,
          }).start();

          if (!alone) {
            //side butterfly glides with gentle drag
            Animated.spring(leftGyro, {
              toValue: { x: tx * 0.85, y: ty * 1.1 },
              tension: 22,
              friction: 9.5,
              useNativeDriver: true,
            }).start();

            //bottom butterfly follows with soft inertia
            Animated.spring(bottomGyro, {
              toValue: { x: tx * 1.0, y: ty * 1.2 },
              tension: 18,
              friction: 10,
              useNativeDriver: true,
            }).start();
          }
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
  }, [alone, leftGyro, topRightGyro, bottomGyro]);

  const topRightAloneTransform = useMemo(
    () => [
      {
        translateX: aloneAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -0.1937 * containerSize.width],
        }),
      },
      {
        translateY: aloneAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 0.20135 * containerSize.height],
        }),
      },
      {
        scale: aloneAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.550388],
        }),
      },
    ],
    [containerSize.width, containerSize.height, aloneAnim],
  );

  const otherAloneTransform = useMemo(
    () => [
      {
        scale: aloneAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.85],
        }),
      },
    ],
    [aloneAnim],
  );

  const otherOpacity = useMemo(
    () =>
      aloneAnim.interpolate({
        inputRange: [0, 0.45, 1],
        outputRange: [1, 0, 0],
        extrapolate: "clamp",
      }),
    [aloneAnim],
  );

  const coloredOpacity = useMemo(
    () =>
      incognitoAnim.interpolate({
        inputRange: [0, 0.7, 1],
        outputRange: [1, 0.15, 0],
        extrapolate: "clamp",
      }),
    [incognitoAnim],
  );

  const greyOpacity = useMemo(
    () =>
      incognitoAnim.interpolate({
        inputRange: [0, 0.3, 1],
        outputRange: [0, 0.85, 1],
        extrapolate: "clamp",
      }),
    [incognitoAnim],
  );

  const leftGyroTransform = useMemo(
    () => [
      { translateX: leftGyro.x },
      { translateY: leftGyro.y },
      {
        rotate: leftGyro.x.interpolate({
          inputRange: [-16, 16],
          outputRange: ["-4deg", "4deg"],
          extrapolate: "clamp",
        }),
      },
    ],
    [leftGyro],
  );

  const topRightGyroTransform = useMemo(
    () => [
      { translateX: topRightGyro.x },
      { translateY: topRightGyro.y },
      {
        rotate: topRightGyro.x.interpolate({
          inputRange: [-16, 16],
          outputRange: ["-5deg", "5deg"],
          extrapolate: "clamp",
        }),
      },
    ],
    [topRightGyro],
  );

  const bottomGyroTransform = useMemo(
    () => [
      { translateX: bottomGyro.x },
      { translateY: bottomGyro.y },
      {
        rotate: bottomGyro.x.interpolate({
          inputRange: [-16, 16],
          outputRange: ["3.5deg", "-3.5deg"],
          extrapolate: "clamp",
        }),
      },
    ],
    [bottomGyro],
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

  //fan left and rise up
  const leftIntroTransform = useMemo(
    () => [
      {
        translateX: introAnim.interpolate({
          inputRange: [0, 0.35, 1],
          outputRange: [
            0.22185 * containerSize.width,
            0.22185 * containerSize.width * 0.7,
            0,
          ],
        }),
      },
      {
        translateY: introAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.515 * containerSize.height, 0],
        }),
      },
      {
        scale: introAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.35, 1],
        }),
      },
      {
        rotate: introAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ["-8deg", "0deg"],
        }),
      },
    ],
    [containerSize.width, containerSize.height, introAnim],
  );

  //fan right and rise up
  const topRightIntroTransform = useMemo(
    () => [
      {
        translateX: introAnim.interpolate({
          inputRange: [0, 0.35, 1],
          outputRange: [
            -0.1937 * containerSize.width,
            -0.1937 * containerSize.width * 0.7,
            0,
          ],
        }),
      },
      {
        translateY: introAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.66135 * containerSize.height, 0],
        }),
      },
      {
        scale: introAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.35, 1],
        }),
      },
      {
        rotate: introAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ["6deg", "0deg"],
        }),
      },
    ],
    [containerSize.width, containerSize.height, introAnim],
  );

  //rise to cluster base anchor
  const bottomIntroTransform = useMemo(
    () => [
      {
        translateX: introAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-0.0182 * containerSize.width, 0],
        }),
      },
      {
        translateY: introAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.2201 * containerSize.height, 0],
        }),
      },
      {
        scale: introAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.35, 1],
        }),
      },
      {
        rotate: introAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ["-2deg", "0deg"],
        }),
      },
    ],
    [containerSize.width, containerSize.height, introAnim],
  );

  return (
    <View
      pointerEvents="none"
      style={[styles.container, style]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0 && height > 0) {
          setContainerSize((prev) =>
            prev.width === width && prev.height === height ? prev : { width, height },
          );
        }
      }}
    >
      <Animated.View
        style={[
          styles.left,
          {
            opacity: introOpacity,
            transform: leftIntroTransform,
            zIndex: 1,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.imageFill,
            {
              opacity: otherOpacity,
              transform: otherAloneTransform,
            },
          ]}
        >
          <Animated.Image
            source={butterflyLeft}
            style={[styles.imageFill, { transform: leftGyroTransform }]}
            resizeMode="contain"
          />
        </Animated.View>
      </Animated.View>

      <Animated.View
        style={[
          styles.bottom,
          {
            opacity: introOpacity,
            transform: bottomIntroTransform,
            zIndex: 2,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.imageFill,
            {
              opacity: otherOpacity,
              transform: otherAloneTransform,
            },
          ]}
        >
          <Animated.Image
            source={butterflyBottom}
            style={[styles.imageFill, { transform: bottomGyroTransform }]}
            resizeMode="contain"
          />
        </Animated.View>
      </Animated.View>

      <Animated.View
        style={[
          styles.topRight,
          {
            opacity: introOpacity,
            transform: topRightIntroTransform,
            zIndex: alone ? 5 : 3,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.imageFill,
            {
              transform: topRightAloneTransform,
            },
          ]}
        >
          <Animated.View
            style={[styles.imageFill, { transform: topRightGyroTransform }]}
          >
            <Animated.Image
              source={lead.color}
              style={[styles.imageFill, { opacity: coloredOpacity }]}
              resizeMode="contain"
            />
            <Animated.Image
              source={lead.grey}
              style={[styles.imageFill, StyleSheet.absoluteFill, { opacity: greyOpacity }]}
              resizeMode="contain"
            />
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  imageFill: {
    width: "100%",
    height: "100%",
  },
  left: {
    position: "absolute",
    left: "1.72%",
    top: "16.75%",
    width: "52.19%",
    height: "55.50%",
  },
  topRight: {
    position: "absolute",
    left: "37.12%",
    top: "-0.93%",
    width: "64.50%",
    height: "61.59%",
  },
  bottom: {
    position: "absolute",
    left: "19.07%",
    top: "52.45%",
    width: "65.50%",
    height: "43.08%",
  },
});

export default memo(ButterflyCluster);
