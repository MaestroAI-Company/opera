import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Colors, Radius } from '../../../constants/theme';
import { FULL_SCREEN, Selection, SelectionRegion } from '../../services/overlay/useScreenSelection';

const AnimatedPath = Animated.createAnimatedComponent(Path);

const DOUBLE_TAP_MS = 220;
const DRAG_TOL = 10;
const HANDLE_HIT = 56;
//half the handle hit box, used to test proximity to a corner
const CORNER_HIT = HANDLE_HIT / 2;
//length of each angle arm
const HANDLE_ARM = 26;
const HANDLE_STROKE = 6;
const MIN_BOX = 70;
const MIN_DRAW_DIST = 4;
const PATH_INFLATE = 1.15;
//edge distance for element snap
const SNAP_DIST = 24;
//lasso pulls from further out
const LASSO_SNAP_DIST = 48;
//lasso coverage counts as picked
const ENCLOSED_MIN = 0.45;
  //scribble overlap picks element
const MAGNET_MIN = 0.55;
//padding around detected elements
const DETECTION_INFLATE = 1.2;
const STROKE_WIDTH = 7;
const SETTLE_MS = 300;

type Point = { x: number; y: number };
type Size = { w: number; h: number };
type Rect = { x1: number; y1: number; x2: number; y2: number };
type Corner = 'tl' | 'tr' | 'bl' | 'br';

const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];

//L-shaped angle hugging the box corner, arms along its edges
function anglePath(corner: Corner): string {
  const c = HANDLE_HIT / 2;
  const dx = corner[1] === 'l' ? 1 : -1;
  const dy = corner[0] === 't' ? 1 : -1;
  const r = Radius.xxl;
  return `M ${c} ${c + dy * HANDLE_ARM} L ${c} ${c + dy * r} Q ${c} ${c} ${c + dx * r} ${c} L ${c + dx * HANDLE_ARM} ${c}`;
}

type Props = {
  selection: Selection;
  onChange: (selection: Selection) => void;
  onVibrate?: () => void;
  onDrawingChange?: (drawing: boolean) => void;
  //single tap leaves the overlay
  onDismiss?: () => void;
  //capture elements aim selection
  detections?: SelectionRegion[];
  //paint what selection snaps to
  showDetections?: boolean;
};

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

