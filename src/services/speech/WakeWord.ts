import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';

type NativeWakeWord = {
  start(threshold: number): Promise<boolean>;
  stop(): Promise<void>;
};

const Native: NativeWakeWord | undefined =
  Platform.OS === 'android' ? NativeModules.WakeWordModule : undefined;

//v3b starting threshold
const THRESHOLD = 0.5;

//false without the mic permission
export async function startWakeWord(): Promise<boolean> {
  if (!Native) return false;
  try {
    return await Native.start(THRESHOLD);
  } catch (e) {
    console.warn('[WakeWord] start failed:', e);
    return false;
  }
}

//resolves once the mic is free
export async function stopWakeWord(): Promise<void> {
  await Native?.stop();
}

//native stops listening before it fires
export function onWakeWord(listener: () => void): () => void {
  const sub = DeviceEventEmitter.addListener('WAKEWORD_DETECTED', listener);
  return () => sub.remove();
}
