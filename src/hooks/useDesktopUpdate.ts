import { useCallback, useState } from 'react';
import type { NotificationModalProps } from '../components/ui/NotificationModal';
import { t } from '../i18n';
import { openExternalUrl } from '../services/ai/utils/openExternalUrl';
import { AppRelease, installDesktopUpdate } from '../services/updates/UpdateService';

//release page is the fallback
export function useDesktopUpdate() {
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [installing, setInstalling] = useState(false);

  const close = useCallback(() => setRelease(null), []);

  const install = useCallback(async (target: AppRelease) => {
    setInstalling(true);
    try {
      //success restarts the app
      await installDesktopUpdate(target);
    } catch (e) {
      console.warn('[useDesktopUpdate] install failed:', e);
      openExternalUrl(target.url).catch(() => { });
    }
    setInstalling(false);
    setRelease(null);
  }, []);

  const modalProps: NotificationModalProps = {
    visible: !!release,
    title: t('update.title'),
    message: release
      ? t(installing ? 'update.installing' : 'update.message', { version: release.version })
      : undefined,
    loading: installing,
    //backdrop must not cancel install
    onClose: installing ? () => { } : close,
    buttons: release
      ? [
        { text: t('update.later'), onPress: close, style: 'secondary' },
        { text: t('update.install'), onPress: () => install(release), style: 'primary' },
      ]
      : undefined,
  };

  return { prompt: setRelease, modalProps };
}
