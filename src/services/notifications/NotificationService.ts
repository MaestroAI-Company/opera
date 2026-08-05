import notifee, { AndroidImportance } from '@notifee/react-native';
import { Platform } from 'react-native';
import { Colors } from "../../../constants/theme";

class NotificationServiceImpl {
  private channelId: string | null = null;
  
  private async setupChannel() {
    if (Platform.OS === 'android' && !this.channelId) {
      await notifee.requestPermission();
      this.channelId = await notifee.createChannel({
        id: 'downloads',
        name: 'Model Downloads',
        importance: AndroidImportance.LOW, //silent notification
      });
    }
    return this.channelId;
  }

  async displayDownloadProgress(id: string, modelName: string, progress: number, etaSeconds?: number, speedStr?: string, sizeStr?: string) {
    const channelId = await this.setupChannel();
    
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
    const channelId = await this.setupChannel();
    await notifee.displayNotification({
      id,
      title: `Model ready`,
      body: `${modelName} has been successfully downloaded.`,
      android: {
        channelId: channelId || 'default',
      },
    });
  }

  async cancelNotification(id: string) {
    await notifee.stopForegroundService();
    await notifee.cancelNotification(id);
  }
}

//keep js thread alive in foreground
notifee.registerForegroundService(() => {
  return new Promise(() => {
    //wait until aborted
  });
});

//handle background events
notifee.onBackgroundEvent(async ({ type, detail }) => {
  //do nothing
});

export const NotificationService = new NotificationServiceImpl();
