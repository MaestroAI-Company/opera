import { IAIProvider } from './IAIProvider';
import { OllamaProvider } from './OllamaProvider';
import { ToolManager } from './tools/ToolManager';
import { SYSTEM_PROMPTS } from '../../../constants/prompts';

const DEFAULT_URL = 'http://127.0.0.1:11434';

class CentralAIModule {
  public SharedGenerationState = {
    activeConvId: null as string | null,
    activeMsgId: null as string | null,
    activeToolName: null as string | null,
    activeToolArgs: null as any | null,
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
    // initialize providers
    this.providers.set('OLLAMA', new OllamaProvider(DEFAULT_URL));
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

  //convert images to base64
  private async processImages(messages: { role: string; content: string; images?: string[]; tool_calls?: any[] }[]): Promise<{ role: string; content: string; images?: string[]; tool_calls?: any[] }[]> {
    return Promise.all(
      messages.map(async (msg) => {
        if (!msg.images || msg.images.length === 0) return msg;
        const base64Images = await Promise.all(
          msg.images.map(async (uri) => {
            try {
              if (uri.startsWith('data:')) return uri.split(',')[1];
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
  }

  //send message
  async sendMessage(
    modelName: string,
    systemPrompt: string,
    messages: { role: string; content: string; images?: string[] }[],
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    options?: { think?: boolean | string }
  ): Promise<void> {
    const provider = this.getActiveProvider();
    const processedMessages = await this.processImages(messages);
    const enhancedPrompt = systemPrompt + `\n\n[System Context]\nCurrent Date and Time: ${new Date().toLocaleString()}`;
    await provider.sendMessage(modelName, enhancedPrompt, processedMessages, onChunk, signal, options);
  }

  //send message with tool support (checks model capabilities)
  async sendMessageWithTools(
    modelName: string,
    systemPrompt: string,
    messages: { role: string; content: string; images?: string[]; tool_calls?: any[] }[],
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    options?: { think?: boolean | string }
  ): Promise<void> {
    const provider = this.getActiveProvider();

    //check if model supports tools
    let supportsTools = false;
    try {
      const caps = await this.getModelCapabilities(modelName);
      supportsTools = caps.includes('tools');
    } catch {}

    const tools = supportsTools ? ToolManager.getDefinitions() : [];
    const processedMessages = await this.processImages(messages);
    const enhancedPrompt = systemPrompt + `\n\n[System Context]\nCurrent Date and Time: ${new Date().toLocaleString()}`;

    if (tools.length === 0) {
      await provider.sendMessage(modelName, enhancedPrompt, processedMessages, onChunk, signal, options);
      return;
    }

    //tool call loop (max 3 rounds)
    let currentMessages = [...processedMessages];
    for (let round = 0; round < 3; round++) {
      const result = await provider.sendMessage(
        modelName, enhancedPrompt, currentMessages, onChunk, signal,
        { ...options, tools }
      );

      if (!result?.toolCalls || result.toolCalls.length === 0) return;

      //summarize callback for tools that need it
      const summarize = async (text: string): Promise<string> => {
        let summary = '';
        await provider.sendMessage(
          modelName, SYSTEM_PROMPTS.SEARCH_SUMMARIZE,
          [{ role: 'user', content: text }],
          chunk => { summary += chunk; },
          signal,
          { think: false }
        );
        return summary;
      };

      //add assistant message with tool_calls to history
      currentMessages.push({
        role: 'assistant',
        content: '',
        tool_calls: result.toolCalls,
      });

      //execute each tool and add results
      for (const tc of result.toolCalls) {
        const toolName = tc.function.name;
        this.SharedGenerationState.activeToolName = toolName;
        this.SharedGenerationState.activeToolArgs = tc.function.arguments;
        this.SharedGenerationState.notify();
        
        const toolResult = await ToolManager.execute(tc.function.name, tc.function.arguments, summarize);
        
        this.SharedGenerationState.activeToolName = null;
        this.SharedGenerationState.activeToolArgs = null;
        this.SharedGenerationState.notify();
        
        currentMessages.push({ role: 'tool', content: toolResult });
      }
    }
  }
}

// export ai module instance
export const AIModule = new CentralAIModule();
