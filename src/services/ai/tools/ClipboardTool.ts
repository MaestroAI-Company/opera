import * as Clipboard from 'expo-clipboard';
import { ITool, ToolDefinition } from './ITool';

export class ClipboardTool implements ITool {
  displayName = 'Clipboard';
  displayDescription = 'Allow the assistant to copy text to the clipboard or read what is currently copied.';
  enabledByDefault = true;

  definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'clipboard',
      description:
        "Copy text to the device clipboard, or read the clipboard's current text contents. " +
        'Use "copy" when the user asks to copy something, and "read" when the user asks what is currently copied or refers to something they just copied.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['copy', 'read'],
            description: 'Whether to copy text to the clipboard or read its current contents.',
          },
          text: {
            type: 'string',
            description: 'The text to copy. Required when action is "copy", ignored for "read".',
          },
        },
        required: ['action'],
      },
    },
  };

  async execute(args: Record<string, any>): Promise<string> {
    const action = args.action;
    if (action !== 'copy' && action !== 'read') {
      return 'Error: "action" must be "copy" or "read".';
    }

    try {
      if (action === 'copy') {
        const text = args.text;
        if (typeof text !== 'string' || text.length === 0) {
          return 'Error: missing "text" to copy.';
        }
        await Clipboard.setStringAsync(text);
        const preview = text.length > 120 ? `${text.slice(0, 120)}…` : text;
        return `Copied to clipboard: "${preview}"`;
      }

      const text = await Clipboard.getStringAsync();
      return text ? `Clipboard contents: "${text}"` : 'Clipboard is empty.';
    } catch (e: any) {
      console.error('[ClipboardTool] error:', e?.message || e);
      return `Clipboard error: ${e.message}`;
    }
  }
}
