import { ITool, ToolDefinition, ToolWidget } from './ITool';
import { CalendarService } from '../../calendar/CalendarService';
import { Block, BlockContainer, BlockRow, BlockSymbol, Caption } from '../../../components/toolwidgets/ToolWidgetBlocks';

interface CalendarWidgetData {
  title: string;
  day: string;
  date: string;
  startTime: string;
  endTime: string;
}

const DEFAULT_LIST_DAYS = 14;

function formatEvent(e: { id: string; title: string; startDate: string; endDate: string; location: string | null }): string {
  const loc = e.location ? ` @ ${e.location}` : '';
  return `[${e.id}] ${e.title}: ${e.startDate} - ${e.endDate}${loc}`;
}

//event line gives title start end
const EVENT_RESULT_RE = /^(?:Created|Updated) event: \[[^\]]*\] ([\s\S]+?): (\S+) - (\S+)/;

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export class CalendarTool implements ITool {
  displayName = 'Calendar';
  displayDescription = 'Allow the assistant to check, create, update, and delete events in your calendar.';
  enabledByDefault = false;
  platforms: ITool['platforms'] = ['ios', 'android'];

  definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'calendar',
      description:
        'Check, create, update, or delete calendar events. ' +
        'Use "list" first to find an event and its id before using "update" or "delete". ' +
        'Dates must be ISO 8601 strings (e.g. "2026-08-12T15:00:00").',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'create', 'update', 'delete'],
            description: 'Which calendar operation to perform.',
          },
          eventId: {
            type: 'string',
            description: 'The id of the event to update or delete, obtained from a previous "list" call.',
          },
          title: {
            type: 'string',
            description: 'Event title. Required for "create".',
          },
          startDate: {
            type: 'string',
            description: 'Event start date/time as an ISO 8601 string. Required for "create".',
          },
          endDate: {
            type: 'string',
            description: 'Event end date/time as an ISO 8601 string. Required for "create".',
          },
          notes: {
            type: 'string',
            description: 'Optional event notes/description.',
          },
          location: {
            type: 'string',
            description: 'Optional event location.',
          },
          daysAhead: {
            type: 'number',
            description: `For "list": how many days ahead to search, default ${DEFAULT_LIST_DAYS}.`,
          },
        },
        required: ['action'],
      },
    },
  };

  async requestPermission(): Promise<boolean> {
    return CalendarService.requestPermission();
  }

  widget: ToolWidget<CalendarWidgetData> = {
    name: 'Calendar Widget',
    hasBorder: true,
    //single created or updated event shows
    build: (args, result) => {
      const match = result.match(EVENT_RESULT_RE);
      if (!match) return null;
      const start = new Date(match[2]);
      const end = new Date(match[3]);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
      const timeOpts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
      const monthName = capitalize(start.toLocaleDateString(undefined, { month: 'long' }));
      return {
        title: match[1],
        day: capitalize(start.toLocaleDateString(undefined, { weekday: 'long' })),
        date: `${start.getDate()} ${monthName}`,
        startTime: start.toLocaleTimeString(undefined, timeOpts),
        endTime: end.toLocaleTimeString(undefined, timeOpts),
      };
    },
    component: ({ data, incognito }) => (
      <BlockContainer>
        <Caption text={data.title} />
        <BlockRow>
          <Block text={data.day} filled serif incognito={incognito} />
        </BlockRow>
        {!!data.date && (
          <BlockRow>
            <Block text={data.date} />
          </BlockRow>
        )}
        <BlockRow>
          <Block text={data.startTime} />
          <BlockSymbol text="→" />
          <Block text={data.endTime} />
        </BlockRow>
      </BlockContainer>
    ),
  };

  async execute(args: Record<string, any>): Promise<string> {
    const action = args.action;
    if (!['list', 'create', 'update', 'delete'].includes(action)) {
      return 'Error: "action" must be "list", "create", "update", or "delete".';
    }

    try {
      if (!(await CalendarService.hasPermission())) {
        const granted = await CalendarService.requestPermission();
        if (!granted) {
          return 'Error: calendar permission denied. The user needs to re-enable it in Settings.';
        }
      }

      if (action === 'list') {
        const days = typeof args.daysAhead === 'number' && args.daysAhead > 0 ? args.daysAhead : DEFAULT_LIST_DAYS;
        const events = await CalendarService.listUpcoming(days);
        if (events.length === 0) return `No events in the next ${days} days.`;
        return events.map(formatEvent).join('\n');
      }

      if (action === 'create') {
        if (typeof args.title !== 'string' || args.title.trim().length === 0) {
          return 'Error: missing "title" for create.';
        }
        if (typeof args.startDate !== 'string' || typeof args.endDate !== 'string') {
          return 'Error: missing "startDate" or "endDate" for create.';
        }
        const startDate = new Date(args.startDate);
        const endDate = new Date(args.endDate);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return 'Error: "startDate"/"endDate" must be valid ISO 8601 dates.';
        }
        const event = await CalendarService.createEvent({
          title: args.title,
          startDate,
          endDate,
          notes: args.notes,
          location: args.location,
        });
        return `Created event: ${formatEvent(event)}`;
      }

      if (typeof args.eventId !== 'string' || args.eventId.trim().length === 0) {
        return `Error: missing "eventId" for ${action}.`;
      }

      if (action === 'update') {
        const patch: Record<string, any> = {};
        if (typeof args.title === 'string') patch.title = args.title;
        if (typeof args.notes === 'string') patch.notes = args.notes;
        if (typeof args.location === 'string') patch.location = args.location;
        if (typeof args.startDate === 'string') patch.startDate = new Date(args.startDate);
        if (typeof args.endDate === 'string') patch.endDate = new Date(args.endDate);
        if (__DEV__) {
          //spot wrong hour vs storage bug
          console.log('[CalendarTool] update requested startDate/endDate:', args.startDate, args.endDate);
        }
        const event = await CalendarService.updateEvent(args.eventId, patch);
        if (__DEV__) {
          console.log('[CalendarTool] update stored startDate/endDate:', event.startDate, event.endDate);
        }
        return `Updated event: ${formatEvent(event)}`;
      }

      await CalendarService.deleteEvent(args.eventId);
      return `Deleted event ${args.eventId}.`;
    } catch (e: any) {
      console.error('[CalendarTool] error:', e?.message || e);
      return `Calendar error: ${e.message}`;
    }
  }
}
