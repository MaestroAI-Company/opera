import { IAIProvider } from './providers/IAIProvider';
import { OllamaProvider } from './providers/OllamaProvider';
import { ToolManager } from './tools/ToolManager';
import { ToolSource } from './tools/ITool';
import { sendMessageWithToolPrompt } from './tools/fallbackToolCall';
import { describeToolCallError } from './tools/toolCallParser';
import { SYSTEM_PROMPTS } from '../../../constants/prompts';
import { LocalModelSheet, LocalProvider } from './providers/LocalProvider';
import { LiteRTProvider } from './providers/LiteRTProvider';
import { MessageMetrics } from '../db/DatabaseService';
import { LocationService } from '../location/LocationService';
import { Settings } from '../settings/SettingsService';
import { DEFAULT_OLLAMA_URL, imageToBase64 } from './utils/imageToBase64';
import { resolveQuickFlow, QuickFlowTarget } from './quickFlow';
import { activeSourceKey, BETA_SERVER_URL, buildSources, getCapabilityOverride, getDisabledModels, getOllamaTuning, OPENAI_PROVIDER_ID, ModelSource } from './providers/sources';
import { OpenAIProvider } from './providers/OpenAIProvider';
import { getCachedModels, hydrateModelCache } from './providers/modelCache';

const DEFAULT_URL = DEFAULT_OLLAMA_URL;

