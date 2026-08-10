import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import Animated, { Easing, SharedValue, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { Colors, Radius } from '../../../constants/theme';
import { FULL_SCREEN, isFullScreen, Selection, SelectionRegion } from '../../services/overlay/useScreenSelection';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const DOUBLE_TAP_MS = 220;
const DRAG_TOL = 10;
const HANDLE_HIT = 32;
const HANDLE_SIZE = 22;
const MIN_BOX = 40;
const DEFAULT_BOX = 120;
const MIN_DRAW_DIST = 4;
const PATH_INFLATE = 1.15;
//edge distance for element snap
const SNAP_DIST = 24;
//beyond this the finger misses
const NEAR_DIST = 120;
//lasso coverage counts as picked
const ENCLOSED_MIN = 0.6;
//padding around detected elements
const DETECTION_INFLATE = 1.2;
const STROKE_WIDTH = 7;
const GLOW_RADIUS = 55;
const SETTLE_MS = 300;

type Point = { x: number; y: number };
type Size = { w: number; h: number };
type Rect = { x1: number; y1: number; x2: number; y2: number };
type Corner = 'tl' | 'tr' | 'bl' | 'br';

const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];

type Props = {
  selection: Selection;
  onChange: (selection: Selection) => void;
  onVibrate?: () => void;
  onDrawingChange?: (drawing: boolean) => void;
  //capture elements aim selection
  detections?: SelectionRegion[];
};

