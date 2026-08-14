import { ITool, ToolDefinition, ToolWidget } from './ITool';
import { ContactResult, ContactsService } from '../../contacts/ContactsService';
import { SYSTEM_PROMPTS } from '../../../../constants/prompts';
import { Block, BlockContainer, BlockRow, Caption } from '../../../components/toolwidgets/ToolWidgetBlocks';

interface ContactWidgetData {
  label: string;
  name: string;
  phone?: string;
  email?: string;
}

//caption echoes the user's query
function buildLabel(query: unknown): string {
  const clean = typeof query === 'string' ? query.trim() : '';
  if (clean.length === 0) return 'Contact found';
  return `${clean.charAt(0).toUpperCase()}${clean.slice(1)} found`;
}

//match answer to existing contact
function resolveContact(contacts: ContactResult[], answer: string): Omit<ContactWidgetData, 'label'> | null {
  const clean = answer.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').toLowerCase();
  const named = contacts.filter(c => c.name.trim().length > 0 && clean.includes(c.name.toLowerCase()));
  if (named.length === 0) return null;

  //longest name contains the shorter ones
  const best = named.reduce((a, b) => (b.name.length > a.name.length ? b : a));
  const bestName = best.name.toLowerCase();
  if (named.some(c => !bestName.includes(c.name.toLowerCase()))) return null;

  return { name: best.name, phone: best.phoneNumbers[0], email: best.emails[0] };
}

export class ContactsTool implements ITool {
  displayName = 'Contact';
  displayDescription = 'Allow the assistant to search your device contacts by name or relationship (e.g. "mom") for phone numbers and emails.';
  enabledByDefault = false;
  platforms: ITool['platforms'] = ['ios', 'android'];

  definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'contact',
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

  //contact resolved during the last execute
  private resolved: Omit<ContactWidgetData, 'label'> | null = null;

  widget: ToolWidget<ContactWidgetData> = {
    name: 'Contact Widget',
    hasBorder: true,
    build: (args) => (this.resolved ? { label: buildLabel(args.query), ...this.resolved } : null),
    component: ({ data }) => (
      <BlockContainer>
        <Caption text={data.label} />
        <BlockRow>
          <Block text={data.name} filled serif />
        </BlockRow>
        {!!data.phone && (
          <BlockRow>
            <Block text={data.phone} />
          </BlockRow>
        )}
        {!!data.email && (
          <BlockRow>
            <Block text={data.email} />
          </BlockRow>
        )}
      </BlockContainer>
    ),
  };

  async execute(args: Record<string, any>, summarize?: (text: string, systemPrompt?: string) => Promise<string>): Promise<string> {
    this.resolved = null;
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
      const answer = await summarize(`${listText}\n\nQuery: ${query}`, SYSTEM_PROMPTS.CONTACT_RESOLVE);
      this.resolved = resolveContact(contacts, answer);
      return answer;
    } catch (e: any) {
      console.error('[ContactsTool] error:', e?.message || e);
      return `Contact lookup failed: ${e.message}`;
    }
  }
}
