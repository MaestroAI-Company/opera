import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CaptureRegion, ScreenCapture } from './screenCapture';

export type SelectionRegion = CaptureRegion;

export type Selection =
  | { kind: 'none' }
  | { kind: 'box'; region: SelectionRegion };

//what the chat bar sends
export type SelectionAttachment = { uri: string; label: string };

export const FULL_SCREEN: SelectionRegion = { x: 0, y: 0, w: 1, h: 1 };

export function isFullScreen(region: SelectionRegion): boolean {
  return region.x <= 0.001 && region.y <= 0.001 && region.w >= 0.999 && region.h >= 0.999;
}

type State = {
  session: number;
  selection: Selection;
  attachment: SelectionAttachment | null;
};

const blank = (session: number): State => ({ session, selection: { kind: 'none' }, attachment: null });

//selection to chat attachment
export function useScreenSelection(session: number) {
  const [state, setState] = useState<State>(() => blank(session));

  //full screen cached for instant pick
  const fullScreenUri = useRef<string | null>(null);
  //only the newest crop may land
  const cropId = useRef(0);

  //stale capture state dropped
  const current = useMemo(() => (state.session === session ? state : blank(session)), [state, session]);

  const patch = useCallback((changes: Partial<State>) => {
    setState(prev => ({ ...(prev.session === session ? prev : blank(session)), ...changes, session }));
  }, [session]);

  useEffect(() => {
    let cancelled = false;
    cropId.current++;
    fullScreenUri.current = null;

    ScreenCapture.waitForSize(() => cancelled).then(size => {
      if (cancelled) return;
      if (!size) {
        console.warn('[ScreenCapture] no capture arrived, selection stays unavailable');
        return;
      }
      //warm cache once capture lands
      return ScreenCapture.crop(FULL_SCREEN).then(uri => {
        if (!cancelled && uri) fullScreenUri.current = uri;
      });
    });

    return () => { cancelled = true; };
  }, [session]);

  const select = useCallback((next: Selection) => {
    const id = ++cropId.current;

    if (next.kind === 'none') {
      patch({ selection: next, attachment: null });
      return;
    }
    //keep old thumb until crop
    patch({ selection: next });

    const full = isFullScreen(next.region);
    const label = full ? 'Full screen' : 'Selection';
    if (full && fullScreenUri.current) {
      patch({ attachment: { uri: fullScreenUri.current, label } });
      return;
    }

    ScreenCapture.crop(next.region).then(uri => {
      //newer selection already replaced
      if (id !== cropId.current || !uri) return;
      if (full) fullScreenUri.current = uri;
      patch({ attachment: { uri, label } });
    });
  }, [patch]);

  const clear = useCallback(() => {
    cropId.current++;
    patch({ selection: { kind: 'none' }, attachment: null });
  }, [patch]);

  return { selection: current.selection, attachment: current.attachment, select, clear };
}
