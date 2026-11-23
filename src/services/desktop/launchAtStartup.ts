import { invoke } from '@tauri-apps/api/core';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { Settings } from '../settings/SettingsService';
import { isAppStore, isTauri } from '../platform';

//applied once so opt-out sticks
const DEFAULTED_KEY = 'launchAtStartupDefaulted';

export async function getLaunchAtStartup(): Promise<boolean> {
  if (!isTauri) return false;
  //sandbox needs the login item api
  return isAppStore ? invoke<boolean>('login_item_is_enabled') : isEnabled();
}

export async function setLaunchAtStartup(enabled: boolean): Promise<void> {
  if (isAppStore) await invoke('login_item_set', { enabled });
  else if (enabled) await enable();
  else await disable();
}

//dev build would register debug binary
export async function applyLaunchAtStartupDefault(): Promise<void> {
  if (!isTauri || __DEV__) return;
  //app review needs user consent first
  if (isAppStore) return;
  if ((await Settings.getLocal(DEFAULTED_KEY)) === 'true') return;
  await enable();
  await Settings.setLocal(DEFAULTED_KEY, 'true');
}
