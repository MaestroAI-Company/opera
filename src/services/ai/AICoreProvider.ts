import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import { IAIProvider } from './IAIProvider';
import { MessageMetrics } from '../db/DatabaseService';

const MODULE = Platform.OS === 'android' ? (NativeModules.AICoreModule as any) : null;

const MODEL_LABELS: Record<string, string> = {
  'aicore-nano-full-stable': 'Gemini Nano - Full (Stable)',
  'aicore-nano-fast-stable': 'Gemini Nano - Fast (Stable)',
  'aicore-nano-full-preview': 'Gemini Nano - Full (Preview)',
  'aicore-nano-fast-preview': 'Gemini Nano - Fast (Preview)',
};

export function getAICoreModelLabel(modelName: string): string {
  return MODEL_LABELS[modelName] || modelName;
}

export class AICoreProvider implements IAIProvider {
  private supported(): boolean {
    return MODULE !== null;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.supported()) return false;
    try {
      return !!(await MODULE.isAvailable());
    } catch (e) {
      console.warn('AICore isAvailable error:', e);
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    if (!this.supported()) return [];
    try {
      return await MODULE.getAvailableModels();
    } catch (e) {
      console.warn('AICore getAvailableModels error:', e);
      return [];
    }
  }

  async preloadModel(modelName: string): Promise<void> {
    if (!this.supported()) return;
    try {
      //checkStatus warms up the gemini client
      await MODULE.checkStatus(modelName);
    } catch (e) {
      console.warn('AICore preloadModel error:', e);
    }
  }

  async getModelCapabilities(modelName: string): Promise<string[]> {
    if (!this.supported()) return [];
    //gemini nano supports image inputs
    const caps = ['vision'];
    try {
      if (await MODULE.isThinkingModeAvailable(modelName)) caps.push('thinking');
    } catch (e) {
      console.warn('AICore isThinkingModeAvailable error:', e);
    }
    return caps;
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
    if (!this.supported()) throw new Error('AICore not available on this device');
    const requestId = `aicore_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const startTime = Date.now();

    const prompt = messages.map(m => m.content)
      .filter(s => s && s.trim().length > 0)
      .join('\n\n');

    const firstImage = messages.flatMap(m => m.images ?? []).find(img => img && img.length > 0) ?? null;

    const onAbort = () => {
      if (MODULE.abortGeneration) MODULE.abortGeneration(requestId);
    };
    signal?.addEventListener('abort', onAbort);

    try {
      await new Promise<void>((resolve, reject) => {
        const tokenSub = DeviceEventEmitter.addListener('AICoreToken', (e: any) => {
          if (e.requestId === requestId && e.chunk) onChunk(e.chunk);
        });
        const errorSub = DeviceEventEmitter.addListener('AICoreError', (e: any) => {
          if (e.requestId !== requestId) return;
          tokenSub.remove();
          errorSub.remove();
          reject(new Error(e.message || 'AICore generation error'));
        });
        const cleanup = () => {
          tokenSub.remove();
          errorSub.remove();
          signal?.removeEventListener('abort', onAbort);
        };

        MODULE.generateContentStream(modelName, systemPrompt, prompt, firstImage, !!options?.think, requestId)
          .then(() => {
            cleanup();
            onMetrics?.({ model: modelName, timeSec: (Date.now() - startTime) / 1000 });
            resolve();
          })
          .catch((e: any) => {
            cleanup();
            reject(e instanceof Error ? e : new Error(String(e?.message ?? e)));
          });
      });
    } catch (e) {
      signal?.removeEventListener('abort', onAbort);
      throw e;
    }
  }
}
