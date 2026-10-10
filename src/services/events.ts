//app-wide event names in one place
export const AppEvents = {
  //conversations or messages were written
  conversationsChanged: 'CONVERSATIONS_CHANGED',
  //a user setting was written
  settingsChanged: 'SETTINGS_CHANGED',
  syncCompleted: 'SYNC_COMPLETED',
  syncPinInvalidated: 'SYNC_PIN_INVALIDATED',
  overlayReopened: 'OVERLAY_REOPENED',
  //user left the overlay via home
  overlayLeaving: 'OVERLAY_LEAVING',
  //overlay shown or hidden
  overlayVisibility: 'OVERLAY_VISIBILITY',
  //a screen text selection is being dragged
  textSelectionDrag: 'TEXT_SELECTION_DRAG',
  openModelSelector: 'OPEN_MODEL_SELECTOR',
  openBugReport: 'OPEN_BUG_REPORT',
  //a chat code block was tapped
  openCodePreview: 'OPEN_CODE_PREVIEW',
  //mcp server state changed
  mcpServersChanged: 'MCP_SERVERS_CHANGED',
} as const;
