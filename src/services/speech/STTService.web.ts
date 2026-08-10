import type { WhisperSurface } from './STTService';

class SpeechToTextService {
  private transcriber: any = null;
  private currentLang: string = 'en';

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
