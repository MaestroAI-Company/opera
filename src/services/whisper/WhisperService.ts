import { initWhisper, WhisperContext } from "whisper.rn";
import * as FileSystem from 'expo-file-system/legacy';
import { NotificationService } from '../notifications/NotificationService';

const MODEL_URLS: Record<string, string> = {
  tiny: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin",
  base: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin",
  small: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin",
};

class WhisperService {
  private context: WhisperContext | null = null;
  private initPromise: Promise<boolean> | null = null;
  private language: string = "auto";
  private activeModel: string | null = null;

  //get the local file path for a model
  getModelPath(modelName: string): string {
    return `${FileSystem.documentDirectory}models/whisper-${modelName}.bin`;
  }

  //check if model is installed
  async isModelInstalled(modelName: string): Promise<boolean> {
    const path = this.getModelPath(modelName);
    const info = await FileSystem.getInfoAsync(path);
    return info.exists;
  }

  //download the model
  async downloadModel(modelName: string, onProgress?: (progress: number, etaSeconds: number, speedStr: string, sizeStr: string) => void): Promise<void> {
    const url = MODEL_URLS[modelName];
    if (!url) throw new Error(`Unknown model: ${modelName}`);

    const modelsDir = `${FileSystem.documentDirectory}models/`;
    const dirInfo = await FileSystem.getInfoAsync(modelsDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(modelsDir, { intermediates: true });
    }

    const path = this.getModelPath(modelName);
    const downloadId = `whisper-${modelName}`;
    const startTime = Date.now();

    const formatBytes = (bytes: number) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const downloadResumable = FileSystem.createDownloadResumable(
      url,
      path,
      {},
      (downloadProgress) => {
        const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        
        //calculate eta
        const elapsedSeconds = Math.max((Date.now() - startTime) / 1000, 0.1);
        const bytesPerSecond = downloadProgress.totalBytesWritten / elapsedSeconds;
        const remainingBytes = downloadProgress.totalBytesExpectedToWrite - downloadProgress.totalBytesWritten;
        const etaSeconds = remainingBytes / bytesPerSecond;

        const speedStr = `${formatBytes(bytesPerSecond)}/s`;
        const sizeStr = `${formatBytes(downloadProgress.totalBytesWritten)} / ${formatBytes(downloadProgress.totalBytesExpectedToWrite)}`;

        if (onProgress) {
          onProgress(progress, etaSeconds, speedStr, sizeStr);
        }

        NotificationService.displayDownloadProgress(
          downloadId,
          `Whisper ${modelName}`,
          progress,
          etaSeconds,
          speedStr,
          sizeStr
        );
      }
    );

    try {
      await downloadResumable.downloadAsync();
      await NotificationService.displayDownloadFinished(downloadId, `Whisper ${modelName}`);
      //automatically load the model once downloaded
      await this.init(modelName);
    } catch (e) {
      await NotificationService.cancelNotification(downloadId);
      throw e;
    }
  }

  //delete the model
  async deleteModel(modelName: string): Promise<void> {
    const path = this.getModelPath(modelName);
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      await FileSystem.deleteAsync(path);
    }
    if (this.activeModel === modelName) {
      await this.release();
    }
  }

  //initialize whisper context with specific model
  async init(modelName: string): Promise<boolean> {
    if (this.context && this.activeModel === modelName) return true;
    
    //if a different model is active, release it
    if (this.context && this.activeModel !== modelName) {
      await this.release();
    }

    //wait on existing init promise
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const path = this.getModelPath(modelName);
        const info = await FileSystem.getInfoAsync(path);
        
        if (!info.exists) {
          console.error(`[Whisper] Model ${modelName} is not installed at ${path}`);
          this.initPromise = null;
          return false;
        }

        console.log(`[Whisper] Initializing context for ${modelName}...`);
        this.context = await initWhisper({
          filePath: path,
          useGpu: true,
          useCoreMLIos: true,
        });
        this.activeModel = modelName;
        console.log(`[Whisper] Context initialized. Using ${this.context.gpu ? "GPU" : "CPU"}${this.context.reasonNoGPU ? ` (GPU: ${this.context.reasonNoGPU})` : ""}`);
        this.initPromise = null;
        return true;
      } catch (e) {
        console.error("whisper init failed:", e);
        this.initPromise = null;
        return false;
      }
    })();

    return this.initPromise;
  }

  //set transcription language from settings
  setLanguage(lang: string): void {
    this.language = lang || "auto";
  }

  //check if whisper is ready
  isAvailable(): boolean {
    return this.context !== null;
  }

  //transcribe an audio file, returns the text
  async transcribe(audioPath: string): Promise<string> {
    if (!this.context) {
      throw new Error("whisper not initialized");
    }

    console.log(`[Whisper] Transcribing file ${audioPath}...`);
    const startTime = Date.now();
    const { promise } = this.context.transcribe(audioPath, {
      language: this.language,
    });

    const { result } = await promise;
    console.log(`[Whisper] File transcription completed in ${Date.now() - startTime}ms`);
    return result.trim();
  }

  //transcribe raw float32 pcm data (arraybuffer)/avoids wav file format issues
  async transcribeData(buffer: ArrayBuffer): Promise<string> {
    if (!this.context) {
      throw new Error("whisper not initialized");
    }

    console.log(`[Whisper] Transcribing buffer of ${buffer.byteLength} bytes...`);
    const startTime = Date.now();
    const { promise } = this.context.transcribeData(buffer, {
      language: this.language,
    });

    const { result } = await promise;
    console.log(`[Whisper] Buffer transcription completed in ${Date.now() - startTime}ms`);
    return result.trim();
  }

  //release whisper resources
  async release(): Promise<void> {
    if (this.context) {
      await this.context.release();
      this.context = null;
      this.activeModel = null;
    }
  }
}

export const Whisper = new WhisperService();
