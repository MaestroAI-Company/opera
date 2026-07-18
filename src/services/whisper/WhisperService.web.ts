class WhisperService {
  // init service
  async init(): Promise<boolean> {
    return false;
  }

  // set language
  setLanguage(lang: string): void {}

  // check availability
  isAvailable(): boolean {
    return false;
  }

  // transcribe file
  async transcribe(audioPath: string): Promise<string> {
    throw new Error('whisper.rn is not supported on web');
  }

  // transcribe raw data
  async transcribeData(buffer: ArrayBuffer): Promise<string> {
    throw new Error('whisper.rn is not supported on web');
  }

  // release resources
  async release(): Promise<void> {}
}

// export whisper instance
export const Whisper = new WhisperService();
