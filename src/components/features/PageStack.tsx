import { memo, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { usePredictiveBack } from "../../hooks/usePredictiveBack";
import { DRAWER_NATIVE_DRIVER, settlePage } from "./drawerAnimation";

type Transition<K> = {
  from: K;
  to: K;
  back: boolean;
  progress: Animated.Value;
};

type PageStackProps<K extends string> = {
  page: K;
  visible: boolean;
  width: number;
  parentOf: (page: K) => K | null;
  gestureEnabled?: boolean;
  onBack: () => void;
  renderPage: (page: K, active: boolean) => ReactNode;
};

//a target above the current page comes back from the left
function isAncestor<K>(parentOf: (page: K) => K | null, page: K, child: K): boolean {
  for (let p = parentOf(child); p !== null; p = parentOf(p)) {
    if (p === page) return true;
  }
  return false;
}

//next page pushes the current one, the android back gesture drags the push
export default function PageStack<K extends string>({
  page,
  visible,
  width,
  parentOf,
  gestureEnabled = true,
  onBack,
  renderPage,
}: PageStackProps<K>) {
  const [shown, setShown] = useState(page);
  const [wasVisible, setWasVisible] = useState(visible);
  const [transition, setTransition] = useState<Transition<K> | null>(null);
  const gestureRef = useRef<Transition<K> | null>(null);

  //opening jumps to the entry page, a page already in flight keeps its push
  if (page !== shown || visible !== wasVisible) {
    setShown(page);
    setWasVisible(visible);
    if (page !== shown) {
      const inFlight = transition && (transition.from === page || transition.to === page);
      if (!visible || !wasVisible) {
        setTransition(null);
      } else if (!inFlight) {
        setTransition({
          from: shown,
          to: page,
          back: isAncestor(parentOf, page, shown),
          progress: new Animated.Value(0),
        });
      }
    }
  }

  //lands on the committed page, going back mid push rewinds it
  useEffect(() => {
    if (!transition || gestureRef.current === transition) return;
    settlePage(transition.progress, page === transition.to ? 1 : 0, () =>
      setTransition((cur) => (cur === transition ? null : cur)),
    );
  }, [transition, page]);

  const parent = parentOf(page);
  usePredictiveBack(visible && gestureEnabled && parent !== null, {
    onStart: () => {
      if (parent === null) return;
      //a push still landing is cut short so the gesture always takes over
      transition?.progress.stopAnimation();
      const t = {
        from: page,
        to: parent,
        back: true,
        //native from the start, finger updates skip react entirely
        progress: new Animated.Value(0, { useNativeDriver: DRAWER_NATIVE_DRIVER }),
      };
      gestureRef.current = t;
      setTransition(t);
    },
    onProgress: (progress) => gestureRef.current?.progress.setValue(progress),
    onCancel: () => {
      const t = gestureRef.current;
      gestureRef.current = null;
      if (t) {
        settlePage(t.progress, 0, () => setTransition((cur) => (cur === t ? null : cur)));
      }
    },
    onBack: () => {
      gestureRef.current = null;
      onBack();
    },
  });

  //built once per push, new nodes on each render would churn the native graph
  const shifts = useMemo(() => {
    if (!transition) return null;
    const shift = transition.back ? width : -width;
    return {
      from: transition.progress.interpolate({ inputRange: [0, 1], outputRange: [0, shift] }),
      to: transition.progress.interpolate({ inputRange: [0, 1], outputRange: [-shift, 0] }),
    };
  }, [transition, width]);

  return (
    <View style={styles.stack}>
      {(transition ? [transition.from, transition.to] : [page]).map((p) => (
        //keyed so the leaving page keeps its scroll
        <PageLayer
          key={p}
          translateX={!shifts ? 0 : p === transition?.from ? shifts.from : shifts.to}
          active={p === page}
          render={() => renderPage(p, p === page)}
        />
      ))}
    </View>
  );
}

type PageLayerProps = {
  translateX: Animated.AnimatedInterpolation<number> | number;
  active: boolean;
  render: () => ReactNode;
};

//an inactive page stays frozen, rebuilding it would compete with the push
const PageLayer = memo(
  function PageLayer({ translateX, active, render }: PageLayerProps) {
    return (
      <Animated.View
        //transform never goes null, fabric asserts once the native driver owned it
        style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}
        pointerEvents={active ? "auto" : "none"}
      >
        {render()}
      </Animated.View>
    );
  },
  (prev, next) => !prev.active && !next.active && prev.translateX === next.translateX,
);

const styles = StyleSheet.create({
  stack: {
    flex: 1,
  },
});
