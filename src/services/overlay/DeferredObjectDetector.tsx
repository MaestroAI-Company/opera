import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { useObjectDetector, ObjectDetectorConfig } from './useObjectDetector';
import { YoloDetection } from './yoloPostprocess';

type Props = {
  config: ObjectDetectorConfig;
  session: number;
  onDetections: (d: YoloDetection[]) => void;
};

//isolates the yolo hook so its model load only starts when this component mounts
//the parent mounts us after the entry animation, which keeps the overlay pop-in smooth
//while still guaranteeing the model actually loads (unlike a preventLoad flip that
//never re-fires the internal useEffect in some react commit orderings)
export default function DeferredObjectDetector({ config, session, onDetections }: Props) {
  const { isReady, error, detect } = useObjectDetector(config);

  useEffect(() => {
    if (!isReady || error) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    //the screenshot arrives asynchronously via the assist api and can land after
    //the model is ready. retry a few times so late-arriving screenshots still get boxes
    const attempt = (tries: number) => {
      if (cancelled) return;
      detect()
        .then(ds => {
          if (cancelled) return;
          if (ds.length === 0 && tries > 0) {
            retryTimer = setTimeout(() => attempt(tries - 1), 400);
            return;
          }
          onDetections(ds);
        })
        .catch(e => { if (!cancelled) console.warn('[ObjectDetector] analysis failed', e); });
    };

    const handle = InteractionManager.runAfterInteractions(() => attempt(3));
    return () => {
      cancelled = true;
      handle.cancel();
      if (retryTimer) clearTimeout(retryTimer);
    };
    //session bump forces a fresh analysis on overlay reopen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, error, detect, session]);

  return null;
}
