import * as Clipboard from 'expo-clipboard';
import { ITool, ToolDefinition } from './ITool';
import { isTauri } from '../../platform';

//webview clipboard api is unreliable
async function writeText(text: string): Promise<boolean> {
  if (!isTauri) return Clipboard.setStringAsync(text);
  const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
  await writeText(text);
  return true;
}

async function readText(): Promise<string> {
  if (!isTauri) return Clipboard.getStringAsync();
  const { readText } = await import('@tauri-apps/plugin-clipboard-manager');
  return readText();
}

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

    if (action === 'copy') {
      const text = args.text;
      if (typeof text !== 'string' || text.length === 0) {
        return 'Error: missing "text" to copy.';
      }
      //web returns false instead of throwing
      if (!(await writeText(text))) throw new Error('could not write to the clipboard');
      const preview = text.length > 120 ? `${text.slice(0, 120)}…` : text;
      return `Copied to clipboard: "${preview}"`;
    }

    const text = await readText();
    return text ? `Clipboard contents: "${text}"` : 'Clipboard is empty.';
  }
}
