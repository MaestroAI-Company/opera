import { Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';

//ios ignores the vibration duration and always buzzes 0.4s
export function vibrate(ms: number) {
  if (Platform.OS !== 'ios') {
    Vibration.vibrate(ms);
    return;
  }
  Haptics.impactAsync(
    ms >= 30 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
  ).catch(() => {});
}
