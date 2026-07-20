import React from 'react';
import { View, Text } from 'react-native';

type DownloadProgressProps = {
  title: string;
  progress: number;
  sizeStr?: string;
  etaSeconds?: number;
};

export default function DownloadProgress({ title, progress, sizeStr, etaSeconds }: DownloadProgressProps) {
  return (
    <View style={{ marginTop: 10, padding: 12, backgroundColor: "#f9f9f9", borderRadius: 8, borderWidth: 1, borderColor: "#eaeaea" }}>
      <Text style={{ fontFamily: "IBMPlexMono-Medium", color: "#333", fontSize: 13, marginBottom: 8 }}>
        {title}
      </Text>
      <View style={{ height: 6, backgroundColor: "#eaeaea", borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
        <View style={{ width: `${progress * 100}%`, height: "100%", backgroundColor: "#0066cc" }} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: "IBMPlexMono-Medium", color: "#888", fontSize: 11 }}>
          {sizeStr || "Starting..."}
        </Text>
        <Text style={{ fontFamily: "IBMPlexMono-Medium", color: "#888", fontSize: 11 }}>
          {etaSeconds ? `${Math.round(etaSeconds)}s remaining` : ""}
        </Text>
      </View>
    </View>
  );
}
