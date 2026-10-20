import { DeviceEventEmitter } from 'react-native';
import { AppEvents } from '../events';

//app and overlay share runtime
let shown = false;

//hidden app stays idle under overlay
export const OverlayPresence = {
  isShown: () => shown,

  set(next: boolean) {
    if (next === shown) return;
    shown = next;
    DeviceEventEmitter.emit(AppEvents.overlayVisibility, next);
  },
};
