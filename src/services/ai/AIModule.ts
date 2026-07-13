import { IAIProvider } from './IAIProvider';
import { OllamaProvider } from './OllamaProvider';

const SETTINGS = {
  activeMode: 'OLLAMA' as const,
  ollamaUrl: 'https://cloud.maestroai.company',
  ollamaHeaders: {
    'Authorization': 'Basic ZGV2bm9zZWN1cmV3aG9jYXJlczp3aG9jYXJlcw==',
  },
};

class CentralAIModule {
  private providers: Map<string, IAIProvider>;

  constructor() {
    this.providers = new Map();
    //initialize providers
    this.providers.set('OLLAMA', new OllamaProvider(SETTINGS.ollamaUrl, SETTINGS.ollamaHeaders));
  }

  //get active provider
  private getActiveProvider(): IAIProvider {
    //evaluate active mode
    const mode = SETTINGS.activeMode;
    const provider = this.providers.get(mode);
    
    if (!provider) {
      throw new Error(`No AI provider configured for mode: ${mode}`);
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
