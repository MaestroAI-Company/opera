import { useEffect, useState } from 'react';
import { AppState, InteractionManager } from 'react-native';
import { ScreenCapture, ScreenCode } from './screenCapture';

const NO_CODES: ScreenCode[] = [];

type Found = { session: number; codes: ScreenCode[] };

export function useScreenText(session: number, enabled: boolean) {
  const [found, setFound] = useState<Found | null>(null);

  useEffect(() => {
    //no screen access no ocr
    if (!enabled) return;
    let cancelled = false;
    //codes unread when overlay hidden
    const appState = AppState.addEventListener('change', state => {
      if (state !== 'active') cancelled = true;
    });

    const task = InteractionManager.runAfterInteractions(async () => {
      const size = await ScreenCapture.waitForSize(() => cancelled);
      if (!size || cancelled) return;

      const startedAt = Date.now();
      await ScreenCapture.showTextLayer();
      //skip the second ml kit pass
      if (cancelled) return;
      const codes = await ScreenCapture.scanCodes();
      if (cancelled) return;

      console.log(`[OCR] ${codes?.length ?? 0} codes in ${Date.now() - startedAt} ms`);
      setFound({ session, codes: codes ?? NO_CODES });
    });

    return () => {
      cancelled = true;
      appState.remove();
      task.cancel();
    };
  }, [session, enabled]);

  //stale capture text dropped
  const current = found?.session === session ? found : null;
  return { codes: current?.codes ?? NO_CODES };
}