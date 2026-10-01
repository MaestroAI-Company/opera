import { Platform } from 'react-native';
import { ITool, ToolDefinition } from './ITool';
import { isTauri } from '../../platform';
import { openExternalUrl } from '../utils/openExternalUrl';

export class SendMessageTool implements ITool {
  displayName = 'Communications';
  displayDescription = 'Allow the assistant to launch calls, texts, or emails with pre-filled contact details.';
  enabledByDefault = true;

  definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'send_message',
      description:
        'Call, text (SMS), or email a specific phone number or email address by opening the appropriate app with the recipient ' +
        '(and message, for text/email) pre-filled. The user still has to hit send/call in that app — nothing is sent silently. ' +
        'If the user refers to a person by name or relationship (e.g. "maman", "my mom") rather than giving a number/address directly, ' +
        'call contact first to resolve it.',
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

    if (method === 'call') {
      await openExternalUrl(`tel:${to}`);
      return `Opened the dialer for ${to}. The user still has to place the call.`;
    }

    if (method === 'text') {
      //no sms handler on desktop
      if (isTauri) throw new Error('SMS is not supported on desktop');
      const body = typeof args.body === 'string' ? args.body : '';
      //platforms differ on the sms separator
      const separator = Platform.OS === 'ios' ? '&' : '?';
      const url = body ? `sms:${to}${separator}body=${encodeURIComponent(body)}` : `sms:${to}`;
      await openExternalUrl(url);
      return `Opened a text message draft to ${to}. The user still has to send it.`;
    }

    const params = new URLSearchParams();
    if (typeof args.subject === 'string' && args.subject) params.set('subject', args.subject);
    if (typeof args.body === 'string' && args.body) params.set('body', args.body);
    const query = params.toString();
    await openExternalUrl(`mailto:${to}${query ? `?${query}` : ''}`);
    return `Opened an email draft to ${to}. The user still has to send it.`;
  }
}
