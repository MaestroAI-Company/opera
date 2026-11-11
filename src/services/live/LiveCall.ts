import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';

type LiveCallNative = {
  start(title: string, text: string, hangUpLabel: string, muteLabel: string): void;
  stop(): void;
};

const native: LiveCallNative | undefined = Platform.OS === 'android' ? NativeModules.LiveCallModule : undefined;

export type LiveCallAction = 'hangup' | 'mute';
export type LiveCallLabels = { title: string; text: string; hangUp: string; mute: string };

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
