import { GestureResponderEvent, Vibration } from "react-native";

//vibrate before the press handler, keeps a missing handler disabled
export const buzzPress = (handler?: (event: GestureResponderEvent) => void) =>
  handler && ((event: GestureResponderEvent) => {
    Vibration.vibrate(10);
    handler(event);
  });
