import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { IAIProvider } from './IAIProvider';
import { OllamaProvider } from './OllamaProvider';
import { AICoreProvider } from './AICoreProvider';
import { MessageMetrics } from '../db/DatabaseService';

const DEFAULT_URL = Platform.OS === 'android' ? 'http://10.0.2.2:11434' : 'http://127.0.0.1:11434';

class CentralAIModule {
  public SharedGenerationState = {
    activeConvId: null as string | null,
    activeMsgId: null as string | null,
    content: '',
    abort: () => {},
    listeners: new Set<() => void>(),
    subscribe(cb: () => void) {
      // add listener for shared state
      this.listeners.add(cb);
      return () => { this.listeners.delete(cb); };
    },
    notify() {
      this.listeners.forEach(l => l());
    }
  };

  private providers: Map<string, IAIProvider>;
  private activeMode: string = 'OLLAMA';

  constructor() {
    this.providers = new Map();
    //initialize providers with defaults
    this.providers.set('OLLAMA', new OllamaProvider(DEFAULT_URL));
    //gemini nano via ml kit genai, only usable on android
    this.providers.set('AICORE', new AICoreProvider());
  }

  //switch active provider from settings
  setMode(mode: string): void {
    this.activeMode = (mode || 'ollama').toUpperCase();
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

  async downloadService(modelName: string, onProgress?: (progress: number, etaSeconds: number, speedStr: string, sizeStr: string) => void): Promise<void> {
    const provider = this.getActiveProvider();
    if (provider.downloadService) {
      return provider.downloadService(modelName, onProgress);
    }
    throw new Error('Download service not supported by active provider');
  }

  async getModelCapabilities(modelName: string): Promise<string[]> {
    const provider = this.getActiveProvider();
    if (provider.getModelCapabilities) {
      return provider.getModelCapabilities(modelName);
    }
    return [];
  }

  async sendMessage(
    modelName: string,
    systemPrompt: string,
    messages: { role: string; content: string; images?: string[] }[],
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    options?: { think?: boolean | string },
    onMetrics?: (metrics: MessageMetrics) => void
  ): Promise<void> {
    const provider = this.getActiveProvider();
    
    //convert local uris to base64
    const processedMessages = await Promise.all(
      messages.map(async (msg) => {
        if (!msg.images || msg.images.length === 0) return msg;
        
        const base64Images = await Promise.all(
          msg.images.map(async (uri) => {
            try {
              //return base64 if already formatted
              if (uri.startsWith('data:')) return uri.split(',')[1];
              //read local file as base64 without query params
              const fileUri = uri.split('?name=')[0];
              return await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
            } catch (e) {
              console.error('Failed to read image as base64:', e);
              return uri; //fallback to raw string on error
            }
          })
        );
        
        return { ...msg, images: base64Images };
      })
    );

    return provider.sendMessage(modelName, systemPrompt, processedMessages, onChunk, signal, options, onMetrics);
  }
}

//export ai module singleton
export const AIModule = new CentralAIModule();
