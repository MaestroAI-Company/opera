import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { Settings } from '../settings/SettingsService';
import { isTauri } from '../platform';

//applied once so opt-out sticks
const DEFAULTED_KEY = 'launchAtStartupDefaulted';

export async function getLaunchAtStartup(): Promise<boolean> {
  return isTauri && (await isEnabled());
}

export async function setLaunchAtStartup(enabled: boolean): Promise<void> {
  if (enabled) await enable();
  else await disable();
}

//dev build would register debug binary
export async function applyLaunchAtStartupDefault(): Promise<void> {
  if (!isTauri || __DEV__) return;
  if ((await Settings.getLocal(DEFAULTED_KEY)) === 'true') return;
  await enable();
  await Settings.setLocal(DEFAULTED_KEY, 'true');
}
