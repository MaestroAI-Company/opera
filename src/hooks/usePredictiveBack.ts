import { RefObject, useEffect, useLayoutEffect, useRef } from "react";
import { DeviceEventEmitter, NativeModules, Platform } from "react-native";

type PredictiveBackHandlers = {
  onStart?: () => void;
  onProgress: (progress: number) => void;
  onCancel: () => void;
  onBack: () => void;
};

const Native: { setEnabled(enabled: boolean): void } | undefined =
  Platform.OS === "android" ? NativeModules.PredictiveBackModule : undefined;

//last enabled owner gets the gesture, like BackHandler
const owners: RefObject<PredictiveBackHandlers>[] = [];
const top = () => owners[owners.length - 1]?.current;

if (Native) {
  DeviceEventEmitter.addListener("PredictiveBackStarted", () => top()?.onStart?.());
  DeviceEventEmitter.addListener("PredictiveBackProgress", (e: { progress: number }) =>
    top()?.onProgress(e.progress),
  );
  DeviceEventEmitter.addListener("PredictiveBackCancelled", () => top()?.onCancel());
  DeviceEventEmitter.addListener("PredictiveBackInvoked", () => top()?.onBack());
}

//android back gesture while enabled, a plain back press only calls onBack
export function usePredictiveBack(enabled: boolean, handlers: PredictiveBackHandlers) {
  const handlersRef = useRef(handlers);
  //synced before paint so a gesture never sees last render's state
  useLayoutEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!Native || !enabled) return;
    owners.push(handlersRef);
    Native.setEnabled(true);
    return () => {
      owners.splice(owners.indexOf(handlersRef), 1);
      Native.setEnabled(owners.length > 0);
    };
  }, [enabled]);
}
