export type SynthesisOptions = {
  voice: string;
  speed: number;
};

export type VoiceOption = {
  id: string;
  label: string;
};

//offline voice with downloadable models
export interface NeuralTTSEngine {
  readonly sampleRate: number;
  readonly sizeBytes: number;
  readonly voices: string[];
  readonly defaultVoice: string;
  isSupported(): boolean;
  supports(lang: string): boolean;
  isInstalled(): boolean;
  //named voices for a language
  voiceOptions(lang: string): VoiceOption[];
  download(onProgress: (progress: number) => void): Promise<void>;
  remove(): Promise<void>;
  preload(lang: string, voice: string): Promise<void>;
  synthesize(text: string, lang: string, options: SynthesisOptions): Promise<Float32Array>;
  release(): Promise<void>;
}

//runs tasks one at a time
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T> | T): Promise<T> {
    const next = this.tail.then(task);
    this.tail = next.catch(() => {});
    return next;
  }
}
