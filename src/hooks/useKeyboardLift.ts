import { useEffect } from "react";
import { KeyboardController, useGenericKeyboardHandler, type NativeEvent } from "react-native-keyboard-controller";
import { useSharedValue } from "react-native-reanimated";

//keyboard height that never freezes mid-way
export function useKeyboardLift(enabled = true) {
  //mounting over an open keyboard starts on it
  const lift = useSharedValue(enabled && KeyboardController.isVisible() ? KeyboardController.state().height : 0);
  const active = useSharedValue(enabled);
  const follows = useSharedValue(enabled);

  useEffect(() => {
    active.value = enabled;
  }, [enabled, active]);

  const follow = (e: NativeEvent) => {
    "worklet";
    //overlay keyboards are only followed down
    lift.value = follows.value ? e.height : Math.min(lift.value, e.height);
  };

  useGenericKeyboardHandler(
    {
      onStart: (e) => {
        "worklet";
        //each opening decides who owns it
        if (e.height > 0) follows.value = active.value;
      },
      onMove: follow,
      onInteractive: follow,
      onEnd: follow,
    },
    []
  );

  return lift;
}
