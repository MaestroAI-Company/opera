import { CameraView } from "expo-camera";
import { forwardRef, useImperativeHandle, useRef } from "react";
import type { StyleProp, ViewStyle } from "react-native";

export type LiveCameraHandle = {
  //base64 jpeg without data uri prefix
  capture(quality: number): Promise<string | null>;
};

export type CameraDevice = { id: string; label: string };

//cameras cannot be picked on mobile
export async function listCameras(): Promise<CameraDevice[]> {
  return [];
}

const LiveCamera = forwardRef<LiveCameraHandle, { style: StyleProp<ViewStyle>; deviceId?: string }>(
  function LiveCamera({ style }, ref) {
    const cameraRef = useRef<CameraView>(null);
    useImperativeHandle(ref, () => ({
      async capture(quality) {
        const photo = await cameraRef.current?.takePictureAsync({ base64: true, quality, shutterSound: false });
        return photo?.base64 ?? null;
      },
    }));
    return <CameraView ref={cameraRef} style={style} facing="back" animateShutter={false} />;
  },
);

export default LiveCamera;
