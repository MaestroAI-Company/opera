import notifee, { AuthorizationStatus } from '@notifee/react-native';
import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';

type LiveCallNative = {
  start(title: string, text: string, hangUpLabel: string, muteLabel: string): void;
  stop(): void;
};

const native: LiveCallNative | undefined = Platform.OS === 'android' ? NativeModules.LiveCallModule : undefined;

export type LiveCallAction = 'hangup' | 'mute';
export type LiveCallLabels = { title: string; text: string; hangUp: string; mute: string };

//android 13+ hides the card without the grant
export async function hasLiveCallPermission(): Promise<boolean> {
  if (!native) return true;
  const settings = await notifee.getNotificationSettings();
  return settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
}

//asks once, else falls back to system settings
export async function requestLiveCallPermission(): Promise<boolean> {
  if (!native) return true;
  const settings = await notifee.requestPermission();
  if (settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED) return true;
  await notifee.openNotificationSettings();
  return false;
}

//ongoing call notification, android only
export function startLiveCall(onAction: (action: LiveCallAction) => void): () => void {
  if (!native) return () => {};
  const sub = DeviceEventEmitter.addListener('LIVE_CALL_ACTION', onAction);
  return () => {
    sub.remove();
    native.stop();
  };
}

//shows or refreshes the notification
export function showLiveCall(labels: LiveCallLabels): void {
  native?.start(labels.title, labels.text, labels.hangUp, labels.mute);
}
