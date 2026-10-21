import { Settings } from '../settings/SettingsService';
import type { SpeechToTextCallbacks, WhisperSurface } from './STTService';
import { buildWavBuffer } from './wav';

const SAMPLE_RATE = 16000;
//same threshold as the chat bar
const VAD_RMS_THRESHOLD = 0.01;
//speech stands this far above the noise
const VAD_NOISE_RATIO = 3;
//quietest chunk of the last 5 s
const NOISE_WINDOW = 20;
//native recognizers give up too
const NO_SPEECH_MS = 5000;

type Capture = {
  stream: MediaStream;
  context: AudioContext;
  processor: ScriptProcessorNode;
  chunks: ArrayBuffer[];
  callbacks: SpeechToTextCallbacks;
  recordAudio: boolean;
  noSpeechTimer: ReturnType<typeof setTimeout>;
};

class SpeechToTextService {
  private transcriber: any = null;
  private currentLang: string = 'en';
  private capture: Capture | null = null;
  private session = 0;

  private async getTransformers() {
    if (typeof self === 'undefined') {
      (globalThis as any).self = globalThis;
    }
    //@ts-ignore
    const { pipeline, env } = await import('@xenova/transformers/dist/transformers.js');
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    return { pipeline, env };
  }

  //let transformers js handle model caching
  getModelPath(modelName: string): string {
    return "";
  }

  // check if model is installed
  async isModelInstalled(modelName: string): Promise<boolean> {
    try {
      if (typeof caches === 'undefined') return false;
      let repo = 'Xenova/whisper-base';
      if (modelName === 'tiny') repo = 'Xenova/whisper-tiny';
      if (modelName === 'small') repo = 'Xenova/whisper-small';
      
      const cache = await caches.open('transformers-cache');
      const keys = await cache.keys();
      //check if cache files exist for repo
      return keys.some(request => request.url.includes(repo));
    } catch {
      return false;
    }
  }

  // download the model
  async downloadModel(modelName: string, progressCallback?: (progress: number, etaSeconds: number, speedStr: string, sizeStr: string) => void): Promise<void> {
    await this.init(modelName, progressCallback);
  }

  // delete the model
  async deleteModel(modelName: string): Promise<void> {
    try {
      if (typeof caches === 'undefined') return;
      let repo = 'Xenova/whisper-base';
      if (modelName === 'tiny') repo = 'Xenova/whisper-tiny';
      if (modelName === 'small') repo = 'Xenova/whisper-small';
      
      const cache = await caches.open('transformers-cache');
      const keys = await cache.keys();
      for (const request of keys) {
        if (request.url.includes(repo)) {
          await cache.delete(request);
        }
      }
      
      //release currently loaded model
      if (this.transcriber) {
        await this.release();
      }
    } catch (e) {
      console.error("[SpeechToText] Failed to delete model cache", e);
    }
  }

