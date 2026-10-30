import { invoke } from '@tauri-apps/api/core';
import type { CaptureRegion } from './screenCapture';

export const DesktopDetector = {
  //gpu compile takes seconds
  prepare(): void {
    invoke('stage_prepare_detector').catch(e => console.warn('[Detector] desktop model failed to load', e));
  },

  async detect(): Promise<CaptureRegion[] | null> {
    try {
      return await invoke<CaptureRegion[] | null>('stage_detect');
    } catch (e) {
      console.warn('[Detector] desktop detection failed', e);
      return null;
    }
  },
};
