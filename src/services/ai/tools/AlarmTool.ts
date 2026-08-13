import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';
import { ITool, ToolDefinition } from './ITool';

export class AlarmTool implements ITool {
  displayName = 'Set Alarm or Timer';
  displayDescription = 'Allow the assistant to open the Clock app with an alarm or timer pre-filled for you to confirm.';
  enabledByDefault = true;
  platforms: ITool['platforms'] = ['android'];

  definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'set_alarm_or_timer',
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
      return `Could not open Clock app: ${e.message}`;
    }
  }
}
