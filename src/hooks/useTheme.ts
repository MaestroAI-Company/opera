import { useSyncExternalStore } from "react";
import { Appearance, DeviceEventEmitter } from "react-native";
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

function resolve(): void {
  const next = mode === "dark" || (mode === "system" && systemDark) ? DarkColors : LightColors;
  if (next === active) return;

  active = next;
  for (const listener of listeners) listener();
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

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): ThemeColors {
  return active;
}

//static web html is prerendered in light
function getServerSnapshot(): ThemeColors {
  return LightColors;
}

export function useColors(): ThemeColors {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useIsDark(): boolean {
  return useColors() === DarkColors;
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