//scribble inside an element picks it
function magnet(rects: Rect[], bounds: Rect): Rect | null {
  const area = areaOf(bounds);
  if (area <= 0) return null;

  let best: Rect | null = null;
  let bestScore = MAGNET_MIN;

  for (const rect of rects) {
    const width = Math.min(rect.x2, bounds.x2) - Math.max(rect.x1, bounds.x1);
    const height = Math.min(rect.y2, bounds.y2) - Math.max(rect.y1, bounds.y1);
    if (width <= 0 || height <= 0) continue;
    const score = (width * height) / area;
    if (score > bestScore) {
      bestScore = score;
      best = rect;
    }
  }

  return best;
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
function snap(rect: Rect, rects: Rect[], tolerance: number = SNAP_DIST): Rect {
  if (rects.length === 0) return rect;

  const xs: number[] = [];
  const ys: number[] = [];
  for (const target of rects) {
    xs.push(target.x1, target.x2);
    ys.push(target.y1, target.y2);
  }

  const pull = (value: number, candidates: number[]) => {
    let best = value;
    let bestGap = tolerance;
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

//closest corner of rect to a point, within the handle's hit zone
function nearestCorner(rect: Rect, x: number, y: number): Corner | null {
  const anchors: [Corner, Point][] = [
    ['tl', { x: rect.x1, y: rect.y1 }],
    ['tr', { x: rect.x2, y: rect.y1 }],
    ['bl', { x: rect.x1, y: rect.y2 }],
    ['br', { x: rect.x2, y: rect.y2 }],
  ];

  let best: Corner | null = null;
  let bestDist = CORNER_HIT;
  for (const [corner, p] of anchors) {
    const dist = Math.max(Math.abs(x - p.x), Math.abs(y - p.y));
    if (dist < bestDist) {
      bestDist = dist;
      best = corner;
    }
  }
  return best;
}

function toRegion(rect: Rect, size: Size): SelectionRegion {
  const { x1, y1, x2, y2 } = clampRect(rect, size);
  const x = x1 / size.w;
  const y = y1 / size.h;
  return { x, y, w: Math.max(0.02, x2 / size.w - x), h: Math.max(0.02, y2 / size.h - y) };
}

export default function SelectionLayer({ selection, onChange, onVibrate, onDrawingChange, onDismiss, detections, showDetections }: Props) {
  const [size, setSize] = useState<Size>({ w: 1, h: 1 });
  const [resizing, setResizing] = useState(false);
  const [drawing, setDrawing] = useState(false);

  //detections mapped to pixels
  //air around elements reads better
  const rects = useMemo(
    () => (detections ?? []).map(region => inflate(toPixels(region, size), DETECTION_INFLATE)),
    [detections, size]
  );

  //handlers read through mirror
  const latest = useRef({ size, selection, onChange, onVibrate, onDrawingChange, onDismiss, rects });
  useEffect(() => {
    latest.current = { size, selection, onChange, onVibrate, onDrawingChange, onDismiss, rects };
  }, [size, selection, onChange, onVibrate, onDrawingChange, onDismiss, rects]);

  //resize writes to ui rect
  const x1 = useSharedValue(0);
  const y1 = useSharedValue(0);
  const x2 = useSharedValue(0);
  const y2 = useSharedValue(0);
  //pops in when a selection appears, instead of sliding from the old one
  const boxScale = useSharedValue(1);
  //stroke path also writes straight to ui thread
  const strokeD = useSharedValue('');

  const target = selection.kind === 'box' ? toPixels(selection.region, size) : null;
  const hadTarget = useRef(false);
  //rect already placed, skip the pop
  const skipPop = useRef(false);
  useEffect(() => {
    if (!target) {
      hadTarget.current = false;
      return;
    }
    x1.value = target.x1;
    y1.value = target.y1;
    x2.value = target.x2;
    y2.value = target.y2;
    if (!resizing && !skipPop.current) {
      boxScale.value = 0.6;
      boxScale.value = withTiming(1, { duration: SETTLE_MS, easing: Easing.out(Easing.cubic) });
    }
    skipPop.current = false;
    hadTarget.current = true;
  }, [target?.x1, target?.y1, target?.x2, target?.y2, resizing]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (rect: Rect) => {
    const state = latest.current;
    const region = toRegion(rect, state.size);
    const next = toPixels(region, state.size);
    const prev = state.selection.kind === 'box' ? toPixels(state.selection.region, state.size) : null;
    //place box before remount
    if (!prev || prev.x1 !== next.x1 || prev.y1 !== next.y1 || prev.x2 !== next.x2 || prev.y2 !== next.y2) {
      x1.value = next.x1;
      y1.value = next.y1;
      x2.value = next.x2;
      y2.value = next.y2;
      boxScale.value = 0.6;
      boxScale.value = withTiming(1, { duration: SETTLE_MS, easing: Easing.out(Easing.cubic) });
      skipPop.current = true;
    }
    state.onChange({ kind: 'box', region });
    state.onVibrate?.();
  };

  //single tap leaves the overlay
  const onTap = () => {
    latest.current.onDismiss?.();
  };

  //double tap grabs the whole screen
  const onDoubleTap = () => {
    const state = latest.current;
    state.onChange({ kind: 'box', region: FULL_SCREEN });
    state.onVibrate?.();
  };

  const strokeRef = useRef<Point[]>([]);
  const drawingRef = useRef(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  //committed Q segments, plus the point still waiting for its pair
  const committedPath = useRef('');
  const pendingPoint = useRef<Point | null>(null);

  //page offset for stroke coordinates
  const pageOffset = useRef<Point>({ x: 0, y: 0 });

  const finishStroke = () => {
    const points = strokeRef.current;
    strokeRef.current = [];
    committedPath.current = '';
    pendingPoint.current = null;
    if (!drawingRef.current) return;
    drawingRef.current = false;
    setDrawing(false);
    latest.current.onDrawingChange?.(false);
    if (points.length < 2) return;

    const state = latest.current;
    const bounds = boundsOf(points);
    //closed stroke or scribble picks element
    const hit = enclosed(state.rects, bounds) ?? magnet(state.rects, bounds);
    commit(clampRect(hit ?? snap(inflate(bounds, PATH_INFLATE), state.rects, LASSO_SNAP_DIST), state.size));
  };

  const dragStart = useRef<Rect | null>(null);
  const dragCurrent = useRef<Rect | null>(null);
  //which corner the active touch is resizing, if any
  const resizeCorner = useRef<Corner | null>(null);

  //active handle grows while dragged
  const handleScales = {
    tl: useSharedValue(1),
    tr: useSharedValue(1),
    bl: useSharedValue(1),
    br: useSharedValue(1),
  };

  const finishResize = (corner: Corner) => {
    setResizing(false);
    skipPop.current = true;
    handleScales[corner].value = withTiming(1, { duration: 150 });
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

  //single full-screen responder: decides at touch-down whether it's a corner
  //resize or a fresh draw, instead of overlapping sibling views fighting for the touch
  const backdrop = useMemo(() =>
    // eslint-disable-next-line react-hooks/refs
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt, gesture) => {
        const { locationX, locationY } = evt.nativeEvent;
        //page coords stay valid over child views
        pageOffset.current = { x: gesture.x0 - locationX, y: gesture.y0 - locationY };

        const state = latest.current;
        const box = state.selection.kind === 'box' ? toPixels(state.selection.region, state.size) : null;
        const corner = box ? nearestCorner(box, locationX, locationY) : null;

        //touch near an existing corner resizes it, everything else draws fresh
        if (corner) {
          resizeCorner.current = corner;
          dragStart.current = box;
          dragCurrent.current = box;
          setResizing(true);
          handleScales[corner].value = withTiming(1.2, { duration: 150 });
          state.onVibrate?.();
          return;
        }
        resizeCorner.current = null;

        strokeRef.current = [{ x: locationX, y: locationY }];
        committedPath.current = `M ${locationX} ${locationY}`;
        pendingPoint.current = null;
        strokeD.value = '';
        drawingRef.current = false;
        //second touch within window taps
        if (tapTimer.current) {
          clearTimeout(tapTimer.current);
          tapTimer.current = null;
          onDoubleTap();
          return;
        }
        tapTimer.current = setTimeout(() => {
          tapTimer.current = null;
          onTap();
        }, DOUBLE_TAP_MS);
      },
      onPanResponderMove: (_evt, gesture) => {
        if (resizeCorner.current) {
          const corner = resizeCorner.current;
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
          return;
        }

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
        const locationX = gesture.moveX - pageOffset.current.x;
        const locationY = gesture.moveY - pageOffset.current.y;
        const points = strokeRef.current;
        const last = points[points.length - 1];
        //drop points too close to matter
        if (last && Math.hypot(locationX - last.x, locationY - last.y) < MIN_DRAW_DIST) return;
        points.push({ x: locationX, y: locationY });
        //extend path by one point without rebuilding it
        if (pendingPoint.current) {
          const prev = pendingPoint.current;
          committedPath.current += ` Q ${prev.x} ${prev.y} ${(prev.x + locationX) / 2} ${(prev.y + locationY) / 2}`;
        }
        pendingPoint.current = { x: locationX, y: locationY };
        strokeD.value = `${committedPath.current} L ${locationX} ${locationY}`;
      },
      onPanResponderRelease: () => {
        if (resizeCorner.current) {
          const corner = resizeCorner.current;
          resizeCorner.current = null;
          finishResize(corner);
          return;
        }
        strokeD.value = '';
        finishStroke();
      },
      onPanResponderTerminate: () => {
        if (resizeCorner.current) {
          const corner = resizeCorner.current;
          resizeCorner.current = null;
          finishResize(corner);
          return;
        }
        strokeD.value = '';
        finishStroke();
      },
    })
    //gestures read latest mirror
    // eslint-disable-next-line react-hooks/exhaustive-deps
    , []);

  //single source of truth for the pop, computed once per frame and reused everywhere below
  const bounds = useDerivedValue(() => {
    const cx = (x1.value + x2.value) / 2;
    const cy = (y1.value + y2.value) / 2;
    const w = (x2.value - x1.value) * boxScale.value;
    const h = (y2.value - y1.value) * boxScale.value;
    return { x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2 };
  });
  //plain rectangles around the selection, cheap to animate every frame
  const topDim = useAnimatedStyle(() => ({ height: bounds.value.y1 }));
  const bottomDim = useAnimatedStyle(() => ({ top: bounds.value.y2 }));
  const leftDim = useAnimatedStyle(() => ({ top: bounds.value.y1, width: bounds.value.x1, height: bounds.value.y2 - bounds.value.y1 }));
  const rightDim = useAnimatedStyle(() => ({ top: bounds.value.y1, left: bounds.value.x2, height: bounds.value.y2 - bounds.value.y1 }));
  //frame and handles positioned from the same bounds as the mask's hole
  const groupStyle = useAnimatedStyle(() => ({
    left: bounds.value.x1,
    top: bounds.value.y1,
    width: bounds.value.x2 - bounds.value.x1,
    height: bounds.value.y2 - bounds.value.y1,
  }));
  const strokePathProps = useAnimatedProps(() => ({ d: strokeD.value }));

  //positions relative to the group, so they always sit right on its corners
  const cornerStyles = {
    tl: useAnimatedStyle(() => ({ left: -HANDLE_HIT / 2, top: -HANDLE_HIT / 2, transform: [{ scale: handleScales.tl.value }] })),
    tr: useAnimatedStyle(() => ({ left: bounds.value.x2 - bounds.value.x1 - HANDLE_HIT / 2, top: -HANDLE_HIT / 2, transform: [{ scale: handleScales.tr.value }] })),
    bl: useAnimatedStyle(() => ({ left: -HANDLE_HIT / 2, top: bounds.value.y2 - bounds.value.y1 - HANDLE_HIT / 2, transform: [{ scale: handleScales.bl.value }] })),
    br: useAnimatedStyle(() => ({ left: bounds.value.x2 - bounds.value.x1 - HANDLE_HIT / 2, top: bounds.value.y2 - bounds.value.y1 - HANDLE_HIT / 2, transform: [{ scale: handleScales.br.value }] })),
  };

  const showBox = !drawing && (target != null || resizing);

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={e => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {/* hidden keeps animated styles alive */}
      <View style={[StyleSheet.absoluteFill, !showBox && styles.hidden]} pointerEvents="none">
        <Animated.View style={[styles.dim, { top: 0, left: 0, right: 0 }, topDim]} />
        <Animated.View style={[styles.dim, { left: 0, right: 0, bottom: 0 }, bottomDim]} />
        <Animated.View style={[styles.dim, { left: 0 }, leftDim]} />
        <Animated.View style={[styles.dim, { right: 0 }, rightDim]} />
      </View>

      <Animated.View style={[styles.group, groupStyle, !showBox && styles.hidden]} pointerEvents="none">
        <View style={styles.box} pointerEvents="none" />
        {CORNERS.map(corner => (
          <Animated.View
            key={corner}
            style={[styles.handleHit, cornerStyles[corner]]}
            pointerEvents="none"
          >
            <Svg width={HANDLE_HIT} height={HANDLE_HIT}>
              <Path
                d={anglePath(corner)}
                stroke={Colors.selectionOutline}
                strokeWidth={HANDLE_STROKE}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
          </Animated.View>
        ))}
      </Animated.View>

      <Svg style={[StyleSheet.absoluteFill, !drawing && styles.hidden]} pointerEvents="none">
        <AnimatedPath
          animatedProps={strokePathProps}
          stroke={Colors.selectionOutline}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>

      {showDetections && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {rects.map((rect, i) => (
            <View
              key={i}
              style={[styles.debugRect, {
                left: rect.x1,
                top: rect.y1,
                width: rect.x2 - rect.x1,
                height: rect.y2 - rect.y1,
              }]}
            />
          ))}
        </View>
      )}

      {/* topmost so a touch starting over the box still draws, box and handles are only painted */}
      <View style={StyleSheet.absoluteFill} {...backdrop.panHandlers} />
    </View>
  );
}

const styles = StyleSheet.create({
  dim: {
    position: 'absolute',
    backgroundColor: Colors.selectionDim,
  },
  group: {
    position: 'absolute',
  },
  hidden: {
    display: 'none',
  },
  box: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.selectionFill,
    borderColor: Colors.selectionOutline,
    borderRadius: Radius.xxl,
    boxShadow: `0px 0px 54px ${Colors.primary}`,
  },
  debugRect: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  handleHit: {
    position: 'absolute',
    width: HANDLE_HIT,
    height: HANDLE_HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
