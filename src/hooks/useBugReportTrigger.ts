import { Accelerometer } from 'expo-sensors';
import { useEffect } from 'react';
import { Platform } from 'react-native';

//1g is a phone at rest
//real shakes push past resting
const SHAKE_DELTA = 1.2;
const COOLDOWN_MS = 2000;

//shake or ctrl shift b opens report
export function useBugReportTrigger(onTrigger: () => void) {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    let last = 0;
    Accelerometer.setUpdateInterval(100);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const force = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();
      if (Math.abs(force - 1) > SHAKE_DELTA && now - last > COOLDOWN_MS) {
        last = now;
        onTrigger();
      }
    });
    return () => sub.remove();
  }, [onTrigger]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        onTrigger();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onTrigger]);
}
