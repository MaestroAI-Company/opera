import React, { Dispatch, SetStateAction } from 'react';
import { View, Text } from 'react-native';
import { FontSizes, Fonts, Radius } from "../../../constants/theme";
import { useColors } from "../../hooks/useTheme";
import { useT } from "../../i18n";

//downloads tick per chunk, repaint on whole percents or twice a second
export function throttleProgress<T extends { progress: number }>(
  set: Dispatch<SetStateAction<T | null>>,
) {
  let lastPercent = -1;
  let lastTime = 0;
  return (value: T) => {
    const percent = Math.floor(value.progress * 100);
    const now = Date.now();
    if (percent === lastPercent && now - lastTime < 500) return;
    lastPercent = percent;
    lastTime = now;
    set(value);
  };
}

type DownloadProgressProps = {
  title: string;
  progress: number;
  sizeStr?: string;
  etaSeconds?: number;
};

export default function DownloadProgress({ title, progress, sizeStr, etaSeconds }: DownloadProgressProps) {
  const Colors = useColors();
  const t = useT();
  return (
    <View style={{ marginTop: 10, padding: 12, backgroundColor: Colors.surfaceMuted, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.surfacePressed }}>
      <Text style={{ fontFamily: Fonts.mono, color: Colors.textSecondary, fontSize: FontSizes.caption, marginBottom: 8 }}>
        {title}
      </Text>
      <View style={{ height: 6, backgroundColor: Colors.surfacePressed, borderRadius: Radius.xxs, overflow: "hidden", marginBottom: 8 }}>
        <View style={{ width: `${progress * 100}%`, height: "100%", backgroundColor: Colors.linkAlt }} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: Fonts.mono, color: Colors.textMuted, fontSize: FontSizes.micro }}>
          {sizeStr || t("download.starting")}
        </Text>
        <Text style={{ fontFamily: Fonts.mono, color: Colors.textMuted, fontSize: FontSizes.micro }}>
          {etaSeconds ? t("download.eta", { seconds: Math.round(etaSeconds) }) : ""}
        </Text>
      </View>
    </View>
  );
}
