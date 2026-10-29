import { Platform } from 'react-native';
import { CloudSync } from './CloudSyncService';
import { HubSync } from './hub/HubSync';
import { McpService } from './mcp/McpService';
import { PluginRegistry } from './plugins/PluginRegistry';
import { isTauri } from './platform';
import { Settings } from './settings/SettingsService';

//desktop shells show settings in their own os window
export const settingsInWindow = isTauri && Platform.OS === 'web';

const CLOSED_EVENT = 'settings-window-closed';
const DATA_EVENT = 'settings-data-changed';
const NAVIGATE_EVENT = 'settings-navigate';

//opens the window or brings the open one forward
export async function openSettingsWindow(page: string | null, pairLink: string | null): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('open_settings_window', { page: page === 'main' ? null : page, pair: pairLink });
}

//main window reads what the settings window changed in storage
export async function refreshFromSettingsWindow(): Promise<void> {
  await Settings.load();
  await PluginRegistry.loadAll();
  await McpService.reload();
  await CloudSync.reload();
  await HubSync.readCached();
}

//main window side, returns the cleanup
export async function watchSettingsWindow(
  windowOpened: () => boolean,
  onClosed: () => void,
  onDataChanged: () => void,
): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  const { getCurrentWindow } = await import('@tauri-apps/api/window');

  const stops = await Promise.all([
    listen(CLOSED_EVENT, async () => {
      await refreshFromSettingsWindow().catch((e) => console.warn('settings refresh failed', e));
      onClosed();
    }),
    listen(DATA_EVENT, () => onDataChanged()),
    //back from the settings window, catch what no event announced
    getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (focused && windowOpened()) {
        refreshFromSettingsWindow().catch((e) => console.warn('settings refresh failed', e));
      }
    }),
  ]);
  return () => stops.forEach((stop) => stop());
}

//settings window side
export async function closeSettingsWindow(): Promise<void> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().close();
}

export async function notifyDataChanged(): Promise<void> {
  const { emit } = await import('@tauri-apps/api/event');
  await emit(DATA_EVENT);
}

//the open window gets a new target page or pairing link
export async function onSettingsNavigate(
  handler: (page: string | null, pairLink: string | null) => void,
): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event');
  return listen<[string | null, string | null]>(NAVIGATE_EVENT, ({ payload }) => handler(payload[0], payload[1]));
}
