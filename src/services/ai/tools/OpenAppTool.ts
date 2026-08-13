import { Linking } from 'react-native';
import { ITool, ToolDefinition } from './ITool';

//never open these schemes
//handled by the send_message tool
const BLOCKED_SCHEME = /^\s*(javascript|data|file|vbscript|tel|sms|mailto):/i;

export class OpenAppTool implements ITool {
  displayName = 'Open App or Link';
  displayDescription = 'Allow the assistant to open a website, app, or maps link.';
  enabledByDefault = true;

  definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'open_app',
      description:
        'Open a URL, which launches the appropriate app: ' +
        'https:// or http:// for websites, geo:<lat>,<lon>?q=<lat>,<lon>(<label>) to drop a map pin, ' +
        'https://www.google.com/maps/dir/?api=1&destination=<query> for turn-by-turn directions. ' +
        'Custom app schemes (e.g. spotify:, whatsapp://) may also be attempted, but fail gracefully if the app is not installed. ' +
        'To call, text, or email someone, use the send_message tool instead.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL or scheme to open.',
          },
        },
        required: ['url'],
      },
    },
  };

  async execute(args: Record<string, any>): Promise<string> {
    const url = args.url;
    if (typeof url !== 'string' || url.trim().length === 0) {
      return 'Error: missing "url".';
    }
    if (BLOCKED_SCHEME.test(url)) {
      return 'Error: this URL scheme is not allowed.';
    }

    try {
      await Linking.openURL(url);
      return `Opened: ${url}`;
    } catch (e: any) {
      return `Could not open "${url}": ${e.message}. The target app may not be installed.`;
    }
  }
}
