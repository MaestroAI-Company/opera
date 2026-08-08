import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Path, RadialGradient, Stop, Circle } from 'react-native-svg';
import { Colors, Fonts, FontSizes, Radius } from '../../../constants/theme';
import { snapToDetection, YoloDetection } from '../../services/overlay/yoloPostprocess';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const DEV = false; //draw yolo boxes for debug

const DOUBLE_TAP_MS = 220;
const DRAG_TOL = 10;
const HANDLE_HIT = 32;
const HANDLE_SIZE = 22;
const SNAP_TOL = 16;
const MIN_BOX = 40;
const DEFAULT_BOX = 120;
const ZONE_INFLATE = 1.1;
const SNAP_DIST = 80;
const MIN_DRAW_DIST = 4;
const PATH_INFLATE = 1.15;
const STROKE_WIDTH = 7;
const GLOW_RADIUS = 55;

type Point = { x: number; y: number };

//smooth a raw point list into a quadratic-bezier path through the midpoints
function smoothPathD(points: Point[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const mx = (curr.x + next.x) / 2;
    const my = (curr.y + next.y) / 2;
    d += ` Q ${curr.x} ${curr.y} ${mx} ${my}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

export type SelectionRegion = { x: number; y: number; w: number; h: number };

export type SelectionState =
  | { kind: 'none' }
  | { kind: 'box'; region: SelectionRegion };

type Rect = { x1: number; y1: number; x2: number; y2: number };

type Props = {
  detections: YoloDetection[];
  screenshotSize?: { width: number; height: number } | null;
  selection: SelectionState;
  onChange: (s: SelectionState) => void;
  onVibrate?: () => void;
  onDrawingChange?: (drawing: boolean) => void;
};

function inflateRect(r: Rect, f: number): Rect {
  const w = r.x2 - r.x1;
  const h = r.y2 - r.y1;
  return {
    x1: r.x1 - (w * f - w) / 2,
    y1: r.y1 - (h * f - h) / 2,
    x2: r.x2 + (w * f - w) / 2,
    y2: r.y2 + (h * f - h) / 2,
  };
}

//assumes `sorted` is already ordered by area asc
function hitZone(sorted: YoloDetection[], x: number, y: number): YoloDetection | null {
  for (let i = 0; i < sorted.length; i++) {
    const d = sorted[i];
    const z = inflateRect(d, ZONE_INFLATE);
    if (x >= z.x1 && x <= z.x2 && y >= z.y1 && y <= z.y2) return d;
  }
  return null;
}

function snapRect(r: Rect, detections: YoloDetection[], w: number, h: number): Rect {
  let { x1, y1, x2, y2 } = r;
  const snapEdge = (val: number, pick: (d: YoloDetection) => number): number => {
    let best = val;
    let bestDist = SNAP_TOL;
    for (const d of detections) {
      const v = pick(d);
      const dist = Math.abs(v - val);
      if (dist < bestDist) {
        bestDist = dist;
        best = v;
      }
    }
    return best;
  };
  const sx1 = snapEdge(x1, d => d.x1);
  const sx2 = snapEdge(x2, d => d.x2);
  const sy1 = snapEdge(y1, d => d.y1);
  const sy2 = snapEdge(y2, d => d.y2);
  //skip snap if box gets too small
  if (sx2 - sx1 < MIN_BOX || sy2 - sy1 < MIN_BOX) {
    return { x1, y1, x2, y2 };
  }
  return { x1: sx1, y1: sy1, x2: sx2, y2: sy2 };
}

function useReanimatedRect(targetRect: Rect | null, isDragging: boolean) {
  const x1 = useSharedValue(targetRect?.x1 || 0);
  const y1 = useSharedValue(targetRect?.y1 || 0);
  const x2 = useSharedValue(targetRect?.x2 || 0);
  const y2 = useSharedValue(targetRect?.y2 || 0);

  const prevTargetRef = useRef<Rect | null>(targetRect);

  //depend on numeric values so a new Rect object with equal coords is a no-op
  const tx1 = targetRect?.x1 ?? null;
  const ty1 = targetRect?.y1 ?? null;
  const tx2 = targetRect?.x2 ?? null;
  const ty2 = targetRect?.y2 ?? null;

  useEffect(() => {
    if (tx1 == null || ty1 == null || tx2 == null || ty2 == null) {
      prevTargetRef.current = null;
      return;
    }
    if (!prevTargetRef.current || isDragging) {
      x1.value = tx1;
      y1.value = ty1;
      x2.value = tx2;
      y2.value = ty2;
    } else {
      const config = { duration: 300, easing: Easing.out(Easing.cubic) };
      x1.value = withTiming(tx1, config);
      y1.value = withTiming(ty1, config);
      x2.value = withTiming(tx2, config);
      y2.value = withTiming(ty2, config);
    }
    prevTargetRef.current = { x1: tx1, y1: ty1, x2: tx2, y2: ty2 };
  }, [tx1, ty1, tx2, ty2, isDragging, x1, y1, x2, y2]);

  return { x1, y1, x2, y2 };
}

export default function SelectionLayer({ detections, screenshotSize, selection, onChange, onVibrate, onDrawingChange }: Props) {
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 1, h: 1 });
  const [isDraggingHandle, setIsDraggingHandle] = useState(false);

  //rescale detections from screenshot pixels into layout space
  const scaledDetections = useMemo(() => {
    if (!screenshotSize || screenshotSize.width <= 0 || screenshotSize.height <= 0) return detections;
    const sx = size.w / screenshotSize.width;
    const sy = size.h / screenshotSize.height;
    return detections.map(d => ({ ...d, x1: d.x1 * sx, y1: d.y1 * sy, x2: d.x2 * sx, y2: d.y2 * sy }));
  }, [detections, screenshotSize, size]);

  //smallest-first so hitZone returns the tightest matching zone
  const sortedByArea = useMemo(() => {
    const arr = scaledDetections.slice();
    arr.sort((a, b) => ((a.x2 - a.x1) * (a.y2 - a.y1)) - ((b.x2 - b.x1) * (b.y2 - b.y1)));
    return arr;
  }, [scaledDetections]);

  //latest props for once-created pan responders
  const stateRef = useRef({ size, scaledDetections, sortedByArea, selection, onChange, onVibrate, onDrawingChange });
  useEffect(() => {
    stateRef.current = { size, scaledDetections, sortedByArea, selection, onChange, onVibrate, onDrawingChange };
  }, [size, scaledDetections, sortedByArea, selection, onChange, onVibrate, onDrawingChange]);

  const pendingTapRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartRectRef = useRef<Rect | null>(null);
  const latestDragRectRef = useRef<Rect | null>(null);

  //freehand "circle to search" style draw, resolved into a box on release
  const [livePath, setLivePath] = useState<Point[] | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const drawPointsRef = useRef<Point[]>([]);
  const isDrawingRef = useRef(false);
  const drawRafPendingRef = useRef(false);

  //primary-colored glow that tracks the finger, mutated directly to skip react renders
  const glowX = useSharedValue(0);
  const glowY = useSharedValue(0);
  const glowAnimatedProps = useAnimatedProps(() => ({
    cx: glowX.value,
    cy: glowY.value,
  }));

  const flushLivePath = () => {
    if (drawRafPendingRef.current) return;
    drawRafPendingRef.current = true;
    requestAnimationFrame(() => {
      drawRafPendingRef.current = false;
      setLivePath([...drawPointsRef.current]);
    });
  };

  const px = (reg: SelectionRegion, s: { w: number; h: number }): Rect => ({
    x1: reg.x * s.w,
    y1: reg.y * s.h,
    x2: (reg.x + reg.w) * s.w,
    y2: (reg.y + reg.h) * s.h,
  });

  const region = (r: Rect, s: { w: number; h: number }): SelectionRegion => {
    const x = Math.max(0, Math.min(1, r.x1 / s.w));
    const y = Math.max(0, Math.min(1, r.y1 / s.h));
    const x2 = Math.max(0, Math.min(1, r.x2 / s.w));
    const y2 = Math.max(0, Math.min(1, r.y2 / s.h));
    return { x, y, w: Math.max(0.02, x2 - x), h: Math.max(0.02, y2 - y) };
  };

  const getBaseRect = (): Rect => {
    const s = stateRef.current;
    if (s.selection.kind === 'box') return px(s.selection.region, s.size);
    return { x1: 0, y1: 0, x2: s.size.w, y2: s.size.h };
  };

  const isFullScreenBox = (sel: SelectionState): boolean => {
    if (sel.kind !== 'box') return false;
    const r = sel.region;
    return r.x <= 0.001 && r.y <= 0.001 && r.w >= 0.999 && r.h >= 0.999;
  };

  const onTap = (x: number, y: number) => {
    const s = stateRef.current;
    if (isFullScreenBox(s.selection)) {
      s.onChange({ kind: 'none' });
    } else {
      s.onChange({ kind: 'box', region: { x: 0, y: 0, w: 1, h: 1 } });
    }
    s.onVibrate?.();
  };

  const onDoubleTap = (x: number, y: number) => {
    const s = stateRef.current;
    const zone = hitZone(s.sortedByArea, x, y);
    let rect: Rect;
    if (zone) {
      rect = inflateRect(zone, ZONE_INFLATE);
    } else {
      const nearest = snapToDetection(s.scaledDetections, x, y, SNAP_DIST);
      if (nearest) {
        rect = inflateRect(nearest, ZONE_INFLATE);
      } else {
        rect = inflateRect(
          { x1: x - DEFAULT_BOX / 2, y1: y - DEFAULT_BOX / 2, x2: x + DEFAULT_BOX / 2, y2: y + DEFAULT_BOX / 2 },
          ZONE_INFLATE
        );
      }
    }
    s.onChange({ kind: 'box', region: region(rect, s.size) });
    s.onVibrate?.();
  };

  const finishDraw = () => {
    const pts = drawPointsRef.current;
    drawPointsRef.current = [];
    setLivePath(null);
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    setIsDrawing(false);
    stateRef.current.onDrawingChange?.(false);
    if (pts.length < 2) return;

    const s = stateRef.current;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const p of pts) {
      x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y);
      x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y);
    }
    const inflated = inflateRect({ x1, y1, x2, y2 }, PATH_INFLATE);
    const clamped = {
      x1: Math.max(0, inflated.x1),
      y1: Math.max(0, inflated.y1),
      x2: Math.min(s.size.w, inflated.x2),
      y2: Math.min(s.size.h, inflated.y2),
    };
    const snapped = snapRect(clamped, s.scaledDetections, s.size.w, s.size.h);
    s.onChange({ kind: 'box', region: region(snapped, s.size) });
    s.onVibrate?.();
  };

  const backdrop = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        drawPointsRef.current = [{ x: locationX, y: locationY }];
        isDrawingRef.current = false;
        glowX.value = locationX;
        glowY.value = locationY;
        if (pendingTapRef.current) {
          clearTimeout(pendingTapRef.current);
          pendingTapRef.current = null;
          onDoubleTap(locationX, locationY);
        } else {
          pendingTapRef.current = setTimeout(() => {
            pendingTapRef.current = null;
            onTap(locationX, locationY);
          }, DOUBLE_TAP_MS);
        }
      },
      onPanResponderMove: (evt, g) => {
        if (Math.abs(g.dx) > DRAG_TOL || Math.abs(g.dy) > DRAG_TOL) {
          if (pendingTapRef.current) {
            clearTimeout(pendingTapRef.current);
            pendingTapRef.current = null;
          }
          if (!isDrawingRef.current) {
            isDrawingRef.current = true;
            setIsDrawing(true);
            stateRef.current.onDrawingChange?.(true);
          }
          const { locationX, locationY } = evt.nativeEvent;
          glowX.value = locationX;
          glowY.value = locationY;
          const pts = drawPointsRef.current;
          const last = pts[pts.length - 1];
          if (!last || Math.hypot(locationX - last.x, locationY - last.y) >= MIN_DRAW_DIST) {
            pts.push({ x: locationX, y: locationY });
            flushLivePath();
          }
        }
      },
      onPanResponderRelease: finishDraw,
      onPanResponderTerminate: finishDraw,
    })
  ).current;

  const resizeResponders = useRef<Record<string, ReturnType<typeof PanResponder.create>>>({});
  const getResizeResponder = (handle: string) => {
    if (!resizeResponders.current[handle]) {
      resizeResponders.current[handle] = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          stateRef.current.onVibrate?.();
          const base = getBaseRect();
          dragStartRectRef.current = base;
          latestDragRectRef.current = base;
          setIsDraggingHandle(true);
        },
        onPanResponderMove: (_evt, g) => {
          const dx = g.dx;
          const dy = g.dy;
          const base = dragStartRectRef.current;
          if (!base) return;
          const s = stateRef.current;
          let { x1, y1, x2, y2 } = base;
          if (handle === 'tl') { x1 = base.x1 + dx; y1 = base.y1 + dy; }
          if (handle === 'tr') { x2 = base.x2 + dx; y1 = base.y1 + dy; }
          if (handle === 'bl') { x1 = base.x1 + dx; y2 = base.y2 + dy; }
          if (handle === 'br') { x2 = base.x2 + dx; y2 = base.y2 + dy; }
          const minW = Math.min(MIN_BOX, base.x2 - base.x1);
          const minH = Math.min(MIN_BOX, base.y2 - base.y1);
          if (handle.includes('l')) x1 = Math.min(base.x2 - minW, x1);
          if (handle.includes('r')) x2 = Math.max(base.x1 + minW, x2);
          if (handle.includes('t')) y1 = Math.min(base.y2 - minH, y1);
          if (handle.includes('b')) y2 = Math.max(base.y1 + minH, y2);
          x1 = Math.max(0, Math.min(s.size.w, x1));
          y1 = Math.max(0, Math.min(s.size.h, y1));
          x2 = Math.max(0, Math.min(s.size.w, x2));
          y2 = Math.max(0, Math.min(s.size.h, y2));

          latestDragRectRef.current = { x1, y1, x2, y2 };

          //mutate shared values directly, no react render
          animRect.x1.value = x1;
          animRect.y1.value = y1;
          animRect.x2.value = x2;
          animRect.y2.value = y2;
        },
        onPanResponderRelease: () => {
          setIsDraggingHandle(false);
          const s = stateRef.current;
          const prev = latestDragRectRef.current;
          const final = prev ? snapRect(prev, s.scaledDetections, s.size.w, s.size.h) : null;
          if (final) s.onChange({ kind: 'box', region: region(final, s.size) });
        },
        onPanResponderTerminate: () => {
          setIsDraggingHandle(false);
          const s = stateRef.current;
          const prev = latestDragRectRef.current;
          if (prev) s.onChange({ kind: 'box', region: region(prev, s.size) });
        },
      });
    }
    return resizeResponders.current[handle];
  };

  const rect = selection.kind === 'box' ? px(selection.region, size) : null;
  const animRect = useReanimatedRect(rect, isDraggingHandle);

  const topDimStyle = useAnimatedStyle(() => ({ height: animRect.y1.value }));
  const bottomDimStyle = useAnimatedStyle(() => ({ top: animRect.y2.value }));
  const leftDimStyle = useAnimatedStyle(() => ({ top: animRect.y1.value, width: animRect.x1.value, height: animRect.y2.value - animRect.y1.value }));
  const rightDimStyle = useAnimatedStyle(() => ({ top: animRect.y1.value, left: animRect.x2.value, height: animRect.y2.value - animRect.y1.value }));
  const boxStyle = useAnimatedStyle(() => ({ left: animRect.x1.value, top: animRect.y1.value, width: animRect.x2.value - animRect.x1.value, height: animRect.y2.value - animRect.y1.value }));

  const handlesAnimated = [
    { id: 'tl', style: useAnimatedStyle(() => ({ left: animRect.x1.value - HANDLE_HIT / 2, top: animRect.y1.value - HANDLE_HIT / 2 })) },
    { id: 'tr', style: useAnimatedStyle(() => ({ left: animRect.x2.value - HANDLE_HIT / 2, top: animRect.y1.value - HANDLE_HIT / 2 })) },
    { id: 'bl', style: useAnimatedStyle(() => ({ left: animRect.x1.value - HANDLE_HIT / 2, top: animRect.y2.value - HANDLE_HIT / 2 })) },
    { id: 'br', style: useAnimatedStyle(() => ({ left: animRect.x2.value - HANDLE_HIT / 2, top: animRect.y2.value - HANDLE_HIT / 2 })) },
  ];

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {!isDrawing && DEV && scaledDetections.length > 0 && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {scaledDetections.map((d, i) => (
            <View
              key={i}
              style={[
                styles.devBox,
                { left: d.x1, top: d.y1, width: Math.max(0, d.x2 - d.x1), height: Math.max(0, d.y2 - d.y1) },
              ]}
            >
              <Text style={styles.devLabel} numberOfLines={1}>
                {d.label} {Math.round(d.confidence * 100)}%
              </Text>
            </View>
          ))}
        </View>
      )}

      {!isDrawing && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {selection.kind === 'box' && (rect || isDraggingHandle) && (
            <>
              <Animated.View style={[styles.dim, { top: 0, left: 0, right: 0 }, topDimStyle]} />
              <Animated.View style={[styles.dim, { left: 0, right: 0, bottom: 0 }, bottomDimStyle]} />
              <Animated.View style={[styles.dim, { left: 0 }, leftDimStyle]} />
              <Animated.View style={[styles.dim, { right: 0 }, rightDimStyle]} />
              <Animated.View style={[styles.box, boxStyle]} />
            </>
          )}
        </View>
      )}

      <View style={StyleSheet.absoluteFill} {...backdrop.panHandlers} />

      {isDrawing && (
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <RadialGradient id="fingerGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={Colors.primary} stopOpacity={0.55} />
              <Stop offset="100%" stopColor={Colors.primary} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          {livePath && livePath.length > 1 && (
            <Path
              d={smoothPathD(livePath)}
              stroke={Colors.selectionOutline}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          )}
          <AnimatedCircle r={GLOW_RADIUS} fill="url(#fingerGlow)" animatedProps={glowAnimatedProps} />
        </Svg>
      )}

      {!isDrawing && (rect || isDraggingHandle) &&
        handlesAnimated.map(h => (
          <Animated.View
            key={h.id}
            style={[styles.handleHit, h.style]}
            {...getResizeResponder(h.id).panHandlers}
          >
            <View style={styles.handleDot} />
          </Animated.View>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  dim: {
    position: 'absolute',
    backgroundColor: Colors.selectionDim,
  },
  box: {
    position: 'absolute',
    backgroundColor: Colors.selectionFill,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: Colors.selectionOutline,
    borderRadius: Radius.xxl,
  },
  handleHit: {
    position: 'absolute',
    width: HANDLE_HIT,
    height: HANDLE_HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleDot: {
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: Radius.xs,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  devBox: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: Colors.selectionOutline,
    backgroundColor: Colors.selectionFill,
  },
  devLabel: {
    color: Colors.selectionOutline,
    fontSize: FontSizes.label,
    fontFamily: Fonts.mono,
    backgroundColor: Colors.responseSurface,
    overflow: 'hidden',
  },
});
