import React, { useCallback, useRef } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

//a touch inside an interactive widget must not reach the app's swipe gestures
let activeTouches = 0;
export function isWidgetTouchActive(): boolean {
  return activeTouches > 0;
}

interface WidgetTouchAreaProps {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

//wraps an interactive widget surface so only the widget reacts to the gesture
export default function WidgetTouchArea({ style, children }: WidgetTouchAreaProps) {
  const held = useRef(0);

  const onTouchStart = useCallback(() => {
    held.current++;
    activeTouches++;
  }, []);

  const onTouchEnd = useCallback(() => {
    if (held.current === 0) return;
    held.current--;
    activeTouches = Math.max(0, activeTouches - 1);
  }, []);

  return (
    <View
      style={style}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      //claim the touch before the chat list can take it
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onStartShouldSetResponderCapture={() => true}
      onMoveShouldSetResponderCapture={() => true}
      //true here blocks the native scroll parent
      onResponderGrant={() => true}
      onResponderTerminationRequest={() => false}
    >
      {children}
    </View>
  );
}
