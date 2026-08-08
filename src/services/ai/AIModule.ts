import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { IAIProvider } from './IAIProvider';
import { OllamaProvider } from './OllamaProvider';
import { ToolManager } from './tools/ToolManager';
import { sendMessageWithToolPrompt } from './tools/fallbackToolCall';
import { SYSTEM_PROMPTS } from '../../../constants/prompts';
import { LocalProvider } from './LocalProvider';
import { MessageMetrics } from '../db/DatabaseService';
import { LocationService } from '../location/LocationService';

const DEFAULT_URL = Platform.OS === 'android' ? 'http://10.0.2.2:11434' : 'http://127.0.0.1:11434';

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
    //initialize providers with defaults
    this.providers.set('OLLAMA', new OllamaProvider(DEFAULT_URL));
    //universal on-device provider (routes to the platform local backend)
    this.providers.set('LOCAL', new LocalProvider());
  }

  //switch active provider from settings
  setMode(mode: string): void {
    //old 'aicore' setting maps to the universal local provider
    this.activeMode = (mode || 'ollama').toUpperCase() === 'AICORE' ? 'LOCAL' : (mode || 'ollama').toUpperCase();
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

  //check if a provider mode is available without switching active mode
  async isModeAvailable(mode: string): Promise<boolean> {
    const provider = this.providers.get((mode || 'ollama').toUpperCase());
    if (!provider) return false;
    try {
      return await provider.isAvailable();
    } catch (e) {
      return false;
    }
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

  //convert local image uris to base64
  private async processImages(messages: { role: string; content: string; images?: string[]; tool_calls?: any[] }[]): Promise<{ role: string; content: string; images?: string[]; tool_calls?: any[] }[]> {
    return Promise.all(
      messages.map(async (msg) => {
        if (!msg.images || msg.images.length === 0) return msg;
        const base64Images = await Promise.all(
          msg.images.map(async (uri) => {
            try {
              if (uri.startsWith('data:')) return uri.split(',')[1];
              const fileUri = uri.split('?name=')[0];
              return await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
            } catch (e) {
              console.error('Failed to read image as base64:', e);
              return uri;
            }
          })
        );
        return { ...msg, images: base64Images };
      })
    );
  }

  //queue any available context lines, only append the block when at least one exists
  private async buildContextBlock(): Promise<string> {
    if (!LocationService.getCached() && (await LocationService.hasPermission())) {
      await LocationService.refresh();
    }
    const lines: string[] = [];
    lines.push(`Current Date and Time: ${new Date().toLocaleString()}`);
    const locationContext = LocationService.getContextString();
    if (locationContext) lines.push(`User Location: ${locationContext}`);
    if (lines.length === 0) return '';
    return `\n\n[System Context]\n- ${lines.join('\n- ')}`;
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
    const processedMessages = await this.processImages(messages);
    const enhancedPrompt = systemPrompt + (await this.buildContextBlock());
    await provider.sendMessage(modelName, enhancedPrompt, processedMessages, onChunk, signal, options, onMetrics);
  }

  //send message with tool support (checks model capabilities)
  async sendMessageWithTools(
    modelName: string,
    systemPrompt: string,
    messages: { role: string; content: string; images?: string[]; tool_calls?: any[] }[],
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    options?: { think?: boolean | string },
    onMetrics?: (metrics: MessageMetrics) => void
  ): Promise<void> {
    const provider = this.getActiveProvider();

    //check if model supports tools
    let supportsTools = false;
    try {
      const caps = await this.getModelCapabilities(modelName);
      supportsTools = caps.includes('tools');
    } catch {}

    const tools = ToolManager.getDefinitions();
    const processedMessages = await this.processImages(messages);
    const enhancedPrompt = systemPrompt + (await this.buildContextBlock());

    if (tools.length === 0) {
      await provider.sendMessage(modelName, enhancedPrompt, processedMessages, onChunk, signal, options, onMetrics);
      return;
    }

    let currentMessages = [...processedMessages];
    let accumulated = '';
    const userOnChunk = onChunk;
    const streamingOnChunk = (chunk: string) => {
      accumulated += chunk;
      userOnChunk(chunk);
    };

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

    //one model round, true if tools ran
    const runToolRound = async (): Promise<boolean> => {
      //native tool calls or prompt injection fallback
      const beforeLen = accumulated.length;
      const result = supportsTools
        ? await provider.sendMessage(
            modelName, enhancedPrompt, currentMessages, streamingOnChunk, signal,
            { ...options, tools }, onMetrics
          )
        : await sendMessageWithToolPrompt(provider, modelName, enhancedPrompt, currentMessages, streamingOnChunk, signal, options, tools);

      if (!result?.toolCalls || result.toolCalls.length === 0) return false;

      //inject raw tool_calls json into stream
      //show ui bubble, keep tool call in history
      const roundChunk = accumulated.substring(beforeLen);
      if (!roundChunk.includes('"tool_calls"')) {
        for (const tc of result.toolCalls) {
          const argsJson = JSON.stringify(tc.function.arguments ?? {});
          const block = `\n\n{"tool_calls":[{"function":{"name":"${tc.function.name}","arguments":${argsJson}}}]}\n\n`;
          accumulated += block;
          streamingOnChunk(block);
        }
      }

      //add tool_calls message, visible text only
      currentMessages.push({
        role: 'assistant',
        content: (result.content || '').replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim(),
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
      return true;
    };

    //loop tools until answer (max 5 rounds)
    const MAX_TOOL_ROUNDS = 5;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      if (!(await runToolRound())) return;
    }

    //cap reached, force final generation
    //so the answer survives the last tool call
    await runToolRound();
  }
}

//export ai module singleton
export const AIModule = new CentralAIModule();