  // init service
  async init(modelName: string, progressCallback?: (progress: number, etaSeconds: number, speedStr: string, sizeStr: string) => void): Promise<boolean> {
    try {
      let repo = 'Xenova/whisper-base';
      if (modelName === 'tiny') repo = 'Xenova/whisper-tiny';
      if (modelName === 'small') repo = 'Xenova/whisper-small';
      
      console.log(`[SpeechToText] Initializing model ${repo}...`);
      const { pipeline } = await this.getTransformers();
      
      const downloadStats = new Map<string, { loaded: number, total: number }>();
      const startTime = Date.now();
      let lastReportTime = startTime;

      this.transcriber = await pipeline('automatic-speech-recognition', repo, {
        progress_callback: (x: any) => {
          if (!progressCallback) return;
          
          if (x.status === 'initiate' || x.status === 'progress' || x.status === 'done') {
            //track per file progress
            downloadStats.set(x.file, { loaded: x.loaded || 0, total: x.total || 0 });
            
            //throttle ui updates to avoid performance issues
            const now = Date.now();
            if (now - lastReportTime < 100 && x.status === 'progress') return;
            lastReportTime = now;
            
            let totalLoaded = 0;
            let totalSize = 0;
            for (const stat of downloadStats.values()) {
              totalLoaded += stat.loaded;
              //fallback to loaded size if total is missing
              totalSize += stat.total > 0 ? stat.total : stat.loaded;
            }
            
            const progress = totalSize > 0 ? totalLoaded / totalSize : 0;
            const elapsedSec = (now - startTime) / 1000;
            const speedBytesPerSec = elapsedSec > 0 ? totalLoaded / elapsedSec : 0;
            const etaSeconds = speedBytesPerSec > 0 ? Math.max(0, (totalSize - totalLoaded) / speedBytesPerSec) : 0;
            
            const speedStr = `${(speedBytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
            const loadedStr = `${(totalLoaded / 1024 / 1024).toFixed(1)}`;
            const totalStr = `${(totalSize / 1024 / 1024).toFixed(1)}`;
            const sizeStr = `${loadedStr} MB / ${totalStr} MB`;
            
            progressCallback(progress, etaSeconds, speedStr, sizeStr);
          }
        }
      });
      console.log(`[SpeechToText] Context initialized.`);
      return true;
    } catch (e) {
      console.error("[SpeechToText] init failed:", e);
      return false;
    }
  }

  // set language
  setLanguage(lang: string): void {
    this.currentLang = lang;
  }

  // check availability
  isAvailable(): boolean {
    return this.transcriber !== null;
  }

  // transcribe file
  async transcribe(audioPath: string): Promise<string> {
    if (!this.transcriber) throw new Error("whisper not initialized");
    
    try {
      console.log(`[SpeechToText] Transcribing file ${audioPath}...`);
      const startTime = Date.now();
      const response = await fetch(audioPath);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      
      const text = await this.transcribeData(arrayBuffer);
      console.log(`[SpeechToText] File transcription completed in ${Date.now() - startTime}ms: "${text.trim()}"`);
      return text;
    } catch (e) {
      console.error("[SpeechToText] Transcription error:", e);
      throw e;
    }
  }

  // transcribe raw data
  async transcribeData(buffer: ArrayBuffer): Promise<string> {
    if (!this.transcriber) throw new Error("whisper not initialized");
    
    console.log(`[SpeechToText] Transcribing buffer of ${buffer.byteLength} bytes...`);
    const startTime = Date.now();
    
    //convert buffer to float32 at 16000hz
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    
    try {
      //copy buffer to avoid detached errors
      const bufferCopy = buffer.slice(0);
      const audioBuffer = await audioContext.decodeAudioData(bufferCopy);
      
      //render at 16000hz with offline audio context
      const offlineContext = new OfflineAudioContext(1, audioBuffer.length, 16000);
      const source = offlineContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(offlineContext.destination);
      source.start();
      
      const renderedBuffer = await offlineContext.startRendering();
      const audioData = renderedBuffer.getChannelData(0); //get float32 array
      
      const output = await this.transcriber(audioData, {
        language: this.currentLang && this.currentLang !== 'auto' ? this.currentLang : undefined,
        task: 'transcribe',
      });
      
      const text = output.text;
      console.log(`[SpeechToText] Buffer transcription completed in ${Date.now() - startTime}ms: "${text.trim()}"`);
      return text;
    } catch (e) {
      console.error("[SpeechToText] Transcription error:", e);
      throw e;
    } finally {
      if (audioContext.state !== 'closed') {
        audioContext.close();
      }
    }
  }

  //caller gets the wav not whisper
  supportsRecording(): boolean {
    return true;
  }

  async requestPermissions(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch {
      return false;
    }
  }

  //records until stop then transcribes
  start(_locale: string, callbacks: SpeechToTextCallbacks, recordAudio = false): void {
    this.open(++this.session, callbacks, recordAudio).catch((e) => callbacks.onError?.(String(e?.message ?? e)));
  }

  private async open(session: number, callbacks: SpeechToTextCallbacks, recordAudio: boolean): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    //stopped while the prompt was open
    if (session !== this.session) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    const context = new AudioContext({ sampleRate: SAMPLE_RATE });
    const processor = context.createScriptProcessor(4096, 1, 1);
    const capture: Capture = {
      stream,
      context,
      processor,
      chunks: [],
      callbacks,
      recordAudio,
      noSpeechTimer: setTimeout(() => this.stop(), NO_SPEECH_MS),
    };
    let speaking = false;
    const recentRms: number[] = [];
    processor.onaudioprocess = (e) => {
      const chunk = new Float32Array(e.inputBuffer.getChannelData(0));
      capture.chunks.push(chunk.buffer);
      let sum = 0;
      for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i];
      const rms = Math.sqrt(sum / chunk.length);
      recentRms.push(rms);
      if (recentRms.length > NOISE_WINDOW) recentRms.shift();
      //steady noise like a tv stops counting
      const noiseFloor = Math.min(...recentRms);
      const loud = rms > Math.max(VAD_RMS_THRESHOLD, noiseFloor * VAD_NOISE_RATIO);
      if (loud === speaking) return;
      speaking = loud;
      if (loud) {
        clearTimeout(capture.noSpeechTimer);
        callbacks.onSpeechStart?.();
      } else {
        callbacks.onSpeechEnd?.();
      }
    };
    context.createMediaStreamSource(stream).connect(processor);
    processor.connect(context.destination);
    this.capture = capture;
  }

  private close(): Capture | null {
    this.session++;
    const capture = this.capture;
    this.capture = null;
    if (!capture) return null;
    clearTimeout(capture.noSpeechTimer);
    capture.processor.disconnect();
    capture.context.close();
    capture.stream.getTracks().forEach((track) => track.stop());
    return capture;
  }

  stop(): void {
    const capture = this.close();
    if (capture) this.finish(capture);
  }

  abort(): void {
    this.close();
  }

  private async finish({ chunks, callbacks, recordAudio }: Capture): Promise<void> {
    try {
      const wav = buildWavBuffer(chunks, SAMPLE_RATE);
      if (recordAudio) {
        callbacks.onAudioFile?.(URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })));
      } else {
        const model = Settings.getCached().whisperModel || 'base';
        //lazy load like the chat bar
        if (!this.transcriber && model !== 'none' && (await this.isModelInstalled(model))) await this.init(model);
        if (!this.transcriber) throw new Error('whisper not installed');
        callbacks.onFinal?.((await this.transcribeData(wav)).trim());
      }
    } catch (e: any) {
      callbacks.onError?.(String(e?.message ?? e));
    }
    callbacks.onDone?.();
  }

  // release resources
  async release(): Promise<void> {
    if (this.transcriber) {
      if (this.transcriber.dispose) {
         await this.transcriber.dispose();
      }
      this.transcriber = null;
    }
  }
}

// export whisper instance
export const STT = new SpeechToTextService();

//same bridge as native file
export const WhisperSTT = STT as unknown as WhisperSurface;
