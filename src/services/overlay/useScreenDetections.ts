import { useEffect, useState } from 'react';
import { AppState, InteractionManager } from 'react-native';
import { ObjectDetector } from './objectDetector';
import { CaptureRegion, ScreenCapture } from './screenCapture';

const NONE: CaptureRegion[] = [];

//capture ui boxes guide selection
export function useScreenDetections(session: number, enabled: boolean): CaptureRegion[] {
  const [found, setFound] = useState<{ session: number; boxes: CaptureRegion[] } | null>(null);

  useEffect(() => {
    //no screen access no detector
    if (!enabled) return;
    //load during entry and capture
    ObjectDetector.prepare();
    let cancelled = false;
    //boxes unread when overlay hidden
    const appState = AppState.addEventListener('change', state => {
      //brief pause resumes after prompt
      cancelled = state !== 'active';
    });

    const task = InteractionManager.runAfterInteractions(async () => {
      //one analysis after capture lands
      const size = await ScreenCapture.waitForSize(() => cancelled);
      if (!size || cancelled) return;
      const boxes = await ObjectDetector.detect();
      if (boxes && boxes.length > 0 && !cancelled) setFound({ session, boxes });
    });

    return () => {
      cancelled = true;
      appState.remove();
      task.cancel();
    };
  }, [session, enabled]);

  //stale capture boxes dropped
  return found?.session === session ? found.boxes : NONE;
}
