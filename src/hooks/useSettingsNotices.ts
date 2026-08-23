import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { dismissAssistantPrompt, openAssistantSettings, shouldOfferAssistantRole } from '../services/assistant/DefaultAssistant';
import { AppRelease, getAvailableUpdate } from '../services/updates/UpdateService';

//notices atop the settings menu
export function useSettingsNotices(active: boolean) {
  const [update, setUpdate] = useState<AppRelease | null>(null);
  const [assistant, setAssistant] = useState(false);

  const refresh = useCallback(() => {
    getAvailableUpdate().then(setUpdate).catch(() => { });
    shouldOfferAssistantRole().then(setAssistant).catch(() => { });
  }, []);

  useEffect(() => {
    if (active) refresh();
  }, [active, refresh]);

  //role may have changed in settings
  useEffect(() => {
    if (!active) return;
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [active, refresh]);

  const openUpdate = useCallback(() => {
    if (update) Linking.openURL(update.url).catch(() => { });
  }, [update]);

  const closeAssistant = useCallback(() => {
    dismissAssistantPrompt().catch(() => { });
    setAssistant(false);
  }, []);

  return {
    update,
    assistant,
    openUpdate,
    openAssistant: openAssistantSettings,
    closeAssistant,
  };
}
