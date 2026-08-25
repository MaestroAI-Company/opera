import * as IntentLauncher from 'expo-intent-launcher';
import { NativeModules, Platform } from 'react-native';
import { Settings } from '../settings/SettingsService';

type NativeAssistant = {
  isDefaultAssistant(): Promise<boolean>;
};

const Native: NativeAssistant | undefined =
  Platform.OS === 'android' ? NativeModules.AssistantModule : undefined;

//null when platform has no role
export async function isDefaultAssistant(): Promise<boolean | null> {
  if (!Native) return null;
  try {
    return await Native.isDefaultAssistant();
  } catch (e) {
    console.warn('[DefaultAssistant] role check failed:', e);
    return null;
  }
}

//only android has a claimable role
export async function shouldOfferAssistantRole(): Promise<boolean> {
  if (Settings.getCached().assistantPromptDismissed) return false;
  return (await isDefaultAssistant()) === false;
}

export async function openAssistantSettings(): Promise<void> {
  try {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.VOICE_INPUT_SETTINGS);
  } catch (e) {
    console.warn('[DefaultAssistant] could not open voice input settings:', e);
  }
}

//never offer again after dismissal
export async function dismissAssistantPrompt(): Promise<void> {
  await Settings.set('assistantPromptDismissed', true);
}
