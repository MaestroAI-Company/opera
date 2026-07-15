import { Platform } from 'react-native';
import { IAIProvider } from './IAIProvider';
import { OllamaProvider } from './OllamaProvider';

const DEFAULT_URL = Platform.OS === 'android' ? 'http://10.0.2.2:11434' : 'http://127.0.0.1:11434';

class CentralAIModule {
  private providers: Map<string, IAIProvider>;
  private activeMode: string = 'OLLAMA';

  constructor() {
    this.providers = new Map();
    //initialize providers with defaults
    this.providers.set('OLLAMA', new OllamaProvider(DEFAULT_URL));
  }

  //reconfigure ollama provider with url from settings
  configure(ollamaUrl: string): void {
    const url = ollamaUrl.trim().length > 0 ? ollamaUrl.trim() : DEFAULT_URL;
    this.providers.set('OLLAMA', new OllamaProvider(url));
  }

  //get active provider
  private getActiveProvider(): IAIProvider {
    const provider = this.providers.get(this.activeMode);
    if (!provider) {
      throw new Error(`No AI provider configured for mode: ${this.activeMode}`);
    }
    return provider;
  }

  async isAvailable(): Promise<boolean> {
    const provider = this.getActiveProvider();
    return provider.isAvailable();
  }

  async getAvailableModels(): Promise<string[]> {
    const provider = this.getActiveProvider();
    return provider.getAvailableModels();
  }

  async preloadModel(modelName: string): Promise<void> {
    const provider = this.getActiveProvider();
    return provider.preloadModel(modelName);
  }

  async downloadService(modelName: string): Promise<void> {
    const provider = this.getActiveProvider();
    if (provider.downloadService) {
      return provider.downloadService(modelName);
    }
    throw new Error('Download service not supported by active provider');
  }

  async sendMessage(
    modelName: string,
    systemPrompt: string,
    messages: { role: string; content: string }[],
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    options?: { think?: boolean }
  ): Promise<void> {
    const provider = this.getActiveProvider();
    return provider.sendMessage(modelName, systemPrompt, messages, onChunk, signal, options);
  }
}

//export ai module singleton
export const AIModule = new CentralAIModule();
