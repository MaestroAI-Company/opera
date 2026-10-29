import { useEffect, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import NotificationModal from '../ui/NotificationModal';
import { useT } from '../../i18n';
import { AppEvents } from '../../services/events';
import { OverlayPresence } from '../../services/overlay/overlayPresence';

//confirms a saved code file
export default function CodeDownloadHost({ inOverlay = false }: { inOverlay?: boolean }) {
  const t = useT();
  //name stays during the fade out
  const [filename, setFilename] = useState('');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(AppEvents.codeDownloaded, (name: string) => {
      //app and overlay share runtime, only the visible one answers
      if (OverlayPresence.isShown() !== inOverlay) return;
      setFilename(name);
      setVisible(true);
    });
    return () => sub.remove();
  }, [inOverlay]);

  return (
    <NotificationModal
      visible={visible}
      title={t('codeDownload.title')}
      message={t('codeDownload.message', { name: filename })}
      onClose={() => setVisible(false)}
    />
  );
}
