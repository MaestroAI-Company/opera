import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { AppRelease, getAvailableUpdate } from '../services/updates/UpdateService';

//notices atop the settings menu
export function useSettingsNotices(active: boolean) {
  const [update, setUpdate] = useState<AppRelease | null>(null);

  useEffect(() => {
    if (active) getAvailableUpdate().then(setUpdate).catch(() => { });
  }, [active]);

  const openUpdate = useCallback(() => {
    if (update) Linking.openURL(update.url).catch(() => { });
  }, [update]);

  return {
    update,
    openUpdate,
  };
}
