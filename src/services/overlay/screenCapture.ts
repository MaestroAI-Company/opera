import { NativeModules, Platform } from 'react-native';

export type CaptureSize = { width: number; height: number };
//normalized capture rectangle
export type CaptureRegion = { x: number; y: number; w: number; h: number };
export type AppContext = { appPackage: string | null; screenText: string | null };
export type AppIcon = { icon: string; label: string };
export type ScreenCode = CaptureRegion & { value: string };
//square letterboxed rgb bytes
export type DetectionInput = {
  data: string;
  offsetX: number;
  offsetY: number;
  contentWidth: number;
  contentHeight: number;
};

type NativeCapture = {
  getScreenshotInfo(): Promise<CaptureSize>;
  cropRegion(x: number, y: number, w: number, h: number): Promise<string>;
  getDetectionInput?(size: number): Promise<DetectionInput>;
  showTextLayer?(): Promise<void>;
  scanCodes?(): Promise<ScreenCode[]>;
  getAppContext?(): Promise<AppContext>;
  getAppIcon?(pkg: string): Promise<AppIcon>;
  closeOverlay(): void;
  clearTextLayer?(): void;
};

const Native: NativeCapture | undefined =
  Platform.OS === 'android' ? NativeModules.ScreenCaptureModule : undefined;

const POLL_INTERVAL_MS = 250;
export const CAPTURE_TIMEOUT_MS = 8000;

//capture lands after overlay opens
function isPending(e: any): boolean {
  return e?.code === 'NO_SCREENSHOT' || /no screenshot available/i.test(e?.message ?? '');
}

async function attempt<T>(what: string, run: (native: NativeCapture) => Promise<T>): Promise<T | null> {
  if (!Native) return null;
  try {
    return await run(Native);
  } catch (e) {
    //missing capture is expected
    if (!isPending(e)) console.warn(`[ScreenCapture] ${what} failed:`, e);
    return null;
  }
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export const ScreenCapture = {
  supported: (): boolean => Native != null,

  getSize: (): Promise<CaptureSize | null> => attempt('getSize', n => n.getScreenshotInfo()),

  //poll until capture lands
  async waitForSize(isCancelled: () => boolean, timeoutMs = CAPTURE_TIMEOUT_MS): Promise<CaptureSize | null> {
    const deadline = Date.now() + timeoutMs;
    while (!isCancelled()) {
      const size = await ScreenCapture.getSize();
      if (size) return size;
      if (Date.now() >= deadline) return null;
      await sleep(POLL_INTERVAL_MS);
    }
    return null;
  },

  //region as jpeg data uri
  crop: (region: CaptureRegion): Promise<string | null> =>
    attempt('crop', n => n.cropRegion(region.x, region.y, region.w, region.h)),

  //native square model input
  async getDetectionInput(size: number): Promise<DetectionInput | null> {
    if (typeof Native?.getDetectionInput !== 'function') return null;
    return attempt('getDetectionInput', n => n.getDetectionInput!(size));
  },

  //native selectable blocks over the capture
  async showTextLayer(): Promise<void> {
    if (typeof Native?.showTextLayer !== 'function') return;
    await attempt('showTextLayer', n => n.showTextLayer!());
  },

  async scanCodes(): Promise<ScreenCode[] | null> {
    if (typeof Native?.scanCodes !== 'function') return null;
    return attempt('scanCodes', n => n.scanCodes!());
  },

  //foreground package and accessibility text
  async getAppContext(): Promise<AppContext | null> {
    if (typeof Native?.getAppContext !== 'function') return null;
    return attempt('getAppContext', n => n.getAppContext!());
  },

  async getAppIcon(pkg: string): Promise<AppIcon | null> {
    if (typeof Native?.getAppIcon !== 'function') return null;
    try {
      return await Native.getAppIcon(pkg);
    } catch {
      //package likely gone
      return null;
    }
  },

  clearText(): void {
    try {
      Native?.clearTextLayer?.();
    } catch (e) {
      console.warn('[ScreenCapture] clearText failed:', e);
    }
  },

  //close overlay keep app alive
  close(): void {
    try {
      Native?.closeOverlay();
    } catch (e) {
      console.warn('[ScreenCapture] close failed:', e);
    }
  },
};
