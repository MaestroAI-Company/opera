import { useSyncExternalStore } from "react";
import { Animated, Appearance, AppState, DeviceEventEmitter, Easing, Platform } from "react-native";
import { DarkColors, LightColors, ThemeColors } from "../../constants/theme";
import { AppEvents } from "../services/events";
import { Settings } from "../services/settings/SettingsService";

export type ThemeMode = "system" | "light" | "dark";

//module store, not a context: the assistant overlay is a separate app entry
let mode: ThemeMode = "system";
let systemDark = Appearance.getColorScheme() === "dark";
let active: ThemeColors = systemDark ? DarkColors : LightColors;
const listeners = new Set<() => void>();
let started = false;
let didResolveOnce = false;

function resolve(): void {
  const next = mode === "dark" || (mode === "system" && systemDark) ? DarkColors : LightColors;

  //set even on a no-op resolve
  const isFirstResolve = !didResolveOnce;
  didResolveOnce = true;

  if (next === active) return;

  const from = active;
  active = next;
  for (const listener of listeners) listener();

  //skip the veil on boot or when backgrounded
  if (!isFirstResolve && veilListeners.size > 0 && AppState.currentState === "active") {
    playVeil(from.background);
  }
}

export function setThemeMode(next: ThemeMode): void {
  if (next === mode) return;
  mode = next;
  resolve();
}

//follow the os scheme and the saved setting for the whole app life
export function initTheme(): void {
  if (started) return;
  started = true;

  Appearance.addChangeListener(({ colorScheme }) => {
    systemDark = colorScheme === "dark";
    resolve();
  });

  //other surfaces write the setting through Settings.set
  DeviceEventEmitter.addListener(AppEvents.settingsChanged, () => {
    setThemeMode(Settings.getCached().theme as ThemeMode);
  });

  (async () => {
    try {
      await Settings.init();
      const saved = await Settings.load();
      setThemeMode(saved.theme as ThemeMode);
    } catch {
      //keep the os scheme when settings are unavailable
    }
  })();
}

export function getColors(): ThemeColors {
  return active;
}

export function isDarkTheme(): boolean {
  return active === DarkColors;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): ThemeColors {
  return active;
}

export function useColors(): ThemeColors {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useIsDark(): boolean {
  return useColors() === DarkColors;
}

const VEIL_DURATION_MS = 1000;
//web has no native driver
const VEIL_NATIVE_DRIVER = Platform.OS !== "web";

//old color fades away over new content
const veilOpacity = new Animated.Value(0);
let veilColor: string = active.background;
const veilListeners = new Set<() => void>();

function playVeil(fromBackground: string): void {
  veilColor = fromBackground;
  for (const listener of veilListeners) listener();

  veilOpacity.stopAnimation(() => {
    veilOpacity.setValue(1);
    Animated.timing(veilOpacity, {
      toValue: 0,
      duration: VEIL_DURATION_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: VEIL_NATIVE_DRIVER,
    }).start();
  });
}

function subscribeVeil(callback: () => void): () => void {
  veilListeners.add(callback);
  return () => {
    veilListeners.delete(callback);
  };
}

function getVeilSnapshot(): string {
  return veilColor;
}

//mount once at the root above everything
export function useThemeVeil(): { color: string; opacity: Animated.Value } {
  const color = useSyncExternalStore(subscribeVeil, getVeilSnapshot, getVeilSnapshot);
  return { color, opacity: veilOpacity };
}

//stylesheets are built once per factory and per palette, not per render
const styleCache = new WeakMap<object, WeakMap<ThemeColors, unknown>>();

function build<T>(factory: (colors: ThemeColors) => T, colors: ThemeColors): T {
  let perPalette = styleCache.get(factory);
  if (!perPalette) {
    perPalette = new WeakMap();
    styleCache.set(factory, perPalette);
  }
  let styles = perPalette.get(colors) as T | undefined;
  if (!styles) {
    styles = factory(colors);
    perPalette.set(colors, styles);
  }
  return styles;
}

export function useThemedStyles<T>(factory: (colors: ThemeColors) => T): T {
  return build(factory, useColors());
}

//for plain render helpers that cannot hold hooks
export function getThemedStyles<T>(factory: (colors: ThemeColors) => T): T {
  return build(factory, active);
}
