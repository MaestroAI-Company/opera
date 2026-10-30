import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Colors, Radius } from '../../../constants/theme';
import { useAnimatedValue } from '../../hooks/useAnimatedValue';
import { DesktopDetector } from '../../services/overlay/desktopDetector';
import type { CaptureRegion } from '../../services/overlay/screenCapture';
import { DB } from '../../services/db/DatabaseService';
import { pickRegion, Rect, union } from '../../services/overlay/selectionPick';
import { Settings } from '../../services/settings/SettingsService';

//thinner and fainter than android
const HALO_SIZE = 56;
const HALO_PEAK = 0.5;
const DRAG_TOL = 6;
const MIN_BOX = 12;
const FRAME_PAD = 4;

const toPixels = (box: CaptureRegion): Rect => ({
  x1: box.x * window.innerWidth,
  y1: box.y * window.innerHeight,
  x2: (box.x + box.w) * window.innerWidth,
  y2: (box.y + box.h) * window.innerHeight,
});

//smallest element under the cursor
function hit(rects: Rect[], x: number, y: number): Rect | null {
  let best: Rect | null = null;
  for (const r of rects) {
    if (x < r.x1 || x > r.x2 || y < r.y1 || y > r.y2) continue;
    if (!best || (r.x2 - r.x1) * (r.y2 - r.y1) < (best.x2 - best.x1) * (best.y2 - best.y1)) best = r;
  }
  return best;
}

