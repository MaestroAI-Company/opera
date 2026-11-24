import notifee, { AuthorizationStatus } from '@notifee/react-native';
import { Asset } from 'expo-asset';
import { DeviceEventEmitter, ImageSourcePropType, NativeModules, Platform, processColor } from 'react-native';

type LiveCallNative = {
  start(title: string, text: string, hangUpLabel: string, muteLabel: string, baseUri: string, accentUri: string, accentColor: number): void;
  stop(): void;
};

//todo ios needs a live activity
const native: LiveCallNative | undefined = Platform.OS === 'android' ? NativeModules.LiveCallModule : undefined;

export type LiveCallAction = 'hangup' | 'mute';
export type LiveCallAvatar = { baseUri: string; accentUri: string; color: number };
export type LiveCallLabels = {
  title: string; text: string; hangUp: string; mute: string;
  avatar?: LiveCallAvatar | null;
};

//local files of butterfly layers
export async function loadLiveCallAvatar(base: ImageSourcePropType, accent: ImageSourcePropType, tint: string): Promise<LiveCallAvatar | null> {
  if (!native) return null;
  try {
    const [baseAsset, accentAsset] = await Promise.all([base, accent].map((source) => Asset.fromModule(source as number).downloadAsync()));
    if (!baseAsset.localUri || !accentAsset.localUri) return null;
    return {
      baseUri: baseAsset.localUri.replace('file://', ''),
      accentUri: accentAsset.localUri.replace('file://', ''),
      color: processColor(tint) as number,
    };
  } catch {
    return null;
  }
}

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
  if (!native) return;
  native.start(labels.title, labels.text, labels.hangUp, labels.mute, labels.avatar?.baseUri ?? '', labels.avatar?.accentUri ?? '', labels.avatar?.color ?? 0);
}
