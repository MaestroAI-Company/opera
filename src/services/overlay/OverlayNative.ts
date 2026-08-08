import { NativeModules, Platform } from 'react-native';
import { File } from 'expo-file-system';

const MODULE =
  Platform.OS === 'android' ? (NativeModules.ScreenCaptureModule as any) : null;

export type ScreenshotInfo = { width: number; height: number };

export type NormalizedRegion = { x: number; y: number; w: number; h: number };

export const OverlayNative = {
  supported(): boolean {
    return MODULE !== null;
  },

  async hasScreenshot(): Promise<boolean> {
    if (!MODULE) return false;
    try {
      return !!(await MODULE.hasScreenshot());
    } catch (e) {
      console.warn('ScreenCapture hasScreenshot error:', e);
      return false;
    }
  },

  async getScreenshotInfo(): Promise<ScreenshotInfo | null> {
    if (!MODULE) return null;
    try {
      return (await MODULE.getScreenshotInfo()) as ScreenshotInfo;
    } catch (e) {
      console.warn('ScreenCapture getScreenshotInfo error:', e);
      return null;
    }
  },

  //crop region of the current screenshot into a jpeg data uri
  async cropRegion(region: NormalizedRegion): Promise<string | null> {
    if (!MODULE) return null;
    try {
      return (await MODULE.cropRegion(region.x, region.y, region.w, region.h)) as string;
    } catch (e) {
      console.warn('ScreenCapture cropRegion error:', e);
      return null;
    }
  },

  //letterboxed [1,3,640,640] float32 tensor for the yolo model
  //native writes the tensor to a cache file, js reads bytes directly (no base64)
  async getYoloInputTensor(): Promise<Float32Array | null> {
    if (!MODULE) return null;
    try {
      const path = (await MODULE.getYoloInputTensor()) as string;
      const file = new File(path.startsWith('file://') ? path : `file://${path}`);
      const bytes = await file.bytes();
      //aligned copy so the underlying buffer is 4-byte aligned for Float32Array
      const aligned = new Uint8Array(bytes.byteLength);
      aligned.set(bytes);
      return new Float32Array(aligned.buffer);
    } catch (e) {
      console.warn('ScreenCapture getYoloInputTensor error:', e);
      return null;
    }
  },

  //close overlay only
  closeOverlay(): void {
    if (!MODULE) return;
    try {
      MODULE.closeOverlay();
    } catch (e) {
      console.warn('ScreenCapture closeOverlay error:', e);
    }
  },
};
