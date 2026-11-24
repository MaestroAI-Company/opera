import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import type { CameraDevice, LiveCameraHandle } from "./LiveCamera";

export type { CameraDevice, LiveCameraHandle };

//labels only show once camera access is granted
export async function listCameras(): Promise<CameraDevice[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "videoinput")
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }));
}

const LiveCamera = forwardRef<LiveCameraHandle, { style: StyleProp<ViewStyle>; deviceId?: string }>(
  function LiveCamera({ style, deviceId }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
      let stream: MediaStream | null = null;
      let cancelled = false;
      navigator.mediaDevices
        .getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : true })
        .then((s) => {
          if (cancelled) return s.getTracks().forEach((t) => t.stop());
          stream = s;
          if (videoRef.current) videoRef.current.srcObject = s;
        })
        .catch((e) => console.warn("[LiveCamera] cannot open camera:", e));
      return () => {
        cancelled = true;
        stream?.getTracks().forEach((t) => t.stop());
      };
    }, [deviceId]);

    useImperativeHandle(ref, () => ({
      async capture(quality) {
        const video = videoRef.current;
        if (!video || !video.videoWidth) return null;
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d")?.drawImage(video, 0, 0);
        return canvas.toDataURL("image/jpeg", quality).replace(/^data:[^,]+,/, "");
      },
    }));

    return (
      <View style={style}>
        <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </View>
    );
  },
);

export default LiveCamera;
