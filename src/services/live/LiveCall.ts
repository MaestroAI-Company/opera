import notifee, { AuthorizationStatus } from '@notifee/react-native';
import { Asset } from 'expo-asset';
import type { LiveActivity } from 'expo-widgets';
import { DeviceEventEmitter, ImageSourcePropType, NativeModules, Platform, processColor } from 'react-native';
import { LightColors } from '../../../constants/theme';
import { copyToWidgets } from '../widgets/WidgetService';
import { callActivity } from '../../widgets/LiveActivities';
import { activityStyle, CALL_HANGUP, CALL_MUTE, type CallActivityProps } from '../../widgets/liveActivityProps';

type LiveCallNative = {
  start(title: string, text: string, hangUpLabel: string, muteLabel: string, baseUri: string, accentUri: string, accentColor: number): void;
  stop(): void;
};

const native: LiveCallNative | undefined = Platform.OS === 'android' ? NativeModules.LiveCallModule : undefined;

export type LiveCallAction = 'hangup' | 'mute';
export type LiveCallAvatar = { baseUri: string; accentUri: string; color: number; tint: string };
export type LiveCallLabels = {
  title: string; text: string; hangUp: string; mute: string;
  avatar?: LiveCallAvatar | null;
};

//local files of butterfly layers
export async function loadLiveCallAvatar(base: ImageSourcePropType, accent: ImageSourcePropType, tint: string): Promise<LiveCallAvatar | null> {
  if (Platform.OS === 'ios') {
    try {
      const { widgetsDirectory } = require('expo-widgets') as typeof import('expo-widgets');
      if (!widgetsDirectory) return null;
      //name encodes the butterfly
      const baseUri = await copyToWidgets(widgetsDirectory, base as number, `call-${base}.png`);
      return { baseUri, accentUri: '', color: 0, tint };
    } catch {
      return null;
    }
  }
  if (!native) return null;
  try {
    const [baseAsset, accentAsset] = await Promise.all([base, accent].map((source) => Asset.fromModule(source as number).downloadAsync()));
    if (!baseAsset.localUri || !accentAsset.localUri) return null;
    return {
      baseUri: baseAsset.localUri.replace('file://', ''),
      accentUri: accentAsset.localUri.replace('file://', ''),
      color: processColor(tint) as number,
      tint,
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

let activity: LiveActivity<CallActivityProps> | null = null;
let startedAt = 0;

//call card on android, live activity on ios
export function startLiveCall(onAction: (action: LiveCallAction) => void): () => void {
  if (Platform.OS === 'ios') {
    const { addUserInteractionListener } = require('expo-widgets') as typeof import('expo-widgets');
    const sub = addUserInteractionListener(({ target }) => {
      if (target === CALL_HANGUP) onAction('hangup');
      else if (target === CALL_MUTE) onAction('mute');
    });
    return () => {
      sub.remove();
      activity?.end('immediate').catch(() => {});
      activity = null;
      startedAt = 0;
    };
  }
  if (!native) return () => {};
  const sub = DeviceEventEmitter.addListener('LIVE_CALL_ACTION', onAction);
  return () => {
    sub.remove();
    native.stop();
  };
}

//shows or refreshes the notification
export function showLiveCall(labels: LiveCallLabels): void {
  if (Platform.OS === 'ios') {
    //label updates keep the call timer
    if (!startedAt) startedAt = Date.now();
    const props: CallActivityProps = {
      ...activityStyle(labels.avatar?.tint ?? LightColors.primary),
      title: labels.title,
      text: labels.text,
      startedAt,
      accent: labels.avatar?.tint ?? LightColors.primary,
      image: labels.avatar?.baseUri ?? '',
      hangUpLabel: labels.hangUp,
      muteLabel: labels.mute,
    };
    try {
      if (activity) activity.update(props).catch(() => {});
      else activity = callActivity?.start(props) ?? null;
    } catch {
      //activities disabled in settings
    }
    return;
  }
  if (!native) return;
  native.start(labels.title, labels.text, labels.hangUp, labels.mute, labels.avatar?.baseUri ?? '', labels.avatar?.accentUri ?? '', labels.avatar?.color ?? 0);
}
