import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import type {
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionNativeEventMap,
  ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';

export type SpeechToTextCallbacks = {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onVolume?: (volume: number) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onError?: (message: string) => void;
  onDone?: () => void;
};

//whisper surface lives in web file
export type WhisperSurface = {
  isAvailable(): boolean;
  isModelInstalled(modelName: string): Promise<boolean>;
  init(modelName: string): Promise<boolean>;
  setLanguage(lang: string): void;
  transcribeData(buffer: ArrayBuffer): Promise<string>;
  deleteModel(modelName: string): Promise<void>;
  downloadModel(modelName: string, onProgress?: (progress: number, etaSeconds: number, speedStr: string, sizeStr: string) => void): Promise<void>;
};

class SpeechToTextService {
  private subscribers: { remove: () => void }[] = [];
  private listening = false;

  isSupported(): boolean {
    return ExpoSpeechRecognitionModule != null;
  }

  isListening(): boolean {
    return this.listening;
  }

  //no-op, matches web stt api
  setLanguage(_lang: string): void {}

  //request speech permissions
  async requestPermissions(): Promise<boolean> {
    try {
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      return !!result.granted;
    } catch (e) {
      console.warn('STT permission error:', e);
      return false;
    }
  }

  //start streaming recognition
  start(locale: string, callbacks: SpeechToTextCallbacks): void {
    const onResult = (e: ExpoSpeechRecognitionResultEvent) => {
      const transcript = e.results?.[0]?.transcript ?? '';
      if (e.isFinal) {
        callbacks.onFinal?.(transcript);
      } else {
        callbacks.onPartial?.(transcript);
      }
    };
    const onError = (e: ExpoSpeechRecognitionErrorEvent) => {
      callbacks.onError?.(e.message || e.error || 'recognition error');
    };
    const onVolume = (e: ExpoSpeechRecognitionNativeEventMap['volumechange']) => {
      callbacks.onVolume?.(e.value);
    };
    const listeners = [
      ExpoSpeechRecognitionModule.addListener('result', onResult),
      ExpoSpeechRecognitionModule.addListener('error', onError),
      ExpoSpeechRecognitionModule.addListener('volumechange', onVolume),
      ExpoSpeechRecognitionModule.addListener('speechstart', () => callbacks.onSpeechStart?.()),
      ExpoSpeechRecognitionModule.addListener('speechend', () => callbacks.onSpeechEnd?.()),
      ExpoSpeechRecognitionModule.addListener('end', () => {
        this.listening = false;
        listeners.forEach((s) => s.remove());
        if (this.subscribers === listeners) this.subscribers = [];
        callbacks.onDone?.();
      }),
    ];
    this.subscribers = listeners;
    this.listening = true;

    try {
      ExpoSpeechRecognitionModule.start({
        lang: locale || undefined,
        interimResults: true,
        continuous: true,
        iosTaskHint: 'dictation',
        addsPunctuation: true,
        volumeChangeEventOptions: { enabled: true, intervalMillis: 200 },
      });
    } catch (e) {
      this.listening = false;
      listeners.forEach((s) => s.remove());
      this.subscribers = [];
      throw e;
    }
  }

  //stop recognition, end event cleans up listeners
  stop(): void {
    this.listening = false;
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (e) {
      console.warn('STT stop error:', e);
      this.subscribers.forEach((s) => s.remove());
      this.subscribers = [];
    }
  }

  //immediately cancel recognition
  abort(): void {
    this.listening = false;
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch (e) {
      console.warn('STT abort error:', e);
    }
    this.subscribers.forEach((s) => s.remove());
    this.subscribers = [];
  }
}

export const STT = new SpeechToTextService();

//one bridge for both platforms
export const WhisperSTT = STT as unknown as WhisperSurface;
