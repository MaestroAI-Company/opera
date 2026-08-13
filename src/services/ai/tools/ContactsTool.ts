import { ITool, ToolDefinition } from './ITool';
import { ContactsService } from '../../contacts/ContactsService';
import { SYSTEM_PROMPTS } from '../../../../constants/prompts';

export class ContactsTool implements ITool {
  displayName = 'Find Contact';
  displayDescription = 'Allow the assistant to search your device contacts by name or relationship (e.g. "mom") for phone numbers and emails.';
  enabledByDefault = false;
  platforms: ITool['platforms'] = ['ios', 'android'];

  definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'find_contact',
      description:
        "Look up a contact in the user's device contacts by name, nickname, or relationship/role " +
        '(e.g. "maman", "mom", "my brother", "boss") and return matching phone numbers/emails. ' +
        'Only call this when the user explicitly asks to look up, call, text, or email a specific person. ' +
        'Use the result with the send_message or open_app tool to actually reach them.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The name, nickname, or relationship word to resolve to a contact (e.g. "maman", "John").',
          },
        },
        required: ['query'],
      },
    },
  };

  async requestPermission(): Promise<boolean> {
    return ContactsService.requestPermission();
  }

  async execute(args: Record<string, any>, summarize?: (text: string, systemPrompt?: string) => Promise<string>): Promise<string> {
    const query = args.query;
    if (typeof query !== 'string' || query.trim().length === 0) {
      return 'Error: missing "query" to search for.';
    }

    try {
      if (!(await ContactsService.hasPermission())) {
        const granted = await ContactsService.requestPermission();
        if (!granted) {
          return 'Error: contacts permission denied. The user needs to re-enable it in Settings.';
        }
      }

      const contacts = await ContactsService.getAll();
      if (contacts.length === 0) {
        return 'The contact list is empty.';
      }

      const listText = contacts
        .map((c) => {
          const details = [c.phoneNumbers.join(', ') || 'no phone', ...(c.emails.length ? [c.emails.join(', ')] : [])];
          return `${c.name}: ${details.join(', ')}`;
        })
        .join('\n');

      //separate ai call resolves the query
      if (!summarize) {
        return listText;
      }
      return await summarize(`${listText}\n\nQuery: ${query}`, SYSTEM_PROMPTS.CONTACT_RESOLVE);
    } catch (e: any) {
      return `Contact lookup failed: ${e.message}`;
    }
  }
}
