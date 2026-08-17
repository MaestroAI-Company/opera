import { IAIProvider } from './providers/IAIProvider';
import { OllamaProvider } from './providers/OllamaProvider';
import { ToolManager } from './tools/ToolManager';
import { ToolSource } from './tools/ITool';
import { sendMessageWithToolPrompt } from './tools/fallbackToolCall';
import { SYSTEM_PROMPTS } from '../../../constants/prompts';
import { LocalProvider } from './providers/LocalProvider';
import { MessageMetrics } from '../db/DatabaseService';
import { LocationService } from '../location/LocationService';
import { Settings } from '../settings/SettingsService';
import { DEFAULT_OLLAMA_URL, imageToBase64 } from './utils/imageToBase64';

const DEFAULT_URL = DEFAULT_OLLAMA_URL;

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
  //mode guessed until settings load
  private modeConfigured = false;
  //model caps need an http call
  private capabilitiesCache = new Map<string, string[]>();

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
    this.modeConfigured = true;
  }

  //reconfigure ollama provider with url from settings
  configure(ollamaUrl: string, contextLength?: number, keepAlive?: number): void {
    const url = ollamaUrl.trim().length > 0 ? ollamaUrl.trim() : DEFAULT_URL;
    this.providers.set('OLLAMA', new OllamaProvider(url, {}, contextLength, keepAlive));
    //new server can serve different models
    this.capabilitiesCache.clear();
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
    } catch {
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    const provider = this.getActiveProvider();
    return provider.getAvailableModels();
  }

  //build provider without touching active one
  private providerFor(mode: string, ollamaUrl?: string): IAIProvider | null {
    const key = (mode || 'ollama').toUpperCase() === 'AICORE' ? 'LOCAL' : (mode || 'ollama').toUpperCase();
    if (key === 'OLLAMA') {
      const url = (ollamaUrl ?? '').trim();
      return url.length > 0 ? new OllamaProvider(url) : null;
    }
    return this.providers.get(key) ?? null;
  }

  async isSourceAvailable(mode: string, ollamaUrl?: string): Promise<boolean> {
    const provider = this.providerFor(mode, ollamaUrl);
    if (!provider) return false;
    try {
      return await provider.isAvailable();
    } catch {
      return false;
    }
  }

  async getModelsFor(mode: string, ollamaUrl?: string): Promise<string[]> {
    const provider = this.providerFor(mode, ollamaUrl);
    if (!provider) return [];
    try {
      return await provider.getAvailableModels();
    } catch {
      return [];
    }
  }

  async preloadModel(modelName: string): Promise<void> {
    //no provider until settings land
    if (!this.modeConfigured) return;
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
    if (!this.modeConfigured) return [];
    const provider = this.getActiveProvider();
    if (!provider.getModelCapabilities) return [];

    const cacheKey = `${this.activeMode}:${modelName}`;
    const cached = this.capabilitiesCache.get(cacheKey);
    if (cached) return cached;

    const capabilities = await provider.getModelCapabilities(modelName);
    this.capabilitiesCache.set(cacheKey, capabilities);
    return capabilities;
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
              return await imageToBase64(uri);
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

    //append context lines when present
  private async buildContextBlock(): Promise<string> {
    //use cached location refresh async
    if (!LocationService.getCached()) {
      LocationService.hasPermission().then((granted) => {
        if (granted) LocationService.refresh().catch(() => {});
      });
    }

    const lines: string[] = [];
    if (Settings.getCached().includeDateTime) {
      lines.push(`Current Date and Time: ${new Date().toLocaleString()}`);
    }
    const userName = Settings.getCached().name.trim();
    if (userName) lines.push(`User Name: ${userName}`);
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
    onMetrics?: (metrics: MessageMetrics) => void,
    onSources?: (sources: ToolSource[]) => void
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
    const sources: ToolSource[] = [];
    const recordSource = (source: ToolSource) => {
      //fetch result upgrades earlier search-only entry
      const existingIdx = sources.findIndex(s => s.url === source.url);
      if (existingIdx !== -1) {
        if (!sources[existingIdx].favicon && source.favicon) sources[existingIdx] = source;
        return;
      }
      sources.push(source);
      onSources?.([...sources]);
    };
    const userOnChunk = onChunk;
    const streamingOnChunk = (chunk: string) => {
      accumulated += chunk;
      userOnChunk(chunk);
    };

    //isolated call, system prompt is overridable
    const summarize = async (text: string, systemPrompt?: string): Promise<string> => {
      let summary = '';
      await provider.sendMessage(
        modelName, systemPrompt ?? SYSTEM_PROMPTS.SEARCH_SUMMARIZE,
        [{ role: 'user', content: text }],
        chunk => { summary += chunk; },
        signal,
        { think: false }
      );
      return summary;
    };

    //outcome of a tool round
    const runToolRound = async (): Promise<'tools' | 'answered' | 'empty'> => {
      //native or injected tool calls
      const beforeLen = accumulated.length;
      const result = supportsTools
        ? await provider.sendMessage(
            modelName, enhancedPrompt, currentMessages, streamingOnChunk, signal,
            { ...options, tools }, onMetrics
          )
        : await sendMessageWithToolPrompt(provider, modelName, enhancedPrompt, currentMessages, streamingOnChunk, signal, options, tools);

      if (!result?.toolCalls || result.toolCalls.length === 0) {
        //empty means the model stayed silent
        const producedText = accumulated.substring(beforeLen).replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim();
        return producedText.length > 0 ? 'answered' : 'empty';
      }

      //inject tool_calls json
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

      //text-only tool_calls message
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

        const toolResult = await ToolManager.execute(tc.function.name, tc.function.arguments, summarize, recordSource);

        this.SharedGenerationState.activeToolName = null;
        this.SharedGenerationState.activeToolArgs = null;
        this.SharedGenerationState.notify();

        //widget block replaces tool bubble
        const widgetBlock = ToolManager.buildWidgetBlock(toolName, tc.function.arguments, toolResult);
        if (widgetBlock) streamingOnChunk(widgetBlock);

        currentMessages.push({ role: 'tool', content: toolResult });
      }
      return 'tools';
    };

    //loop tools up to 5 rounds
    const MAX_TOOL_ROUNDS = 5;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const outcome = await runToolRound();
      if (outcome === 'answered') return;
      if (outcome === 'empty') break;
    }

    //cap or silence, force a final answer
    //reoffering tools loops forever
    await provider.sendMessage(
      modelName, enhancedPrompt, currentMessages, streamingOnChunk, signal,
      { think: options?.think }, onMetrics
    );
  }
}

//export ai module singleton
export const AIModule = new CentralAIModule();
