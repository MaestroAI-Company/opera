import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';

const MODULE = Platform.OS === 'android' ? (NativeModules.AICoreSpeechModule as any) : null;

export const AICORE_FEATURE_STATUS = {
  UNAVAILABLE: 0,
  DOWNLOADABLE: 1,
  DOWNLOADING: 2,
  AVAILABLE: 3,
} as const;

export type SpeechCallbacks = {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onVolume?: (volume: number) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
};

class AICoreSpeechService {
  private subscribers: { remove: () => void }[] = [];
  private activeRequestId: string | null = null;
  private listening = false;
  private ensureInFlight: Promise<boolean> | null = null;

  isSupported(): boolean {
    return MODULE !== null;
  }

  isListening(): boolean {
    return this.listening;
  }

  async checkStatus(locale: string): Promise<number> {
    if (!this.isSupported()) return AICORE_FEATURE_STATUS.UNAVAILABLE;
    try {
      return await MODULE.checkStatus(locale || 'en-US');
    } catch (e) {
      console.warn('AICore STT checkStatus error:', e);
      return AICORE_FEATURE_STATUS.UNAVAILABLE;
    }
  }

  //true when stt usable (available or downloadable)
  async isAdvancedAvailable(locale: string): Promise<boolean> {
    if (!this.isSupported()) return false;
    const status = await this.checkStatus(locale);
    return status === AICORE_FEATURE_STATUS.AVAILABLE || status === AICORE_FEATURE_STATUS.DOWNLOADABLE;
  }

  //ensure stt model downloaded, true when ready
  async ensureReady(locale: string): Promise<boolean> {
    if (this.ensureInFlight) return this.ensureInFlight;
    this.ensureInFlight = this.doEnsureReady(locale).finally(() => {
      this.ensureInFlight = null;
    });
    return this.ensureInFlight;
  }

  private async doEnsureReady(locale: string): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      let status = await this.checkStatus(locale);
      if (status === AICORE_FEATURE_STATUS.AVAILABLE) return true;
      if (status === AICORE_FEATURE_STATUS.DOWNLOADABLE) {
        await this.download(locale);
        return true;
      }
      if (status === AICORE_FEATURE_STATUS.DOWNLOADING) {
        //already downloading, poll until it finishes
        for (let i = 0; i < 60; i++) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          status = await this.checkStatus(locale);
          if (status === AICORE_FEATURE_STATUS.AVAILABLE) return true;
          if (status === AICORE_FEATURE_STATUS.DOWNLOADABLE) {
            await this.download(locale);
            return true;
          }
        }
      }
      return false;
    } catch (e) {
      console.warn('AICore STT ensureReady error:', e);
      return false;
    }
  }

  async download(locale: string, onProgress?: (bytes: number) => void): Promise<void> {
    if (!this.isSupported()) throw new Error('AICore STT not supported on this device');
    const progressSub = DeviceEventEmitter.addListener('AICoreDownloadProgress', (e: any) => {
      if (onProgress) onProgress(e.bytes);
    });
    try {
      await MODULE.download(locale || 'en-US');
    } finally {
      progressSub.remove();
    }
  }

  //start streaming, callbacks fire on partial/final text
  async start(locale: string, callbacks: SpeechCallbacks): Promise<void> {
    if (!this.isSupported()) throw new Error('AICore STT not supported on this device');
    const requestId = `aicore_stt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this.activeRequestId = requestId;

    const onEvent = (name: string, handler: (e: any) => void) =>
      DeviceEventEmitter.addListener(name, (e: any) => {
        if (e.requestId === requestId) handler(e);
      });

    const subs = [
      onEvent('AICorePartial', (e) => callbacks.onPartial?.(e.text)),
      onEvent('AICoreFinal', (e) => callbacks.onFinal?.(e.text)),
      onEvent('AICoreVolume', (e) => callbacks.onVolume?.(e.volume)),
      onEvent('AICoreSpeechError', (e) => callbacks.onError?.(e.message)),
      onEvent('AICoreSpeechDone', () => {
        this.listening = false;
        callbacks.onDone?.();
      }),
    ];

    try {
      await MODULE.startRecognition(locale || 'en-US', requestId);
      this.listening = true;
      this.subscribers = subs;
    } catch (e) {
      this.listening = false;
      this.activeRequestId = null;
      subs.forEach(s => s.remove());
      throw e;
    }
  }

  async stop(): Promise<void> {
    this.listening = false;
    this.activeRequestId = null;
    if (!this.isSupported()) return;
    try {
      await MODULE.stopRecognition();
    } catch (e) {
      console.warn('AICore STT stop error:', e);
    }
    this.subscribers.forEach(s => s.remove());
    this.subscribers = [];
  }
}

export const AICoreSTT = new AICoreSpeechService();
