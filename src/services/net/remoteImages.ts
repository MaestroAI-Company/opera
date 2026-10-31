import { Settings } from '../settings/SettingsService';

//urls the user revealed this session
const revealed = new Set<string>();

//shared consent gate for images
export const RemoteImages = {
  isAllowed(url: string): boolean {
    return Settings.getCached().showRemoteImages || revealed.has(url);
  },
  allow(url: string): void {
    revealed.add(url);
  },
};
