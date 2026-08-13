import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';
import { ITool, ToolDefinition } from './ITool';

const PANEL_ACTIONS: Record<string, IntentLauncher.ActivityAction> = {
  wifi: IntentLauncher.ActivityAction.WIFI_SETTINGS,
  bluetooth: IntentLauncher.ActivityAction.BLUETOOTH_SETTINGS,
  location: IntentLauncher.ActivityAction.LOCATION_SOURCE_SETTINGS,
  sound: IntentLauncher.ActivityAction.SOUND_SETTINGS,
  display: IntentLauncher.ActivityAction.DISPLAY_SETTINGS,
  battery: IntentLauncher.ActivityAction.BATTERY_SAVER_SETTINGS,
  apps: IntentLauncher.ActivityAction.APPLICATION_SETTINGS,
  date: IntentLauncher.ActivityAction.DATE_SETTINGS,
  nfc: IntentLauncher.ActivityAction.NFC_SETTINGS,
  accessibility: IntentLauncher.ActivityAction.ACCESSIBILITY_SETTINGS,
};

export class SystemSettingsTool implements ITool {
  displayName = 'Open System Settings Panel';
  displayDescription = 'Allow the assistant to open a specific Android settings panel, like WiFi or Bluetooth.';
  enabledByDefault = true;
  platforms: ITool['platforms'] = ['android'];

  definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'open_system_settings_panel',
      description:
        'Android only. Open a specific OS settings panel (WiFi, Bluetooth, etc.) rather than this app\'s own settings. ' +
        'Not available on iOS/web/desktop — explain the limitation to the user on those platforms.',
      parameters: {
        type: 'object',
        properties: {
          panel: {
            type: 'string',
            enum: Object.keys(PANEL_ACTIONS),
            description: 'Which settings panel to open.',
          },
        },
        required: ['panel'],
      },
    },
  };

  async execute(args: Record<string, any>): Promise<string> {
    if (Platform.OS !== 'android') {
      return 'This tool is Android-only.';
    }

    const panel = args.panel;
    const action = PANEL_ACTIONS[panel];
    if (!action) {
      return `Error: unknown panel "${panel}".`;
    }

    try {
      await IntentLauncher.startActivityAsync(action);
      return `Opened ${panel} settings.`;
    } catch (e: any) {
      return `Could not open ${panel} settings: ${e.message}`;
    }
  }
}
