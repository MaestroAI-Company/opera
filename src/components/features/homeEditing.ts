import { useSyncExternalStore } from "react";

//lives at module scope so the header buttons and the sections follow it without rendering the whole screen
let editing = false;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const setHomeEditing = (next: boolean) => {
  if (editing === next) return;
  editing = next;
  listeners.forEach((listener) => listener());
};

export const useHomeEditing = () =>
  useSyncExternalStore(
    subscribe,
    () => editing,
    () => false,
  );
