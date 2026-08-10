import { useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';
import { ObjectDetector } from './objectDetector';
import { CaptureRegion, ScreenCapture } from './screenCapture';

const NONE: CaptureRegion[] = [];

//capture ui boxes guide selection
export function useScreenDetections(session: number): CaptureRegion[] {
  const [found, setFound] = useState<{ session: number; boxes: CaptureRegion[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    //cold load overlaps capture wait
    ObjectDetector.prepare();

    const task = InteractionManager.runAfterInteractions(async () => {
      //one analysis after capture lands
      const size = await ScreenCapture.waitForSize(() => cancelled);
      if (!size || cancelled) return;
      const boxes = await ObjectDetector.detect();
      if (boxes && !cancelled) setFound({ session, boxes });
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [session]);

  //stale capture boxes dropped
  return found?.session === session ? found.boxes : NONE;
}
