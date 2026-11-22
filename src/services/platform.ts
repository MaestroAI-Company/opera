import * as Device from 'expo-device';
import { Platform } from 'react-native';

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

let platformFeatures: Set<string> | null = null;

//one native call before first render
export async function loadPlatformFeatures(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const list = await Device.getPlatformFeaturesAsync().catch(() => null);
  if (list?.length) platformFeatures = new Set(list);
}

//unknown counts as present
export function hasPlatformFeature(name: string): boolean {
  return !platformFeatures || platformFeatures.has(name);
}
