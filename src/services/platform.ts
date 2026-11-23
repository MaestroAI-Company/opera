export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
//mac app store build flag
export const isAppStore = process.env.EXPO_PUBLIC_APP_STORE === '1';
