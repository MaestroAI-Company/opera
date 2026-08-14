import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';
import { ITool, ToolDefinition, ToolWidget } from './ITool';
import { Block, BlockContainer, BlockRow, Caption } from '../../../components/toolwidgets/ToolWidgetBlocks';

interface AlarmWidgetData {
  label: string;
  value: string;
  note?: string;
}

//duration like 45s or 1h30
function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}min`;
  return minutes === 0 ? `${hours}h` : `${hours}h${String(minutes).padStart(2, '0')}`;
}

export class AlarmTool implements ITool {
  displayName = 'Timer';
  displayDescription = 'Allow the assistant to open the Clock app with an alarm or timer pre-filled for you to confirm.';
  enabledByDefault = true;
  platforms: ITool['platforms'] = ['android'];

  definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'timer',
      description:
        'Android only. Open the Clock app to set an alarm or a timer. The user still confirms in the Clock app — nothing is set silently. ' +
        'Use "set_alarm" with an hour/minute, or "set_timer" with a duration in seconds.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['set_alarm', 'set_timer'],
            description: 'Whether to set an alarm at a specific time or a countdown timer.',
          },
          hour: {
            type: 'number',
            description: 'Hour of day (0-23) for the alarm. Required for "set_alarm".',
          },
          minute: {
            type: 'number',
            description: 'Minute (0-59) for the alarm. Required for "set_alarm".',
          },
          seconds: {
            type: 'number',
            description: 'Duration in seconds for the timer. Required for "set_timer".',
          },
          message: {
            type: 'string',
            description: 'Optional label shown for the alarm or timer.',
          },
        },
        required: ['action'],
      },
    },
  };

  widget: ToolWidget<AlarmWidgetData> = {
    name: 'Alarm Widget',
    hasBorder: true,
    build: (args, result) => {
      //widget only for a real launch
      if (!result.startsWith('Opened Clock app')) return null;
      const note = typeof args.message === 'string' && args.message.trim().length > 0 ? args.message.trim() : undefined;

      if (args.action === 'set_alarm') {
        const value = `${String(args.hour).padStart(2, '0')}h${String(args.minute).padStart(2, '0')}`;
        return { label: 'Alarm set for', value, note };
      }
      return { label: 'Timer set for', value: formatDuration(args.seconds), note };
    },
    component: ({ data }) => (
      <BlockContainer>
        <Caption text={data.label} />
        <BlockRow>
          <Block text={data.value} filled serif />
        </BlockRow>
        {!!data.note && (
          <BlockRow>
            <Block text={data.note} />
          </BlockRow>
        )}
      </BlockContainer>
    ),
  };

  async execute(args: Record<string, any>): Promise<string> {
    if (Platform.OS !== 'android') {
      return 'This tool is Android-only.';
    }

    const action = args.action;
    if (action !== 'set_alarm' && action !== 'set_timer') {
      return 'Error: "action" must be "set_alarm" or "set_timer".';
    }

    try {
      if (action === 'set_alarm') {
        const hour = args.hour;
        const minute = args.minute;
        if (typeof hour !== 'number' || hour < 0 || hour > 23 || typeof minute !== 'number' || minute < 0 || minute > 59) {
          return 'Error: "hour" (0-23) and "minute" (0-59) are required for set_alarm.';
        }
        await IntentLauncher.startActivityAsync('android.intent.action.SET_ALARM', {
          extra: {
            'android.intent.extra.alarm.HOUR': hour,
            'android.intent.extra.alarm.MINUTES': minute,
            ...(args.message ? { 'android.intent.extra.alarm.MESSAGE': args.message } : {}),
          },
        });
        return `Opened Clock app to set an alarm at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}.`;
      }

      const seconds = args.seconds;
      if (typeof seconds !== 'number' || seconds <= 0) {
        return 'Error: "seconds" (a positive number) is required for set_timer.';
      }
      await IntentLauncher.startActivityAsync('android.intent.action.SET_TIMER', {
        extra: {
          'android.intent.extra.alarm.LENGTH': seconds,
          ...(args.message ? { 'android.intent.extra.alarm.MESSAGE': args.message } : {}),
        },
      });
      return `Opened Clock app to set a ${seconds}s timer.`;
    } catch (e: any) {
      console.error('[AlarmTool] error:', e?.message || e);
      return `Could not open Clock app: ${e.message}`;
    }
  }
}