//click through layer under the bar
export default function DesktopStage() {
  const haloOpacity = useAnimatedValue(0);
  const boxesOpacity = useAnimatedValue(0);
  const dimOpacity = useAnimatedValue(0);
  const frameOpacity = useAnimatedValue(0);
  const frameX = useAnimatedValue(0);
  const frameY = useAnimatedValue(0);
  const frameW = useAnimatedValue(0);
  const frameH = useAnimatedValue(0);
  const [boxes, setBoxes] = useState<CaptureRegion[]>([]);
  const [showBoxes, setShowBoxes] = useState(false);
  const [selecting, setSelecting] = useState(false);
  //drag box like windows desktop
  const [marquee, setMarquee] = useState<Rect | null>(null);
  //late results of a closed session dropped
  const sessionRef = useRef(0);
  const rectsRef = useRef<Rect[]>([]);
  const frameRef = useRef<Rect | null>(null);
  const pickedRef = useRef<Rect | null>(null);
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    Promise.all([DB.init(), Settings.init()]).catch(() => { });
  }, []);

  useEffect(() => {
    rectsRef.current = boxes.map(toPixels);
  }, [boxes]);

  //glides between elements without bounce
  const moveFrame = useCallback((rect: Rect | null, instant = false) => {
    frameRef.current = rect;
    Animated.timing(frameOpacity, { toValue: rect ? 1 : 0, duration: 140, useNativeDriver: false }).start();
    if (!rect) return;
    const target = [
      [frameX, rect.x1 - FRAME_PAD],
      [frameY, rect.y1 - FRAME_PAD],
      [frameW, rect.x2 - rect.x1 + FRAME_PAD * 2],
      [frameH, rect.y2 - rect.y1 + FRAME_PAD * 2],
    ] as const;
    for (const [value, to] of target) {
      if (instant) value.setValue(to);
      else Animated.spring(value, { toValue: to, useNativeDriver: false, bounciness: 0, speed: 22 }).start();
    }
  }, [frameOpacity, frameX, frameY, frameW, frameH]);

  useEffect(() => {
    const shown = listen('stage-shown', () => {
      sessionRef.current++;
      setBoxes([]);
      boxesOpacity.setValue(0);
      haloOpacity.setValue(0);
      Animated.sequence([
        Animated.timing(haloOpacity, { toValue: HALO_PEAK, duration: 320, useNativeDriver: true }),
        Animated.timing(haloOpacity, { toValue: 0, delay: 80, duration: 900, useNativeDriver: true }),
      ]).start();
    });
    const capture = listen('stage-capture', async () => {
      const session = sessionRef.current;
      //main window owns the toggle
      const settings = await Settings.load().catch(() => null);
      const found = await DesktopDetector.detect().catch(e => {
        console.warn('[Detector] inference failed', e);
        return null;
      });
      if (!found || session !== sessionRef.current) return;
      setBoxes(found);
      setShowBoxes(!!settings?.showDetectionBoxes);
      Animated.timing(boxesOpacity, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    });
    const select = listen<boolean>('stage-select', e => {
      console.log('[Stage] select', e.payload, rectsRef.current.length, 'elements');
      setSelecting(e.payload);
      pickedRef.current = null;
      dragRef.current = null;
      setMarquee(null);
      Animated.timing(dimOpacity, { toValue: e.payload ? 1 : 0, duration: 180, useNativeDriver: true }).start();
      if (!e.payload) moveFrame(null);
    });
    const hidden = listen('stage-hidden', () => {
      sessionRef.current++;
      setBoxes([]);
    });
    return () => {
      shown.then(un => un());
      capture.then(un => un());
      select.then(un => un());
      hidden.then(un => un());
    };
  }, [haloOpacity, boxesOpacity, dimOpacity, moveFrame]);

  useEffect(() => {
    if (!selecting) return;
    const commit = (rect: Rect | null) => {
      if (!rect || rect.x2 - rect.x1 < MIN_BOX || rect.y2 - rect.y1 < MIN_BOX) {
        invoke('stage_select', { active: false });
        return;
      }
      const { innerWidth: w, innerHeight: h } = window;
      invoke('stage_crop', { x: rect.x1 / w, y: rect.y1 / h, w: (rect.x2 - rect.x1) / w, h: (rect.y2 - rect.y1) / h });
    };
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (drag && (drag.moved || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > DRAG_TOL)) {
        drag.moved = true;
        const box = {
          x1: Math.min(drag.x, e.clientX),
          y1: Math.min(drag.y, e.clientY),
          x2: Math.max(drag.x, e.clientX),
          y2: Math.max(drag.y, e.clientY),
        };
        setMarquee(box);
        //covered elements grow the box
        moveFrame(pickRegion(rectsRef.current, box) ?? box);
        return;
      }
      if (drag) return;
      const over = hit(rectsRef.current, e.clientX, e.clientY);
      const picked = pickedRef.current;
      moveFrame(picked && over ? union(picked, over) : over ?? picked);
    };
    const onDown = (e: MouseEvent) => {
      dragRef.current = { x: e.clientX, y: e.clientY, moved: false };
    };
    const onUp = (e: MouseEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      setMarquee(null);
      const target = drag?.moved ? frameRef.current : hit(rectsRef.current, e.clientX, e.clientY);
      if (!target) return;
      const picked = pickedRef.current ? union(pickedRef.current, target) : target;
      //shift keeps adding until ctrl release
      if (e.shiftKey) {
        pickedRef.current = picked;
        moveFrame(picked);
        return;
      }
      commit(picked);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') invoke('stage_select', { active: false });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    //rust watches ctrl outside the webview
    const ctrlUp = listen('stage-ctrl-up', () => commit(pickedRef.current));
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      ctrlUp.then(un => un());
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [selecting, moveFrame]);

  return (
    <View style={styles.root} pointerEvents="none">
      {/* spotlight around the frame */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: dimOpacity }]}>
        <Animated.View style={[styles.dim, StyleSheet.absoluteFill, { opacity: Animated.subtract(1, frameOpacity) }]} />
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: frameOpacity }]}>
          <Animated.View style={[styles.dim, { top: 0, left: 0, right: 0, height: frameY }]} />
          <Animated.View style={[styles.dim, { left: 0, right: 0, bottom: 0, top: Animated.add(frameY, frameH) }]} />
          <Animated.View style={[styles.dim, { left: 0, top: frameY, height: frameH, width: frameX }]} />
          <Animated.View style={[styles.dim, { right: 0, top: frameY, height: frameH, left: Animated.add(frameX, frameW) }]} />
        </Animated.View>
      </Animated.View>
      <Animated.View style={[styles.frame, { left: frameX, top: frameY, width: frameW, height: frameH, opacity: frameOpacity }]} />
      {marquee && (
        <View style={[styles.marquee, {
          left: marquee.x1,
          top: marquee.y1,
          width: marquee.x2 - marquee.x1,
          height: marquee.y2 - marquee.y1,
        }]} />
      )}
      {showBoxes && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: boxesOpacity }]}>
          {boxes.map((box, i) => (
            <View
              key={i}
              style={[styles.box, {
                left: `${box.x * 100}%`,
                top: `${box.y * 100}%`,
                width: `${box.w * 100}%`,
                height: `${box.h * 100}%`,
              }]}
            />
          ))}
        </Animated.View>
      )}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: haloOpacity }]}>
        <LinearGradient colors={[Colors.overlayHalo, Colors.overlayHaloClear]} style={styles.haloTop} />
        <LinearGradient colors={[Colors.overlayHaloClear, Colors.overlayHalo]} style={styles.haloBottom} />
        <LinearGradient colors={[Colors.overlayHalo, Colors.overlayHaloClear]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.haloLeft} />
        <LinearGradient colors={[Colors.overlayHaloClear, Colors.overlayHalo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.haloRight} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  dim: {
    position: 'absolute',
    backgroundColor: Colors.selectionDim,
  },
  frame: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: Radius.xxl,
  },
  marquee: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryHeader,
  },
  box: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  haloTop: { position: 'absolute', top: 0, left: 0, right: 0, height: HALO_SIZE },
  haloBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: HALO_SIZE },
  haloLeft: { position: 'absolute', top: 0, bottom: 0, left: 0, width: HALO_SIZE },
  haloRight: { position: 'absolute', top: 0, bottom: 0, right: 0, width: HALO_SIZE },
});
