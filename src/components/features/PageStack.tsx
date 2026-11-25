import {
    memo,
    ReactNode,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    Animated,
    Keyboard,
    PanResponder,
    Platform,
    StyleSheet,
    View,
} from "react-native";
import { usePredictiveBack } from "../../hooks/usePredictiveBack";
import {
    DRAWER_NATIVE_DRIVER,
    gestureVelocity,
    releaseOpens,
    settlePage,
} from "./drawerAnimation";

const EDGE_SWIPE_WIDTH = 40;

type Transition<K> = {
  from: K;
  to: K;
  back: boolean;
  progress: Animated.Value;
};

type EdgeHandlers<K extends string> = {
  enabled: boolean;
  width: number;
  page: K;
  parent: K | null;
  measureLeft: (onMeasured: (x: number) => void) => void;
  onStart: (t: Transition<K>) => void;
  onCancel: (t: Transition<K>, velocity: number) => void;
  onCommit: (velocity: number) => void;
};

function createEdgeResponder<K extends string>() {
  let handlers: EdgeHandlers<K> | null = null;
  let active: Transition<K> | null = null;
  let left = 0;

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponderCapture: () => {
      if (handlers?.enabled && handlers.parent !== null) {
        handlers.measureLeft((x) => {
          left = x;
        });
      }
      return false;
    },
    onMoveShouldSetPanResponder: (_, gestureState) => {
      if (
        !handlers ||
        !handlers.enabled ||
        handlers.parent === null ||
        handlers.width <= 0
      ) {
        return false;
      }
      const edgeX = gestureState.x0 - left;
      return (
        edgeX >= -2 &&
        edgeX < EDGE_SWIPE_WIDTH &&
        gestureState.dx > 10 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
      );
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (_, gestureState) => {
      if (!handlers || handlers.parent === null || handlers.width <= 0) return;
      Keyboard.dismiss();
      const ratio = Math.max(0, Math.min(1, gestureState.dx / handlers.width));
      const t: Transition<K> = {
        from: handlers.page,
        to: handlers.parent,
        back: true,
        progress: new Animated.Value(ratio, {
          useNativeDriver: DRAWER_NATIVE_DRIVER,
        }),
      };
      active = t;
      handlers.onStart(t);
    },
    onPanResponderMove: (_, gestureState) => {
      if (!active || !handlers || handlers.width <= 0) return;
      active.progress.setValue(
        Math.max(0, Math.min(1, gestureState.dx / handlers.width)),
      );
    },
    onPanResponderRelease: (_, gestureState) => {
      const t = active;
      active = null;
      if (!t || !handlers || handlers.width <= 0) return;
      const ratio = Math.max(0, Math.min(1, gestureState.dx / handlers.width));
      const velocity = gestureVelocity(gestureState.vx, handlers.width);
      if (releaseOpens(ratio, gestureState.vx)) {
        handlers.onCommit(velocity);
      } else {
        handlers.onCancel(t, velocity);
      }
    },
    onPanResponderTerminate: () => {
      const t = active;
      active = null;
      if (t && handlers) handlers.onCancel(t, 0);
    },
  });

  return {
    panHandlers: panResponder.panHandlers,
    setHandlers: (next: EdgeHandlers<K>) => {
      handlers = next;
    },
  };
}

type PageStackProps<K extends string> = {
  page: K;
  visible: boolean;
  width: number;
  parentOf: (page: K) => K | null;
  gestureEnabled?: boolean;
  edgeSwipeEnabled?: boolean;
  onBack: () => void;
  renderPage: (page: K, active: boolean) => ReactNode;
};

//a target above the current page comes back from the left
function isAncestor<K>(
  parentOf: (page: K) => K | null,
  page: K,
  child: K,
): boolean {
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
  edgeSwipeEnabled = Platform.OS === "ios",
  onBack,
  renderPage,
}: PageStackProps<K>) {
  const [shown, setShown] = useState(page);
  const [wasVisible, setWasVisible] = useState(visible);
  const [transition, setTransition] = useState<Transition<K> | null>(null);
  const gestureRef = useRef<Transition<K> | null>(null);
  const releaseVelocityRef = useRef(0);
  const stackRef = useRef<View>(null);
  const [edgeResponder] = useState(() => createEdgeResponder<K>());

  //opening jumps to the entry page, a page already in flight keeps its push
  if (page !== shown || visible !== wasVisible) {
    setShown(page);
    setWasVisible(visible);
    if (page !== shown) {
      const inFlight =
        transition && (transition.from === page || transition.to === page);
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
    const velocity = releaseVelocityRef.current;
    releaseVelocityRef.current = 0;
    settlePage(
      transition.progress,
      page === transition.to ? 1 : 0,
      () => setTransition((cur) => (cur === transition ? null : cur)),
      velocity,
    );
  }, [transition, page]);

  const parent = parentOf(page);
  useLayoutEffect(() => {
    edgeResponder.setHandlers({
      enabled: edgeSwipeEnabled && visible && gestureEnabled,
      width,
      page,
      parent,
      measureLeft: (onMeasured) =>
        stackRef.current?.measureInWindow(onMeasured),
      onStart: (t) => {
        //a push still landing is cut short so the gesture always takes over
        transition?.progress.stopAnimation();
        gestureRef.current = t;
        setTransition(t);
      },
      onCancel: (t, velocity) => {
        gestureRef.current = null;
        settlePage(
          t.progress,
          0,
          () => setTransition((cur) => (cur === t ? null : cur)),
          velocity,
        );
      },
      onCommit: (velocity) => {
        gestureRef.current = null;
        releaseVelocityRef.current = velocity;
        onBack();
      },
    });
  });

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
        progress: new Animated.Value(0, {
          useNativeDriver: DRAWER_NATIVE_DRIVER,
        }),
      };
      gestureRef.current = t;
      setTransition(t);
    },
    onProgress: (progress) => gestureRef.current?.progress.setValue(progress),
    onCancel: () => {
      const t = gestureRef.current;
      gestureRef.current = null;
      if (t) {
        settlePage(t.progress, 0, () =>
          setTransition((cur) => (cur === t ? null : cur)),
        );
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
      from: transition.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, shift],
      }),
      to: transition.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [-shift, 0],
      }),
    };
  }, [transition, width]);

  return (
    <View
      ref={stackRef}
      collapsable={false}
      style={styles.stack}
      {...edgeResponder.panHandlers}
    >
      {(transition ? [transition.from, transition.to] : [page]).map((p) => (
        //keyed so the leaving page keeps its scroll
        <PageLayer
          key={p}
          translateX={
            !shifts ? 0 : p === transition?.from ? shifts.from : shifts.to
          }
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
  (prev, next) =>
    !prev.active && !next.active && prev.translateX === next.translateX,
);

const styles = StyleSheet.create({
  stack: {
    flex: 1,
  },
});
