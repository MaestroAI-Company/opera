import { useEffect, useState } from 'react';
import { ScreenCapture } from './screenCapture';

//android settings may block screen
export function useScreenAccess(session: number): boolean {
  const [found, setFound] = useState<{ session: number; allowed: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    ScreenCapture.screenAccessAllowed().then(allowed => {
      if (cancelled) return;
      //selection needs screen access
      if (!allowed) console.warn('[ScreenCapture] screen access is off in the android assistant settings');
      setFound({ session, allowed });
    });
    return () => { cancelled = true; };
  }, [session]);

  //stale answer dropped
  return found?.session === session ? found.allowed : false;
}
