import { useSyncExternalStore } from "react";
import { Platform } from "react-native";

let sliderDragging = false;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

//true while a slider handle is held, scrolls stop following the finger
export const useSliderDragging = () => useSyncExternalStore(subscribe, () => sliderDragging);

//block text selection page wide while a slider is dragged
export const lockTextSelection = (locked: boolean) => {
  if (sliderDragging !== locked) {
    sliderDragging = locked;
    listeners.forEach((listener) => listener());
  }
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  document.body.style.userSelect = locked ? "none" : "";
  document.body.style.setProperty("-webkit-user-select", locked ? "none" : "");
};
