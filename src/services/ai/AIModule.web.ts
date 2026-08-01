import { IAIProvider } from './IAIProvider';
import { OllamaProvider } from './OllamaProvider';
import { AICoreProvider } from './AICoreProvider';

const DEFAULT_URL = 'http://127.0.0.1:11434';

class CentralAIModule {
  private providers: Map<string, IAIProvider>;
  private activeMode: string = 'OLLAMA';

  constructor() {
    this.providers = new Map();
    // initialize providers
    this.providers.set('OLLAMA', new OllamaProvider(DEFAULT_URL));
    this.providers.set('AICORE', new AICoreProvider());
  }

  // switch active provider from settings
  setMode(mode: string): void {
    this.activeMode = (mode || 'ollama').toUpperCase();
  }

  // configure ollama url
  configure(ollamaUrl: string): void {
    const url = ollamaUrl.trim().length > 0 ? ollamaUrl.trim() : DEFAULT_URL;
    this.providers.set('OLLAMA', new OllamaProvider(url));
  }

  // get active provider
  private getActiveProvider(): IAIProvider {
    const provider = this.providers.get(this.activeMode);
    if (!provider) {
      throw new Error(`no AI provider for mode: ${this.activeMode}`);
    }
    return provider;
  }

  // check availability
  async isAvailable(): Promise<boolean> {
    const provider = this.getActiveProvider();
    return provider.isAvailable();
  }

  // get available models
  async getAvailableModels(): Promise<string[]> {
    const provider = this.getActiveProvider();
    return provider.getAvailableModels();
  }

  // preload model
  async preloadModel(modelName: string): Promise<void> {
    const provider = this.getActiveProvider();
    return provider.preloadModel(modelName);
  }

  // download service
  async downloadService(modelName: string, onProgress?: (progress: number, etaSeconds: number, speedStr: string, sizeStr: string) => void): Promise<void> {
    const provider = this.getActiveProvider();
    if (provider.downloadService) {
      return provider.downloadService(modelName, onProgress);
    }
    throw new Error('download service not supported');
  }

  // get model capabilities
  async getModelCapabilities(modelName: string): Promise<string[]> {
    const provider = this.getActiveProvider();
    if (provider.getModelCapabilities) {
      return provider.getModelCapabilities(modelName);
    }
    return [];
  }

  // send message
  async sendMessage(
    modelName: string,
    systemPrompt: string,
    messages: { role: string; content: string; images?: string[] }[],
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    options?: { think?: boolean | string }
  ): Promise<void> {
    const provider = this.getActiveProvider();
    
    // convert images to base64
    const processedMessages = await Promise.all(
      messages.map(async (msg) => {
        if (!msg.images || msg.images.length === 0) return msg;
        
        const base64Images = await Promise.all(
          msg.images.map(async (uri) => {
            try {
              // return if already base64
              if (uri.startsWith('data:')) return uri.split(',')[1];
              
              // fetch local file and convert to base64
              const response = await fetch(uri);
              const blob = await response.blob();
              return new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                  const base64data = reader.result as string;
                  resolve(base64data.split(',')[1]);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
            } catch (e) {
              console.error('failed to read image as base64', e);
              return uri;
            }
          })
        );
        
        return { ...msg, images: base64Images };
      })
    );

    return provider.sendMessage(modelName, systemPrompt, processedMessages, onChunk, signal, options);
  }
}

// export ai module instance
export const AIModule = new CentralAIModule();
