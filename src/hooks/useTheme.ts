import { createContext, useContext, useSyncExternalStore } from "react";
import { Appearance, DeviceEventEmitter } from "react-native";
import { DarkColors, LightColors, ThemeColors, VoiceAccents, withAccent } from "../../constants/theme";
import { AppEvents } from "../services/events";
import { AppSettings, parseTtsVoices } from "../services/settings/schema";
import { Settings } from "../services/settings/SettingsService";

export type ThemeMode = "system" | "light" | "dark";

//module store, not a context: the assistant overlay is a separate app entry
let mode: ThemeMode = "system";
let accent: string = LightColors.primary;
let systemDark = Appearance.getColorScheme() === "dark";
let active: ThemeColors = systemDark ? DarkColors : LightColors;
//dark screens pin their palette but keep the accent
let activeDark: ThemeColors = DarkColors;
const listeners = new Set<() => void>();
let started = false;

//one palette object per base and accent, style caches key on its identity
const palettes = new Map<string, ThemeColors>();
const darkPalettes = new WeakSet<ThemeColors>([DarkColors]);

function paletteFor(base: ThemeColors, color: string): ThemeColors {
  const key = `${darkPalettes.has(base)}${color}`;
  let palette = palettes.get(key);
  if (!palette) {
    palette = withAccent(base, color);
    if (darkPalettes.has(base)) darkPalettes.add(palette);
    palettes.set(key, palette);
  }
  return palette;
}

function resolve(): void {
  const dark = mode === "dark" || (mode === "system" && systemDark);
  const next = paletteFor(dark ? DarkColors : LightColors, accent);
  const nextDark = paletteFor(DarkColors, accent);
  if (next === active && nextDark === activeDark) return;

  active = next;
  activeDark = nextDark;
  for (const listener of listeners) listener();
}

export function setThemeMode(next: ThemeMode): void {
  if (next === mode) return;
  mode = next;
  resolve();
}

//accent of the saved maestro voice, red unless the user asked for it
function accentOf(settings: AppSettings): string {
  if (!settings.applyMaestroColor) return LightColors.primary;
  return VoiceAccents[parseTtsVoices(settings.ttsVoices).supertonic] ?? LightColors.primary;
}

function applySettings(settings: AppSettings): void {
  mode = settings.theme as ThemeMode;
  accent = accentOf(settings);
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
    applySettings(Settings.getCached());
  });

  (async () => {
    try {
      await Settings.init();
      const saved = await Settings.load();
      //os scheme read at module load can be stale on cold start
      systemDark = Appearance.getColorScheme() === "dark";
      applySettings(saved);
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

function getAccentSnapshot(): string | null {
  return accent === LightColors.primary ? null : accent;
}

function getServerAccentSnapshot(): string | null {
  return null;
}

function getDarkSnapshot(): ThemeColors {
  return activeDark;
}

function getServerDarkSnapshot(): ThemeColors {
  return DarkColors;
}

//a surface can pin its own palette
export const ColorsOverride = createContext<ThemeColors | null>(null);

export function useColors(): ThemeColors {
  const override = useContext(ColorsOverride);
  const colors = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return override ?? colors;
}

//accent only while the maestro color is applied, null keeps the default red
export function useAccent(): string | null {
  return useSyncExternalStore(subscribe, getAccentSnapshot, getServerAccentSnapshot);
}

//dark palette with the live accent, for screens that ignore the app theme
export function useDarkColors(): ThemeColors {
  return useSyncExternalStore(subscribe, getDarkSnapshot, getServerDarkSnapshot);
}

export function useIsDark(): boolean {
  return darkPalettes.has(useColors());
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