//quadratic midpoints smooth stroke
function smoothPath(points: Point[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const { x, y } = points[i];
    const next = points[i + 1];
    d += ` Q ${x} ${y} ${(x + next.x) / 2} ${(y + next.y) / 2}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

function boundsOf(points: Point[]): Rect {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of points) {
    if (p.x < x1) x1 = p.x;
    if (p.y < y1) y1 = p.y;
    if (p.x > x2) x2 = p.x;
    if (p.y > y2) y2 = p.y;
  }
  return { x1, y1, x2, y2 };
}

function inflate(rect: Rect, factor: number): Rect {
  const growX = ((rect.x2 - rect.x1) * (factor - 1)) / 2;
  const growY = ((rect.y2 - rect.y1) * (factor - 1)) / 2;
  return { x1: rect.x1 - growX, y1: rect.y1 - growY, x2: rect.x2 + growX, y2: rect.y2 + growY };
}

function clampRect(rect: Rect, size: Size): Rect {
  return {
    x1: Math.max(0, Math.min(size.w, rect.x1)),
    y1: Math.max(0, Math.min(size.h, rect.y1)),
    x2: Math.max(0, Math.min(size.w, rect.x2)),
    y2: Math.max(0, Math.min(size.h, rect.y2)),
  };
}

function toPixels(region: SelectionRegion, size: Size): Rect {
  return {
    x1: region.x * size.w,
    y1: region.y * size.h,
    x2: (region.x + region.w) * size.w,
    y2: (region.y + region.h) * size.h,
  };
}

const areaOf = (rect: Rect) => (rect.x2 - rect.x1) * (rect.y2 - rect.y1);

//closest element under finger
function pickAt(rects: Rect[], x: number, y: number): Rect | null {
  let inside: Rect | null = null;
  let nearest: Rect | null = null;
  let nearestGap = NEAR_DIST;

  for (const rect of rects) {
    if (x >= rect.x1 && x <= rect.x2 && y >= rect.y1 && y <= rect.y2) {
      //tightest overlap wins
      if (!inside || areaOf(rect) < areaOf(inside)) inside = rect;
      continue;
    }
    const gap = Math.hypot(
      Math.max(rect.x1 - x, 0, x - rect.x2),
      Math.max(rect.y1 - y, 0, y - rect.y2)
    );
    if (gap < nearestGap) {
      nearestGap = gap;
      nearest = rect;
    }
  }

  return inside ?? nearest;
}

//stroke loop merged into region
function enclosed(rects: Rect[], bounds: Rect): Rect | null {
  let union: Rect | null = null;

  for (const rect of rects) {
    const width = Math.min(rect.x2, bounds.x2) - Math.max(rect.x1, bounds.x1);
    const height = Math.min(rect.y2, bounds.y2) - Math.max(rect.y1, bounds.y1);
    if (width <= 0 || height <= 0) continue;
    //grazed neighbour not the target
    if ((width * height) / areaOf(rect) < ENCLOSED_MIN) continue;

    union = union ? {
      x1: Math.min(union.x1, rect.x1),
      y1: Math.min(union.y1, rect.y1),
      x2: Math.max(union.x2, rect.x2),
      y2: Math.max(union.y2, rect.y2),
    } : rect;
  }

  return union;
}

//edges snap to nearest element
function snap(rect: Rect, rects: Rect[]): Rect {
  if (rects.length === 0) return rect;

  const xs: number[] = [];
  const ys: number[] = [];
  for (const target of rects) {
    xs.push(target.x1, target.x2);
    ys.push(target.y1, target.y2);
  }

  const pull = (value: number, candidates: number[]) => {
    let best = value;
    let bestGap = SNAP_DIST;
    for (const candidate of candidates) {
      const gap = Math.abs(candidate - value);
      if (gap < bestGap) {
        bestGap = gap;
        best = candidate;
      }
    }
    return best;
  };

  return {
    x1: pull(rect.x1, xs),
    y1: pull(rect.y1, ys),
    x2: pull(rect.x2, xs),
    y2: pull(rect.y2, ys),
  };
}

function toRegion(rect: Rect, size: Size): SelectionRegion {
  const { x1, y1, x2, y2 } = clampRect(rect, size);
  const x = x1 / size.w;
  const y = y1 / size.h;
  return { x, y, w: Math.max(0.02, x2 / size.w - x), h: Math.max(0.02, y2 / size.h - y) };
}

export default function SelectionLayer({ selection, onChange, onVibrate, onDrawingChange, detections }: Props) {
  const [size, setSize] = useState<Size>({ w: 1, h: 1 });
  const [resizing, setResizing] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [strokePoints, setStrokePoints] = useState<Point[] | null>(null);

  //detections mapped to pixels
  //air around elements reads better
  const rects = useMemo(
    () => (detections ?? []).map(region => inflate(toPixels(region, size), DETECTION_INFLATE)),
    [detections, size]
  );

  //handlers read through mirror
  const latest = useRef({ size, selection, onChange, onVibrate, onDrawingChange, rects });
  useEffect(() => {
    latest.current = { size, selection, onChange, onVibrate, onDrawingChange, rects };
  }, [size, selection, onChange, onVibrate, onDrawingChange, rects]);

  //resize writes to ui rect
  const x1 = useSharedValue(0);
  const y1 = useSharedValue(0);
  const x2 = useSharedValue(0);
  const y2 = useSharedValue(0);
  //glow follows the finger without re-rendering
  const glowX = useSharedValue(0);
  const glowY = useSharedValue(0);

  const target = selection.kind === 'box' ? toPixels(selection.region, size) : null;
  const hadTarget = useRef(false);
  useEffect(() => {
    if (!target) {
      hadTarget.current = false;
      return;
    }
    //jump first, ease later
    const settle = { duration: SETTLE_MS, easing: Easing.out(Easing.cubic) };
    const apply = (value: SharedValue<number>, to: number) => {
      value.value = hadTarget.current && !resizing ? withTiming(to, settle) : to;
    };
    apply(x1, target.x1);
    apply(y1, target.y1);
    apply(x2, target.x2);
    apply(y2, target.y2);
    hadTarget.current = true;
  }, [target?.x1, target?.y1, target?.x2, target?.y2, resizing]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (rect: Rect) => {
    const state = latest.current;
    state.onChange({ kind: 'box', region: toRegion(rect, state.size) });
    state.onVibrate?.();
  };

  //single tap toggles the whole screen
  const onTap = () => {
    const state = latest.current;
    const isFull = state.selection.kind === 'box' && isFullScreen(state.selection.region);
    state.onChange(isFull ? { kind: 'none' } : { kind: 'box', region: FULL_SCREEN });
    state.onVibrate?.();
  };

  //double tap grabs element
  const onDoubleTap = (x: number, y: number) => {
    const hit = pickAt(latest.current.rects, x, y);
    commit(hit ?? {
      x1: x - DEFAULT_BOX / 2,
      y1: y - DEFAULT_BOX / 2,
      x2: x + DEFAULT_BOX / 2,
      y2: y + DEFAULT_BOX / 2,
    });
  };

  const strokeRef = useRef<Point[]>([]);
  const drawingRef = useRef(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const strokeFlushPending = useRef(false);

  //repaint stroke once per frame
  const flushStroke = () => {
    if (strokeFlushPending.current) return;
    strokeFlushPending.current = true;
    requestAnimationFrame(() => {
      strokeFlushPending.current = false;
      setStrokePoints([...strokeRef.current]);
    });
  };

  const finishStroke = () => {
    const points = strokeRef.current;
    strokeRef.current = [];
    setStrokePoints(null);
    if (!drawingRef.current) return;
    drawingRef.current = false;
    setDrawing(false);
    latest.current.onDrawingChange?.(false);
    if (points.length < 2) return;

    const state = latest.current;
    const bounds = boundsOf(points);
    //closed stroke lands on element
    const hit = enclosed(state.rects, bounds);
    commit(clampRect(hit ?? snap(inflate(bounds, PATH_INFLATE), state.rects), state.size));
  };

  //handlers need the live gesture state, so they close over the refs
  const backdrop = useMemo(() =>
    // eslint-disable-next-line react-hooks/refs
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: evt => {
        const { locationX, locationY } = evt.nativeEvent;
        strokeRef.current = [{ x: locationX, y: locationY }];
        drawingRef.current = false;
        glowX.value = locationX;
        glowY.value = locationY;
        //second touch within window taps
        if (tapTimer.current) {
          clearTimeout(tapTimer.current);
          tapTimer.current = null;
          onDoubleTap(locationX, locationY);
          return;
        }
        tapTimer.current = setTimeout(() => {
          tapTimer.current = null;
          onTap();
        }, DOUBLE_TAP_MS);
      },
      onPanResponderMove: (evt, gesture) => {
        if (Math.abs(gesture.dx) <= DRAG_TOL && Math.abs(gesture.dy) <= DRAG_TOL) return;
        if (tapTimer.current) {
          clearTimeout(tapTimer.current);
          tapTimer.current = null;
        }
        if (!drawingRef.current) {
          drawingRef.current = true;
          setDrawing(true);
          latest.current.onDrawingChange?.(true);
        }
        const { locationX, locationY } = evt.nativeEvent;
        glowX.value = locationX;
        glowY.value = locationY;
        const points = strokeRef.current;
        const last = points[points.length - 1];
        //drop points too close to matter
        if (last && Math.hypot(locationX - last.x, locationY - last.y) < MIN_DRAW_DIST) return;
        points.push({ x: locationX, y: locationY });
        flushStroke();
      },
      onPanResponderRelease: finishStroke,
      onPanResponderTerminate: finishStroke,
    })
    //gestures read latest mirror
    // eslint-disable-next-line react-hooks/exhaustive-deps
  , []);

  const dragStart = useRef<Rect | null>(null);
  const dragCurrent = useRef<Rect | null>(null);

  const finishResize = (corner: Corner) => {
    setResizing(false);
    const state = latest.current;
    const rect = dragCurrent.current;
    if (!rect) return;

    //only moved corner snaps
    const pulled = snap(rect, state.rects);
    const settled = {
      x1: corner[1] === 'l' ? pulled.x1 : rect.x1,
      y1: corner[0] === 't' ? pulled.y1 : rect.y1,
      x2: corner[1] === 'r' ? pulled.x2 : rect.x2,
      y2: corner[0] === 'b' ? pulled.y2 : rect.y2,
    };
    state.onChange({ kind: 'box', region: toRegion(settled, state.size) });
  };

  const makeCornerResponder = (corner: Corner) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const state = latest.current;
        const base = state.selection.kind === 'box'
          ? toPixels(state.selection.region, state.size)
          : { x1: 0, y1: 0, x2: state.size.w, y2: state.size.h };
        dragStart.current = base;
        dragCurrent.current = base;
        setResizing(true);
        state.onVibrate?.();
      },
      onPanResponderMove: (_evt, gesture) => {
        const base = dragStart.current;
        if (!base) return;
        const state = latest.current;

        //corner never crosses opposite edge
        const minW = Math.min(MIN_BOX, base.x2 - base.x1);
        const minH = Math.min(MIN_BOX, base.y2 - base.y1);
        const moved = {
          x1: corner[1] === 'l' ? Math.min(base.x2 - minW, base.x1 + gesture.dx) : base.x1,
          y1: corner[0] === 't' ? Math.min(base.y2 - minH, base.y1 + gesture.dy) : base.y1,
          x2: corner[1] === 'r' ? Math.max(base.x1 + minW, base.x2 + gesture.dx) : base.x2,
          y2: corner[0] === 'b' ? Math.max(base.y1 + minH, base.y2 + gesture.dy) : base.y2,
        };
        const rect = clampRect(moved, state.size);
        dragCurrent.current = rect;

        //write to ui thread directly
        x1.value = rect.x1;
        y1.value = rect.y1;
        x2.value = rect.x2;
        y2.value = rect.y2;
      },
      onPanResponderRelease: () => finishResize(corner),
      onPanResponderTerminate: () => finishResize(corner),
    });

  const cornerResponders = useMemo(
    // eslint-disable-next-line react-hooks/refs
    () => ({ tl: makeCornerResponder('tl'), tr: makeCornerResponder('tr'), bl: makeCornerResponder('bl'), br: makeCornerResponder('br') }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const topDim = useAnimatedStyle(() => ({ height: y1.value }));
  const bottomDim = useAnimatedStyle(() => ({ top: y2.value }));
  const leftDim = useAnimatedStyle(() => ({ top: y1.value, width: x1.value, height: y2.value - y1.value }));
  const rightDim = useAnimatedStyle(() => ({ top: y1.value, left: x2.value, height: y2.value - y1.value }));
  const boxStyle = useAnimatedStyle(() => ({ left: x1.value, top: y1.value, width: x2.value - x1.value, height: y2.value - y1.value }));
  const glowProps = useAnimatedProps(() => ({ cx: glowX.value, cy: glowY.value }));

  const cornerStyles = {
    tl: useAnimatedStyle(() => ({ left: x1.value - HANDLE_HIT / 2, top: y1.value - HANDLE_HIT / 2 })),
    tr: useAnimatedStyle(() => ({ left: x2.value - HANDLE_HIT / 2, top: y1.value - HANDLE_HIT / 2 })),
    bl: useAnimatedStyle(() => ({ left: x1.value - HANDLE_HIT / 2, top: y2.value - HANDLE_HIT / 2 })),
    br: useAnimatedStyle(() => ({ left: x2.value - HANDLE_HIT / 2, top: y2.value - HANDLE_HIT / 2 })),
  };

  const showBox = !drawing && (target != null || resizing);

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={e => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {showBox && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Animated.View style={[styles.dim, { top: 0, left: 0, right: 0 }, topDim]} />
          <Animated.View style={[styles.dim, { left: 0, right: 0, bottom: 0 }, bottomDim]} />
          <Animated.View style={[styles.dim, { left: 0 }, leftDim]} />
          <Animated.View style={[styles.dim, { right: 0 }, rightDim]} />
          <Animated.View style={[styles.box, boxStyle]} />
        </View>
      )}

      <View style={StyleSheet.absoluteFill} {...backdrop.panHandlers} />

      {drawing && (
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <RadialGradient id="fingerGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={Colors.primary} stopOpacity={0.55} />
              <Stop offset="100%" stopColor={Colors.primary} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          {strokePoints && strokePoints.length > 1 && (
            <Path
              d={smoothPath(strokePoints)}
              stroke={Colors.selectionOutline}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          )}
          <AnimatedCircle r={GLOW_RADIUS} fill="url(#fingerGlow)" animatedProps={glowProps} />
        </Svg>
      )}

      {showBox && CORNERS.map(corner => (
        <Animated.View
          key={corner}
          style={[styles.handleHit, cornerStyles[corner]]}
          {...cornerResponders[corner].panHandlers}
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
});
