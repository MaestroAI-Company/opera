import { useEffect, useState } from 'react';
import NotificationModal from '../ui/NotificationModal';
import { useT } from '../../i18n';
import { ConsentRequest, ToolConsent } from '../../services/ai/tools/ToolConsent';

export default function ToolConsentHost() {
  const t = useT();
  const [queue, setQueue] = useState<ConsentRequest[]>([]);
  const current = queue[0];

  useEffect(() => ToolConsent.attach(request => setQueue(q => [...q, request])), []);

  const answer = (granted: boolean) => {
    current?.resolve(granted);
    setQueue(q => q.slice(1));
  };

  return (
    <NotificationModal
      visible={!!current}
      title={current ? t(current.title) : undefined}
      message={current ? t(current.message) : undefined}
      buttons={[
        { text: t('tools.consent.decline'), onPress: () => answer(false), style: 'secondary' },
        { text: t('tools.consent.allow'), onPress: () => answer(true), style: 'primary' },
      ]}
      onClose={() => answer(false)}
    />
  );
}
