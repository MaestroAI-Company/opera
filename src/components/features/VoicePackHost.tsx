import { useEffect, useState } from 'react';
import NotificationModal from '../ui/NotificationModal';
import { useT } from '../../i18n';
import { formatBytes } from '../../services/ai/providers/huggingFaceCatalog';
import { Settings } from '../../services/settings/SettingsService';
import { install, NEURAL_ENGINES } from '../../services/speech/engines';
import { VoicePack } from '../../services/speech/VoicePack';

//offers voice pack before system speech
export default function VoicePackHost() {
  const t = useT();
  const [resolve, setResolve] = useState<(() => void) | null>(null);
  const [result, setResult] = useState<'installed' | 'failed' | null>(null);

  useEffect(() => VoicePack.attach((r) => setResolve(() => r)), []);

  const answer = (choice: 'install' | 'system' | null) => {
    const engineId = Settings.getCached().ttsEngine;
    if (choice === 'system') Settings.set('ttsEngine', 'system');
    if (choice === 'install') {
      install(engineId)
        .then(() => setResult('installed'))
        .catch((e) => {
          console.error('Failed to download voice pack', e);
          setResult('failed');
        });
    }
    //speech continues with system voice
    resolve?.();
    setResolve(null);
  };

  const sizeBytes = NEURAL_ENGINES[Settings.getCached().ttsEngine]?.sizeBytes ?? 0;

  return (
    <>
      <NotificationModal
        visible={!!resolve}
        title={t('settings.tts.voicePack.title')}
        message={t('settings.tts.voicePack.message', { size: formatBytes(sizeBytes) })}
        buttons={[
          { text: t('settings.tts.voicePack.system'), onPress: () => answer('system'), style: 'secondary' },
          { text: t('settings.tts.voicePack.install'), onPress: () => answer('install'), style: 'primary' },
        ]}
        onClose={() => answer(null)}
      />
      <NotificationModal
        visible={!!result}
        title={result === 'installed' ? t('common.success') : t('common.error')}
        message={result === 'installed' ? t('settings.tts.voicePack.installed') : t('settings.tts.voicePack.failed')}
        onClose={() => setResult(null)}
      />
    </>
  );
}
