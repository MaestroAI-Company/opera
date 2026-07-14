import { initWhisper, WhisperContext } from "whisper.rn";

//bundled model asset
const MODEL_ASSET = require("../../../assets/models/ggml-base.bin");

class WhisperService {
  private context: WhisperContext | null = null;
  private initPromise: Promise<boolean> | null = null;

  //initialize whisper context with bundled model
  async init(): Promise<boolean> {
    if (this.context) return true;
    //if already initializing, wait on the same promise instead of returning false
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        console.log("[Whisper] Initializing context...");
        this.context = await initWhisper({
          filePath: MODEL_ASSET,
          useGpu: true,
          useCoreMLIos: true,
        });
        console.log(`[Whisper] Context initialized. Using ${this.context.gpu ? "GPU" : "CPU"}${this.context.reasonNoGPU ? ` (GPU: ${this.context.reasonNoGPU})` : ""}`);
        return true;
      } catch (e) {
        console.error("whisper init failed:", e);
        this.initPromise = null;
        return false;
      }
    })();

    return this.initPromise;
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
      language: "auto",
    });

    const { result } = await promise;
    console.log(`[Whisper] File transcription completed in ${Date.now() - startTime}ms: "${result.trim()}"`);
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
      language: "auto",
    });

    const { result } = await promise;
    console.log(`[Whisper] Buffer transcription completed in ${Date.now() - startTime}ms: "${result.trim()}"`);
    return result.trim();
  }

  //release whisper resources
  async release(): Promise<void> {
    if (this.context) {
      await this.context.release();
      this.context = null;
    }
  }
}

export const Whisper = new WhisperService();
