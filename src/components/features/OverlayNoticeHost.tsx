import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';
import NotificationModal from '../ui/NotificationModal';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

//dialogs raised in the overlay
export default function OverlayNoticeHost() {
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    if (!isTauri) return;
    const sub = listen<[string, string]>('overlay-notice', e => {
      const [title, message] = e.payload;
      setNotice({ title, message });
    });
    return () => { sub.then(un => un()); };
  }, []);

  return (
    <NotificationModal
      visible={!!notice}
      title={notice?.title || undefined}
      message={notice?.message || undefined}
      onClose={() => setNotice(null)}
    />
  );
}
