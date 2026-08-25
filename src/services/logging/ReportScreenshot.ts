import * as Clipboard from 'expo-clipboard';
import { Platform } from 'react-native';
import { captureRef } from 'react-native-view-shot';

//jpeg fits memory and clipboard
const FORMAT = 'jpg';
const QUALITY = 0.8;

//screen as seen at shake time
export async function captureScreen(ref: React.RefObject<any>): Promise<string | null> {
  if (Platform.OS === 'web' || !ref.current) return null;
  try {
    return await captureRef(ref, { format: FORMAT, quality: QUALITY, result: 'base64' });
  } catch (e) {
    console.warn('[Report] screenshot failed:', e);
    return null;
  }
}

//url cannot carry images
export async function copyScreenshot(base64: string): Promise<boolean> {
  try {
    await Clipboard.setImageAsync(base64);
    return true;
  } catch (e) {
    console.warn('[Report] screenshot copy failed:', e);
    return false;
  }
}
