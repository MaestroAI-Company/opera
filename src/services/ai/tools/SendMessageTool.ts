import { Linking, Platform } from 'react-native';
import { ITool, ToolDefinition } from './ITool';

export class SendMessageTool implements ITool {
  displayName = 'Call, Text, or Email';
  displayDescription = 'Allow the assistant to call, text, or email a number/address by opening the appropriate app with it pre-filled.';
  enabledByDefault = true;

  definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'send_message',
      description:
        'Call, text (SMS), or email a specific phone number or email address by opening the appropriate app with the recipient ' +
        '(and message, for text/email) pre-filled. The user still has to hit send/call in that app — nothing is sent silently. ' +
        'If the user refers to a person by name or relationship (e.g. "maman", "my mom") rather than giving a number/address directly, ' +
        'call find_contact first to resolve it.',
      parameters: {
        type: 'object',
        properties: {
          method: {
            type: 'string',
            enum: ['call', 'text', 'email'],
            description: 'Whether to place a phone call, send an SMS, or send an email.',
          },
          to: {
            type: 'string',
            description: 'The phone number (for call/text) or email address (for email).',
          },
          subject: {
            type: 'string',
            description: 'Email subject. Only used when method is "email".',
          },
          body: {
            type: 'string',
            description: 'Pre-filled message body. Used for "text" and "email".',
          },
        },
        required: ['method', 'to'],
      },
    },
  };

  async execute(args: Record<string, any>): Promise<string> {
    const method = args.method;
    const to = args.to;
    if (!['call', 'text', 'email'].includes(method)) {
      return 'Error: "method" must be "call", "text", or "email".';
    }
    if (typeof to !== 'string' || to.trim().length === 0) {
      return 'Error: missing "to" (phone number or email address).';
    }

    try {
      if (method === 'call') {
        await Linking.openURL(`tel:${to}`);
        return `Opened dialer for ${to}.`;
      }

      if (method === 'text') {
        const body = typeof args.body === 'string' ? args.body : '';
        //platforms differ on the sms separator
        const separator = Platform.OS === 'ios' ? '&' : '?';
        const url = body ? `sms:${to}${separator}body=${encodeURIComponent(body)}` : `sms:${to}`;
        await Linking.openURL(url);
        return `Opened text message to ${to}.`;
      }

      const params = new URLSearchParams();
      if (typeof args.subject === 'string' && args.subject) params.set('subject', args.subject);
      if (typeof args.body === 'string' && args.body) params.set('body', args.body);
      const query = params.toString();
      await Linking.openURL(`mailto:${to}${query ? `?${query}` : ''}`);
      return `Opened email to ${to}.`;
    } catch (e: any) {
      return `Could not open ${method}: ${e.message}. The target app may not be installed.`;
    }
  }
}
