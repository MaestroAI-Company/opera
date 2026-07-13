export interface IAIProvider {
  //check if service is online
  isAvailable(): Promise<boolean>;

  //get available models
  getAvailableModels(): Promise<string[]>;

  //preload model
  preloadModel(modelName: string): Promise<void>;

  //send message and stream response
  sendMessage(
    modelName: string,
    systemPrompt: string,
    messages: { role: string; content: string }[],
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    options?: { think?: boolean }
  ): Promise<void>;

  //pull model (optional)
  downloadService?(modelName: string): Promise<void>;
}
