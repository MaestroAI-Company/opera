import React from 'react';
import { View, Text } from 'react-native';
import { Colors, Fonts, FontSizes, Radius } from "../../../constants/theme";

type DownloadProgressProps = {
  title: string;
  progress: number;
  sizeStr?: string;
  etaSeconds?: number;
};

export default function DownloadProgress({ title, progress, sizeStr, etaSeconds }: DownloadProgressProps) {
  return (
    <View style={{ marginTop: 10, padding: 12, backgroundColor: Colors.surfaceMuted, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.surfacePressed }}>
      <Text style={{ fontFamily: Fonts.mono, color: Colors.textTertiary, fontSize: FontSizes.caption, marginBottom: 8 }}>
        {title}
      </Text>
      <View style={{ height: 6, backgroundColor: Colors.surfacePressed, borderRadius: Radius.xxs, overflow: "hidden", marginBottom: 8 }}>
        <View style={{ width: `${progress * 100}%`, height: "100%", backgroundColor: Colors.linkAlt }} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: Fonts.mono, color: Colors.textFaint, fontSize: FontSizes.micro }}>
          {sizeStr || "Starting..."}
        </Text>
        <Text style={{ fontFamily: Fonts.mono, color: Colors.textFaint, fontSize: FontSizes.micro }}>
          {etaSeconds ? `${Math.round(etaSeconds)}s remaining` : ""}
        </Text>
      </View>
    </View>
  );
}
