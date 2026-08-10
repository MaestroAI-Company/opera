import { useState } from 'react';
import { Animated } from 'react-native';

//state gives one stable instance
export function useAnimatedValue(initialValue: number): Animated.Value {
  return useState(() => new Animated.Value(initialValue))[0];
}
