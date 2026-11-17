import * as IntentLauncher from 'expo-intent-launcher';
import { NativeModules, Platform } from 'react-native';

type NativeScreenSaver = {
  isScreenSaverActive(): Promise<boolean>;
};

const Native: NativeScreenSaver | undefined =
  Platform.OS === 'android' ? NativeModules.AssistantModule : undefined;

//true when opera is the active screen saver
export async function isScreenSaverActive(): Promise<boolean> {
  if (!Native) return false;
  try {
    return await Native.isScreenSaverActive();
  } catch (e) {
    console.warn('[ScreenSaver] status check failed:', e);
    return false;
  }
}

export async function openScreenSaverSettings(): Promise<void> {
  try {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.DREAM_SETTINGS);
  } catch (e) {
    console.warn('[ScreenSaver] could not open screen saver settings:', e);
  }
}
