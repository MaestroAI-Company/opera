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

//drag overrides settled target
export function dragDrawer(progress: Animated.Value, ratio: number) {
  settledTarget.delete(progress);
  progress.setValue(ratio);
}

//exits outpace entrances
const DISMISS_VELOCITY = -3;

//spring carries finger velocity
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
  if (settledTarget.get(progress) === toValue) return;
  settledTarget.set(progress, toValue);
  Animated.spring(progress, {
    toValue,
    velocity: open ? velocity : Math.min(velocity, DISMISS_VELOCITY),
    overshootClamping: true,
    bounciness: 0,
    speed: 14,
    useNativeDriver: nativeDriver,
  }).start(() => onComplete?.());
}

//desktop width animates on fixed timing
export function settleLayoutDrawer(progress: Animated.Value, open: boolean) {
  Animated.timing(progress, {
    toValue: open ? 1 : 0,
    duration: open ? 280 : 220,
    easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    useNativeDriver: false,
  }).start();
}

//page content fades and slides in on every subpage navigation
export function playPageTransition(value: Animated.Value) {
  value.setValue(0);
  Animated.timing(value, {
    toValue: 1,
    duration: 220,
    easing: Easing.out(Easing.cubic),
    useNativeDriver: DRAWER_NATIVE_DRIVER,
  }).start();
}
