import { invoke } from '@tauri-apps/api/core';
import type { AppSettings } from '../settings/schema';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
//overlay window loads with this flag
export const isOverlayWindow = isTauri && new URLSearchParams(window.location.search).get('window') === 'overlay';
const isMac = typeof navigator !== 'undefined' && navigator.userAgent?.includes('Mac');

//tauri accelerator ids with readable labels
export const OVERLAY_SHORTCUTS = [
  { id: 'CommandOrControl+Shift+Space', label: isMac ? 'Cmd + Shift + Space' : 'Ctrl + Shift + Space' },
  { id: 'Alt+Space', label: isMac ? 'Option + Space' : 'Alt + Space' },
  { id: 'CommandOrControl+Alt+Space', label: isMac ? 'Cmd + Option + Space' : 'Ctrl + Alt + Space' },
];

//rust keeps no settings of its own
export function pushDesktopOverlayConfig(s: Pick<AppSettings, 'overlayEnabled' | 'overlayShortcut' | 'closeToTray'>) {
  if (!isTauri) return;
  invoke('overlay_configure', {
    enabled: s.overlayEnabled,
    shortcut: s.overlayShortcut,
    closeToTray: s.closeToTray,
  }).catch(e => console.warn('Failed to configure desktop overlay', e));
}

//dialogs do not fit the overlay
export function forwardNoticeToMain(title?: string, message?: string) {
  invoke('overlay_forward_notice', { title: title ?? '', message: message ?? '' })
    .catch(e => console.warn('Failed to forward overlay notice', e));
}
