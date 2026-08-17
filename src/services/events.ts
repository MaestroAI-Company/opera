//app-wide event names in one place
export const AppEvents = {
  //conversations or messages were written
  conversationsChanged: 'CONVERSATIONS_CHANGED',
  //a user setting was written
  settingsChanged: 'SETTINGS_CHANGED',
  syncCompleted: 'SYNC_COMPLETED',
  syncPinInvalidated: 'SYNC_PIN_INVALIDATED',
  overlayReopened: 'OVERLAY_REOPENED',
  openModelSelector: 'OPEN_MODEL_SELECTOR',
} as const;
