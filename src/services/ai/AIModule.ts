import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { IAIProvider } from './IAIProvider';
import { OllamaProvider } from './OllamaProvider';
import { ToolManager } from './tools/ToolManager';
import { sendMessageWithToolPrompt } from './tools/fallbackToolCall';
import { SYSTEM_PROMPTS } from '../../../constants/prompts';
import { AICoreProvider } from './AICoreProvider';
import { MessageMetrics } from '../db/DatabaseService';

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
    const enhancedPrompt = systemPrompt + `\n\n[System Context]\nCurrent Date and Time: ${new Date().toLocaleString()}`;
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
    const enhancedPrompt = systemPrompt + `\n\n[System Context]\nCurrent Date and Time: ${new Date().toLocaleString()}`;

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

    //one model round: stream, parse tool calls, execute them. returns true if tools ran
    const runToolRound = async (): Promise<boolean> => {
      //use native tool calling or fallback to prompt injection (aicore method)
      const beforeLen = accumulated.length;
      const result = supportsTools
        ? await provider.sendMessage(
            modelName, enhancedPrompt, currentMessages, streamingOnChunk, signal,
            { ...options, tools }, onMetrics
          )
        : await sendMessageWithToolPrompt(provider, modelName, enhancedPrompt, currentMessages, streamingOnChunk, signal, options, tools);

      if (!result?.toolCalls || result.toolCalls.length === 0) return false;

      //native tool calling streams tool_calls outside the content, inject the raw json
      //so the ui shows a bubble and the tool call stays visible in history
      const roundChunk = accumulated.substring(beforeLen);
      if (!roundChunk.includes('"tool_calls"')) {
        for (const tc of result.toolCalls) {
          const argsJson = JSON.stringify(tc.function.arguments ?? {});
          const block = `\n\n{"tool_calls":[{"function":{"name":"${tc.function.name}","arguments":${argsJson}}}]}\n\n`;
          accumulated += block;
          streamingOnChunk(block);
        }
      }

      //add assistant message with tool_calls to history (keep only visible text)
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

    //tool call loop: keep calling tools until the model answers (max 5 rounds)
    const MAX_TOOL_ROUNDS = 5;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      if (!(await runToolRound())) return;
    }

    //cap reached while the model kept requesting tools: force one final generation
    //round so the answer is never lost after the last tool call
    await runToolRound();
  }
}

//export ai module singleton
export const AIModule = new CentralAIModule();
