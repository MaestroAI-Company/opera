import { Linking } from 'react-native';
import { isTauri } from '../../platform';

//rn-web linking always resolves under tauri
export async function openExternalUrl(url: string): Promise<void> {
  if (isTauri) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return;
  }
  await Linking.openURL(url);
}
