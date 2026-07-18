class WhisperService {
  // get local file path for a model
  getModelPath(modelName: string): string {
    return "";
  }

  // check if model is installed
  async isModelInstalled(modelName: string): Promise<boolean> {
    return false;
  }

  // download the model
  async downloadModel(modelName: string): Promise<void> {
    throw new Error('whisper.rn is not supported on web');
  }

  // delete the model
  async deleteModel(modelName: string): Promise<void> {
    throw new Error('whisper.rn is not supported on web');
  }

  // init service
  async init(modelName: string): Promise<boolean> {
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
