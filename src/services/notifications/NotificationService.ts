import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import { Platform } from 'react-native';
import { Colors } from "../../../constants/theme";

const progressId = (convId: string) => `gen-${convId}`;
const doneId = (convId: string) => `gen-done-${convId}`;

//keep notification titles readable
const asTitle = (prompt: string) => {
  const clean = prompt.trim().replace(/\s+/g, ' ');
  return clean.length > 80 ? clean.slice(0, 80) + '…' : clean || 'Maestro';
};

//taps park until a screen acts
let pendingPressConvId: string | null = null;
let initialChecked = false;
const pendingListeners = new Set<() => void>();

function deliverPress(notification: any) {
  const convId = notification?.data?.convId;
  if (!convId) return;
  pendingPressConvId = String(convId);
  pendingListeners.forEach(l => l());
}

export function subscribeToNotificationPress(listener: () => void): () => void {
  pendingListeners.add(listener);
  return () => { pendingListeners.delete(listener); };
}

export async function takePendingNotificationConvId(): Promise<string | null> {
  if (pendingPressConvId) {
    const convId = pendingPressConvId;
    pendingPressConvId = null;
    return convId;
  }
  //cold-start tap readable once
  if (initialChecked) return null;
  initialChecked = true;
  try {
    const initial = await notifee.getInitialNotification();
    const convId = initial?.notification?.data?.convId;
    return convId ? String(convId) : null;
  } catch {
    return null;
  }
}

class NotificationServiceImpl {
  private channels = new Map<string, string>();
  //ids holding the foreground service
  private fgOwners = new Set<string>();
  //ids shown without the service
  private fgDenied = new Set<string>();

  private async ensureChannel(id: string, name: string, importance: AndroidImportance) {
    if (Platform.OS !== 'android') return null;
    if (!this.channels.has(id)) {
      await notifee.requestPermission();
      this.channels.set(id, await notifee.createChannel({ id, name, importance }));
    }
    return this.channels.get(id) ?? null;
  }

  //stop service when no owner left
  private async releaseForegroundService(id: string) {
    this.fgOwners.delete(id);
    if (this.fgOwners.size === 0) await notifee.stopForegroundService();
  }

  async displayDownloadProgress(id: string, modelName: string, progress: number, etaSeconds?: number, speedStr?: string, sizeStr?: string) {
    const channelId = await this.ensureChannel('downloads', 'Model Downloads', AndroidImportance.LOW);

    let details = [];
    if (sizeStr) details.push(sizeStr);
    if (speedStr) details.push(speedStr);
    if (etaSeconds !== undefined && etaSeconds >= 0) {
      if (etaSeconds < 60) {
        details.push(`${Math.round(etaSeconds)}s left`);
      } else {
        const m = Math.floor(etaSeconds / 60);
        const s = Math.round(etaSeconds % 60);
        details.push(`${m}m ${s}s left`);
      }
    }

    const detailText = details.length > 0 ? `\n${details.join(' • ')}` : '';

    this.fgOwners.add(id);
    await notifee.displayNotification({
      id,
      title: `Downloading ${modelName}`,
      body: `${Math.round(progress * 100)}% downloaded${detailText}`,
      android: {
        channelId: channelId || 'default',
        onlyAlertOnce: true,
        asForegroundService: true, //keep app alive in background
        smallIcon: 'ic_launcher',
        color: Colors.primary,
        progress: {
          max: 100,
          current: Math.round(progress * 100),
        },
      },
    });
  }

  async displayDownloadFinished(id: string, modelName: string) {
    const channelId = await this.ensureChannel('downloads', 'Model Downloads', AndroidImportance.LOW);
    await this.releaseForegroundService(id);
    await notifee.displayNotification({
      id,
      title: `Model ready`,
      body: `${modelName} has been successfully downloaded.`,
      android: {
        channelId: channelId || 'default',
      },
    });
  }

  //silent ongoing while overlay closed
  async displayGenerationProgress(convId: string, prompt: string, step: string) {
    const channelId = await this.ensureChannel('generation', 'Background generation', AndroidImportance.LOW);
    const id = progressId(convId);
    const notification = {
      id,
      title: asTitle(prompt),
      body: step,
      data: { convId },
      android: {
        channelId: channelId || 'default',
        onlyAlertOnce: true,
        ongoing: true,
        smallIcon: 'ic_launcher',
        color: Colors.primary,
        //reply length is unknown while it streams
        progress: { indeterminate: true },
        pressAction: { id: 'default', launchActivity: 'default' },
      },
    };
    if (!this.fgDenied.has(id)) {
      this.fgOwners.add(id);
      try {
        //keep the stream alive in background
        await notifee.displayNotification({ ...notification, android: { ...notification.android, asForegroundService: true } });
        return;
      } catch {
        //android refuses it once backgrounded
        this.fgOwners.delete(id);
        this.fgDenied.add(id);
      }
    }
    await notifee.displayNotification(notification);
  }

  async displayGenerationFinished(convId: string, prompt: string, failed = false) {
    const channelId = await this.ensureChannel('generation-done', 'Generation finished', AndroidImportance.DEFAULT);
    await notifee.displayNotification({
      id: doneId(convId),
      title: asTitle(prompt),
      body: failed ? 'Generation failed' : 'Maestro finished answering. Tap to read it.',
      data: { convId },
      android: {
        channelId: channelId || 'default',
        smallIcon: 'ic_launcher',
        color: Colors.primary,
        autoCancel: true,
        pressAction: { id: 'default', launchActivity: 'default' },
      },
    });
  }

  async cancelGenerationProgress(convId: string) {
    const id = progressId(convId);
    this.fgDenied.delete(id);
    await this.releaseForegroundService(id);
    await notifee.cancelNotification(id);
  }

  async cancelNotification(id: string) {
    await this.releaseForegroundService(id);
    await notifee.cancelNotification(id);
  }
}

//keep js thread alive in foreground
notifee.registerForegroundService(() => {
  return new Promise(() => {
    //wait until aborted
  });
});

notifee.onForegroundEvent(({ type, detail }) => {
  if (type === EventType.PRESS) deliverPress(detail.notification);
});

//handle background events
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.PRESS) deliverPress(detail.notification);
});

export const NotificationService = new NotificationServiceImpl();
