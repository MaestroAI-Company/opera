import { NativeModules, Platform } from 'react-native';

const MODULE =
  Platform.OS === 'android' ? (NativeModules.ScreenCaptureModule as any) : null;

export type ScreenshotInfo = { width: number; height: number };

export type NormalizedRegion = { x: number; y: number; w: number; h: number };

function decodeBase64Float32(b64: string): Float32Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer, 0, bytes.byteLength / 4);
}

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
  async getYoloInputTensor(): Promise<Float32Array | null> {
    if (!MODULE) return null;
    try {
      const b64 = (await MODULE.getYoloInputTensor()) as string;
      return decodeBase64Float32(b64);
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
