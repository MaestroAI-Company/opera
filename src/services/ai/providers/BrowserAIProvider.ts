import type { LocalBackend, LocalModelSheet, LocalModelStatus } from './LocalProvider';
import { t } from '../../../i18n';
import { MessageMetrics } from '../../db/DatabaseService';
import { ToolCall } from '../tools/ITool';

const MODEL_ID = 'browser-builtin';

//prompt api global, model optional
function languageModel(): any {
  return typeof globalThis !== 'undefined' ? (globalThis as any).LanguageModel : undefined;
}

//brand from client hints, model unnamed
function browserName(): string | undefined {
  const brands: { brand: string; version: string }[] | undefined =
    typeof navigator !== 'undefined' ? (navigator as any).userAgentData?.brands : undefined;
  if (!brands) return undefined;
  const real = brands.filter((b) => !/not.?a.?brand/i.test(b.brand));
  const pick = real.find((b) => b.brand !== 'Chromium') ?? real[0];
  return pick ? `${pick.brand} ${pick.version}` : undefined;
}

export function isBrowserModel(modelName: string): boolean {
  return modelName === MODEL_ID;
}

export function getBrowserModelLabel(): string {
  return t('settings.local.browserModel');
}

//built-in model via web prompt api
export class BrowserAIProvider implements LocalBackend {
  private async availability(): Promise<LocalModelStatus> {
    const api = languageModel();
    if (!api) return 'unavailable';
    try {
      return await api.availability();
    } catch (e) {
      console.warn('LanguageModel availability error:', e);
      return 'unavailable';
    }
  }

  async isAvailable(): Promise<boolean> {
    //downloadable models fetch on first session
    return (await this.availability()) !== 'unavailable';
  }

  async getAvailableModels(): Promise<string[]> {
    return languageModel() ? [MODEL_ID] : [];
  }

  async preloadModel(): Promise<void> {}

  //no tools, fallback prompts them in
  async getModelCapabilities(): Promise<string[]> {
    return [];
  }

  async getModelSheet(): Promise<LocalModelSheet> {
    const models = [];
    if (languageModel()) {
      const status = await this.availability();
      models.push({ id: MODEL_ID, label: getBrowserModelLabel(), status, contextTokens: await this.readContextWindow(status) });
    }
    return { runtime: 'Prompt API', browser: browserName(), canDownload: true, models };
  }

  //download needs a user gesture
  async downloadService(_modelName: string, onProgress?: (progress: number, etaSeconds: number, speedStr: string, sizeStr: string) => void): Promise<void> {
    const api = languageModel();
    if (!api) throw new Error('This browser has no built-in AI model');
    const session = await api.create({
      monitor(m: any) {
        m.addEventListener('downloadprogress', (e: any) => onProgress?.(e.loaded, 0, '', `${Math.round(e.loaded * 100)} %`));
      },
    });
    session.destroy();
  }

  //missing model session starts a download
  private async readContextWindow(status: LocalModelStatus): Promise<number | undefined> {
    if (status !== 'available') return undefined;
    try {
      const session = await languageModel().create();
      const size = session.contextWindow ?? session.inputQuota;
      session.destroy();
      return typeof size === 'number' ? size : undefined;
    } catch {
      return undefined;
    }
  }

  async sendMessage(
    modelName: string,
    systemPrompt: string,
    messages: { role: string; content: string; images?: string[]; tool_calls?: any[] }[],
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    _options?: unknown,
    onMetrics?: (metrics: MessageMetrics) => void
  ): Promise<{ toolCalls?: ToolCall[], content?: string }> {
    const api = languageModel();
    if (!api) throw new Error('This browser has no built-in AI model');
    //a session here downloads silently
    if ((await this.availability()) !== 'available') throw new Error(t('settings.local.notDownloaded'));
    const startTime = Date.now();

    //history seeds, last turn prompts
    const turns = messages.filter((m) => m.role !== 'tool' && m.content && m.content.trim().length > 0);
    const last = turns.pop();
    if (!last) return {};
    const initialPrompts = [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...turns.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    ];

    const session = await api.create({ initialPrompts, signal });
    try {
      for await (const chunk of session.promptStreaming(last.content, { signal })) {
        if (chunk) onChunk(chunk);
      }
      onMetrics?.({ model: modelName, timeSec: (Date.now() - startTime) / 1000 });
      return {};
    } finally {
      session.destroy();
    }
  }
}
