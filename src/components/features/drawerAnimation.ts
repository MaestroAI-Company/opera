import { Animated, Easing, Platform } from "react-native";

//module scope shared with screen
export const conversationsProgress = new Animated.Value(0);
export const settingsProgress = new Animated.Value(0);

export const DRAWER_NATIVE_DRIVER = Platform.OS !== "web";

//full width on mobile, capped elsewhere
export function drawerWidthFor(windowWidth: number): number {
  if (windowWidth < 768) {
    return windowWidth;
  }
  return Math.min(windowWidth * 0.90, 360);
}

//pan speed to spring units
export function gestureVelocity(vx: number, drawerWidth: number): number {
  return (vx * 1000) / drawerWidth;
}

//settled target skips restart
const settledTarget = new WeakMap<Animated.Value, number>();
//callbacks waiting on the running spring
const pendingDone = new WeakMap<Animated.Value, (() => void)[]>();

//panel stays under the finger
export function dragDrawer(progress: Animated.Value, ratio: number) {
  settledTarget.delete(progress);
  progress.setValue(Math.max(0, Math.min(1, ratio)));
}

//finger speed in px/ms read as flick
const FLICK_SPEED = 0.5;

//flick wins else nearest end
export function releaseOpens(ratio: number, speed: number): boolean {
  if (Math.abs(speed) > FLICK_SPEED) return speed > 0;
  return ratio > 0.5;
}

//critically damped so finger speed carries over
//nativeDriver defaults to the shared drawer setting, override false when the value
//also feeds a layout property (eg. marginBottom), which the native driver can't touch
export function settleDrawer(
  progress: Animated.Value,
  open: boolean,
  velocity = 0,
  nativeDriver = DRAWER_NATIVE_DRIVER,
  onComplete?: () => void
) {
  const toValue = open ? 1 : 0;
  if (settledTarget.get(progress) === toValue) {
    //joins the spring already heading there
    if (onComplete) {
      const running = pendingDone.get(progress);
      if (running) running.push(onComplete);
      else onComplete();
    }
    return;
  }
  settledTarget.set(progress, toValue);
  const done = onComplete ? [onComplete] : [];
  pendingDone.set(progress, done);
  Animated.spring(progress, {
    toValue,
    velocity,
    stiffness: 500,
    damping: 45,
    overshootClamping: true,
    useNativeDriver: nativeDriver,
  }).start(({ finished }) => {
    if (pendingDone.get(progress) === done) pendingDone.delete(progress);
    //interrupted close must not unmount a reopened sheet
    if (finished) done.forEach((cb) => cb());
  });
}

//desktop width animates on fixed timing
export function settleLayoutDrawer(
  progress: Animated.Value,
  open: boolean,
  onComplete?: () => void
) {
  Animated.timing(progress, {
    toValue: open ? 1 : 0,
    duration: open ? 280 : 220,
    easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    useNativeDriver: false,
  }).start(({ finished }) => {
    if (finished) onComplete?.();
  });
}

//same spring as the drawer, a native spring steps every frame where timing is sampled at 60fps
export function settlePage(
  progress: Animated.Value,
  toValue: number,
  onComplete: () => void
) {
  Animated.spring(progress, {
    toValue,
    stiffness: 500,
    damping: 45,
    overshootClamping: true,
    useNativeDriver: DRAWER_NATIVE_DRIVER,
  }).start(({ finished }) => {
    //a rewind or a gesture takes over the interrupted push
    if (finished) onComplete();
  });
  if (!DRAWER_NATIVE_DRIVER) return;
  //presses read the js pose
  //one frame later, native owns it
  requestAnimationFrame(() =>
    (progress as unknown as JsValue)._updateValue(toValue, true)
  );
}

//matches the animated value internals
type JsValue = { _updateValue: (value: number, flush: boolean) => void };