class CentralAIModule {
  //state tracks tools only
  public SharedGenerationState = {
    activeToolName: null as string | null,
    activeToolArgs: null as any | null,
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
  //server of the active provider
  private activeUrl = '';

  constructor() {
    this.providers = new Map();
    //initialize providers with defaults
    this.providers.set('OLLAMA', new OllamaProvider(DEFAULT_URL));
    //universal on-device provider (routes to the platform local backend)
    this.providers.set('LOCAL', new LocalProvider());
    //litert-lm runs on-device hugging face models
    this.providers.set('LITERT', new LiteRTProvider());
    //hosted beta server, its own provider even though it speaks ollama
    if (BETA_SERVER_URL) this.providers.set('BETA', new OllamaProvider(BETA_SERVER_URL));
    //url arrives with first configure
    this.providers.set('OPENAI', new OpenAIProvider(''));
  }

  //switch active provider from settings
  setMode(mode: string): void {
    //old 'aicore' setting maps to the universal local provider
    this.activeMode = (mode || 'ollama').toUpperCase() === 'AICORE' ? 'LOCAL' : (mode || 'ollama').toUpperCase();
    this.modeConfigured = true;
  }

  //rebuild server providers with active url
  configure(activeUrl: string, contextLength?: number, keepAlive?: number): void {
    const raw = activeUrl.trim();
    const url = raw.length > 0 ? raw : DEFAULT_URL;
    this.activeUrl = raw;
    this.providers.set('OLLAMA', new OllamaProvider(url, {}, contextLength, keepAlive));
    //beta shares the tuning, never the url
    if (BETA_SERVER_URL) this.providers.set('BETA', new OllamaProvider(BETA_SERVER_URL, {}, contextLength, keepAlive));
    //openai servers have no tuning
    this.providers.set('OPENAI', new OpenAIProvider(raw));
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

  //built-in backend reports its models
  async getLocalModelSheet(): Promise<LocalModelSheet | null> {
    const provider = this.providers.get('LOCAL') as LocalProvider | undefined;
    return provider ? provider.getModelSheet() : null;
  }

  async getAvailableModels(): Promise<string[]> {
    const provider = this.getActiveProvider();
    return provider.getAvailableModels();
  }

  //build provider without touching active one
  private providerFor(mode: string, serverUrl?: string): IAIProvider | null {
    const key = (mode || 'ollama').toUpperCase() === 'AICORE' ? 'LOCAL' : (mode || 'ollama').toUpperCase();
    const url = (serverUrl ?? '').trim();
    if (key === 'OLLAMA') return url.length > 0 ? new OllamaProvider(url) : null;
    if (key === 'OPENAI') return url.length > 0 ? new OpenAIProvider(url) : null;
    return this.providers.get(key) ?? null;
  }

  async isSourceAvailable(mode: string, ollamaUrl?: string): Promise<boolean> {
    const provider = this.providerFor(mode, ollamaUrl);
    if (!provider) {
      console.warn(`[AIModule] no provider for source ${mode} ${ollamaUrl ?? ''}`);
      return false;
    }
    try {
      return await provider.isAvailable();
    } catch (error) {
      console.warn(`[AIModule] availability check threw for ${mode} ${ollamaUrl ?? ''}:`, error);
      return false;
    }
  }

  //settings need disabled models too
  async getModelsFor(mode: string, ollamaUrl?: string, includeDisabled = false): Promise<string[]> {
    const provider = this.providerFor(mode, ollamaUrl);
    if (!provider) {
      console.warn(`[AIModule] no provider for source ${mode} ${ollamaUrl ?? ''}`);
      return [];
    }
    try {
      const models = await provider.getAvailableModels();
      if (includeDisabled) return models;
      const disabled = new Set(getDisabledModels(mode, ollamaUrl ?? ''));
      return disabled.size > 0 ? models.filter((m) => !disabled.has(m)) : models;
    } catch (error) {
      console.warn(`[AIModule] model listing threw for ${mode} ${ollamaUrl ?? ''}:`, error);
      return [];
    }
  }

  //cached matches are tried first
  private async findSourceForModel(service: string, modelName: string, excludeKey?: string): Promise<ModelSource | null> {
    if (!modelName) return null;
    await hydrateModelCache();
    const candidates = buildSources(false)
      .filter((source) => source.service === service && source.key !== excludeKey)
      .sort((a, b) => Number(getCachedModels(b.key).includes(modelName)) - Number(getCachedModels(a.key).includes(modelName)));
    for (const source of candidates) {
      const models = await this.getModelsFor(source.service, source.url);
      if (models.includes(modelName)) return source;
    }
    return null;
  }

  //persist the switch for both screens
  private async switchToSource(source: ModelSource): Promise<void> {
    this.setMode(source.service);
    if (source.url) {
      const tuning = getOllamaTuning(source.url);
      this.configure(source.url, tuning.contextLength, tuning.keepAlive);
    }
    await Settings.setMany({ aiService: source.service, ollamaUrl: source.url });
  }

  //fail over to another source
  private async failoverIfUnreachable(modelName: string): Promise<void> {
    const settings = Settings.getCached();
    if (!modelName || !settings.modelFailover) return;
    //only servers can fail over
    if (settings.aiService !== 'ollama' && settings.aiService !== OPENAI_PROVIDER_ID) return;
    if (await this.isAvailable().catch(() => false)) return;
    const source = await this.findSourceForModel(settings.aiService, modelName, activeSourceKey(settings.aiService, settings.ollamaUrl));
    if (!source) return;
    console.warn(`[AIModule] server ${settings.ollamaUrl} unreachable, ${modelName} moved to ${source.key}`);
    await this.switchToSource(source);
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

  //download without switching source
  async downloadFor(mode: string, ollamaUrl: string | undefined, modelName: string, onProgress?: (progress: number, etaSeconds: number, speedStr: string, sizeStr: string) => void): Promise<void> {
    const provider = this.providerFor(mode, ollamaUrl);
    if (!provider?.downloadService) {
      throw new Error(`Download service not supported by ${mode}`);
    }
    return provider.downloadService(modelName, onProgress);
  }

  async getModelCapabilities(modelName: string): Promise<string[]> {
    if (!this.modeConfigured) return [];
    const provider = this.getActiveProvider();
    if (!provider.getModelCapabilities) return [];

    const override = getCapabilityOverride(this.activeMode.toLowerCase(), this.activeUrl, modelName);
    if (override) return override;

    const cacheKey = `${this.activeMode}:${modelName}`;
    const cached = this.capabilitiesCache.get(cacheKey);
    if (cached) return cached;

    const capabilities = await provider.getModelCapabilities(modelName);
    this.capabilitiesCache.set(cacheKey, capabilities);
    return capabilities;
  }

  //caps of any model, not just active
  async getModelCapabilitiesFor(mode: string, ollamaUrl: string | undefined, modelName: string): Promise<string[]> {
    const override = getCapabilityOverride(mode, ollamaUrl ?? '', modelName);
    if (override) return override;
    const provider = this.providerFor(mode, ollamaUrl);
    if (!provider?.getModelCapabilities) return [];

    const cacheKey = `${mode}:${ollamaUrl ?? ''}:${modelName}`;
    const cached = this.capabilitiesCache.get(cacheKey);
    if (cached) return cached;

    const capabilities = await provider.getModelCapabilities(modelName);
    //empty may mean failure, skip cache
    if (capabilities.length > 0) this.capabilitiesCache.set(cacheKey, capabilities);
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
              //picker query param breaks blob and data uris
              const clean = uri.split('?name=')[0];
              if (clean.startsWith('data:')) return clean.split(',')[1];
              return await imageToBase64(clean);
            } catch (e) {
              console.error('Failed to read image as base64:', e);
              //sending the raw uri would fail as invalid base64 server side
              throw new Error('failed to read an attachment');
            }
          })
        );
        return { ...msg, images: base64Images };
      })
    );
  }

    //append context lines when present
  buildContextBlock(): string {
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
    await this.failoverIfUnreachable(modelName);
    const provider = this.getActiveProvider();
    const processedMessages = await this.processImages(messages);
    const enhancedPrompt = systemPrompt + this.buildContextBlock();
    await provider.sendMessage(modelName, enhancedPrompt, processedMessages, onChunk, signal, options, onMetrics);
  }

  //one-shot call, provider from target
  async sendOn(
    target: QuickFlowTarget,
    systemPrompt: string,
    messages: { role: string; content: string; images?: string[] }[],
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    options?: { think?: boolean | string }
  ): Promise<void> {
    const provider = target.service
      ? this.providerFor(target.service, target.url)
      : this.getActiveProvider();
    if (!provider) throw new Error(`No AI provider for quick flow source: ${target.service}`);
    const processedMessages = await this.processImages(messages);
    const enhancedPrompt = systemPrompt + this.buildContextBlock();
    await provider.sendMessage(target.model, enhancedPrompt, processedMessages, onChunk, signal, options);
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
    onSources?: (sources: ToolSource[]) => void,
    toolFilter?: string[]
  ): Promise<void> {
    await this.failoverIfUnreachable(modelName);
    const provider = this.getActiveProvider();

    //check if model supports tools
    let supportsTools = false;
    try {
      const caps = await this.getModelCapabilities(modelName);
      supportsTools = caps.includes('tools');
    } catch {}

    const tools = ToolManager.getDefinitions(toolFilter);
    const processedMessages = await this.processImages(messages);
    const enhancedPrompt = systemPrompt + this.buildContextBlock();

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
      //chores use the quick flow model
      const target = resolveQuickFlow(modelName);
      const choreProvider = target.service ? this.providerFor(target.service, target.url) ?? provider : provider;
      await choreProvider.sendMessage(
        target.model, systemPrompt ?? SYSTEM_PROMPTS.SEARCH_SUMMARIZE,
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
        //unparsed tool call, tell the model why
        if (producedText.includes('tool_calls')) {
          currentMessages.push({ role: 'assistant', content: producedText });
          currentMessages.push({
            role: 'user',
            content: `[SYSTEM] Your tool call could not be read: ${describeToolCallError(producedText)}. If you still need the tool, output the tool call JSON again in the exact required format. Otherwise answer the user.`,
          });
          return 'tools';
        }
        return producedText.length > 0 ? 'answered' : 'empty';
      }

      //inject tool_calls json
      //tool call shows in ui and history
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

        //widget block shows the result
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
