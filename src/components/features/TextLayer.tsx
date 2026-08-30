import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Colors, Radius } from '../../../constants/theme';
import { ScreenCode } from '../../services/overlay/screenCapture';

type Size = { w: number; h: number };
type Region = { x: number; y: number; w: number; h: number };

type Props = {
  codes: ScreenCode[];
  onVibrate?: () => void;
};

function toRect(region: Region, size: Size) {
  return {
    x1: region.x * size.w,
    y1: region.y * size.h,
    x2: (region.x + region.w) * size.w,
    y2: (region.y + region.h) * size.h,
  };
}

const frame = (rect: { x1: number; y1: number; x2: number; y2: number }) => ({
  left: rect.x1,
  top: rect.y1,
  width: rect.x2 - rect.x1,
  height: rect.y2 - rect.y1,
});

//qr only ocr text is native
export default function TextLayer({ codes, onVibrate }: Props) {
  const [size, setSize] = useState<Size>({ w: 1, h: 1 });

  const codeRects = useMemo(() => codes.map(code => toRect(code, size)), [codes, size]);

  //no scheme means nothing to open
  const openCode = async (value: string) => {
    onVibrate?.();
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) && await Linking.canOpenURL(value)) {
      Linking.openURL(value);
      return;
    }
    Clipboard.setStringAsync(value);
  };

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={e => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {codeRects.map((rect, i) => (
        <Pressable key={`code-${i}`} style={[styles.code, frame(rect)]} onPress={() => openCode(codes[i].value)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  code: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: Radius.xxl,
    backgroundColor: Colors.primaryHeader,
  },
});