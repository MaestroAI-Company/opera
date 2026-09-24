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

const butterflyLeft = require("../../../assets/images/butterfly4.png");
const butterflyTopRight = require("../../../assets/images/butterfly2.png");
const butterflyBottom = require("../../../assets/images/butterfly3.png");
const butterflyGrey = require("../../../assets/images/butterfly2_grey.png");

const MAX_SHIFT = 16;
const DECAY = 0.92;
const GYRO_SPEED = 3.2;

export type ButterflyClusterProps = {
  style?: StyleProp<ViewStyle>;
  incognito?: boolean;
};

//cluster with gyro parallax
function ButterflyCluster({ style, incognito }: ButterflyClusterProps) {
  const [containerSize, setContainerSize] = useState({ width: 250, height: 250 });
  const incognitoAnim = useRef(new Animated.Value(incognito ? 1 : 0)).current;

  //animate between cluster and incognito
  useEffect(() => {
    Animated.timing(incognitoAnim, {
      toValue: incognito ? 1 : 0,
      duration: 160,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: true,
    }).start();
  }, [incognito, incognitoAnim]);

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
            if (!incognito) {
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

          if (!incognito) {
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
  }, [incognito, leftGyro, topRightGyro, bottomGyro]);

  const topRightIncognitoTransform = useMemo(
    () => [
      {
        translateX: incognitoAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -0.1937 * containerSize.width],
        }),
      },
      {
        translateY: incognitoAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 0.20135 * containerSize.height],
        }),
      },
      {
        scale: incognitoAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.550388],
        }),
      },
    ],
    [containerSize.width, containerSize.height, incognitoAnim],
  );

  const otherIncognitoTransform = useMemo(
    () => [
      {
        scale: incognitoAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.85],
        }),
      },
    ],
    [incognitoAnim],
  );

  const otherOpacity = useMemo(
    () =>
      incognitoAnim.interpolate({
        inputRange: [0, 0.45, 1],
        outputRange: [1, 0, 0],
        extrapolate: "clamp",
      }),
    [incognitoAnim],
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
            opacity: otherOpacity,
            transform: otherIncognitoTransform,
            zIndex: 1,
          },
        ]}
      >
        <Animated.Image
          source={butterflyLeft}
          style={[styles.imageFill, { transform: leftGyroTransform }]}
          resizeMode="contain"
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.bottom,
          {
            opacity: otherOpacity,
            transform: otherIncognitoTransform,
            zIndex: 2,
          },
        ]}
      >
        <Animated.Image
          source={butterflyBottom}
          style={[styles.imageFill, { transform: bottomGyroTransform }]}
          resizeMode="contain"
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.topRight,
          {
            transform: topRightIncognitoTransform,
            zIndex: incognito ? 5 : 3,
          },
        ]}
      >
        <Animated.View
          style={[styles.imageFill, { transform: topRightGyroTransform }]}
        >
          <Animated.Image
            source={butterflyTopRight}
            style={[styles.imageFill, { opacity: coloredOpacity }]}
            resizeMode="contain"
          />
          <Animated.Image
            source={butterflyGrey}
            style={[styles.imageFill, StyleSheet.absoluteFill, { opacity: greyOpacity }]}
            resizeMode="contain"
          />
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
