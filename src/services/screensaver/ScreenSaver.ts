import * as IntentLauncher from 'expo-intent-launcher';

export async function openScreenSaverSettings(): Promise<void> {
  try {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.DREAM_SETTINGS);
  } catch (e) {
    console.warn('[ScreenSaver] could not open screen saver settings:', e);
  }
}
