import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Animated,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FontSizes, Fonts, Radius, Spacing } from "../../../constants/theme";
import { useColors } from "../../hooks/useTheme";

type TargetRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LabelData = {
  label: string;
  target: TargetRect;
};

type IconLabelContextValue = {
  showLabel: (label: string, ref: any) => void;
  hideLabel: () => void;
};

const IconLabelContext = createContext<IconLabelContextValue>({
  showLabel: () => {},
  hideLabel: () => {},
});

export function useIconLabel(): IconLabelContextValue {
  return useContext(IconLabelContext);
}

export function IconLabelProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<LabelData | null>(null);
  const activeReqRef = useRef(0);

  const showLabel = useCallback((label: string, ref: any) => {
    if (!label || !ref) return;
    const node = "current" in ref ? ref.current : ref;
    if (!node) return;

    const reqId = ++activeReqRef.current;

    const onMeasured = (
      x: number,
      y: number,
      width: number,
      height: number,
    ) => {
      if (activeReqRef.current !== reqId) return;
      if (width === 0 && height === 0) return;
      setData({ label, target: { x, y, width, height } });
    };

    if (typeof node.measureInWindow === "function") {
      node.measureInWindow(onMeasured);
    } else if (typeof node.getBoundingClientRect === "function") {
      const rect = node.getBoundingClientRect();
      onMeasured(rect.left, rect.top, rect.width, rect.height);
    }
  }, []);

  const hideLabel = useCallback(() => {
    activeReqRef.current++;
    setData(null);
  }, []);

  return (
    <IconLabelContext.Provider value={{ showLabel, hideLabel }}>
      {children}
      <IconLabelOverlay data={data} />
    </IconLabelContext.Provider>
  );
}

function IconLabelOverlay({ data }: { data: LabelData | null }) {
  const Colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [currentData, setCurrentData] = useState<LabelData | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  //sync active label data and animate
  useEffect(() => {
    if (data) {
      setCurrentData(data);
      setSize(null);
      opacity.setValue(0);
    } else {
      //fade out before unmounting
      Animated.timing(opacity, {
        toValue: 0,
        duration: 80,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setCurrentData(null);
          setSize(null);
        }
      });
    }
  }, [data, opacity]);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setSize({ width, height });
      Animated.timing(opacity, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }).start();
    },
    [opacity],
  );

  if (!currentData) return null;

  const target = currentData.target;
  let top = 0;
  let left = 0;

  if (size) {
    const centerX = target.x + target.width / 2;
    left = Math.max(
      Spacing.sm,
      Math.min(windowWidth - size.width - Spacing.sm, centerX - size.width / 2),
    );
    top = target.y - size.height - Spacing.xs;
    //place below button if cramped
    if (top < insets.top + Spacing.xs) {
      top = target.y + target.height + Spacing.xs;
    }
  }

  return (
    <View style={styles.overlay} pointerEvents="none">
      <Animated.View
        onLayout={onLayout}
        style={[
          styles.bubble,
          {
            backgroundColor: Colors.surface,
            borderColor: Colors.border,
            opacity,
            transform: size
              ? [{ translateX: left }, { translateY: top }]
              : [{ translateX: -9999 }, { translateY: -9999 }],
          },
        ]}
      >
        <Text style={[styles.label, { color: Colors.textPrimary }]}>
          {currentData.label}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999999,
    elevation: 999999,
  },
  bubble: {
    position: "absolute",
    top: 0,
    left: 0,
    borderWidth: 2,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.xxl,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.labelSm,
  },
});
