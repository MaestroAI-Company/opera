import { IAIProvider } from './IAIProvider';
import { ToolCall } from '../tools/ITool';

//native arm64 runtime, absent on web
export function getLiteRTModelLabel(modelName: string): string {
  return modelName;
}

export type LiteRTModelInfo = { id: string; label: string; sizeStr: string };

export function getInstalledLiteRTModels(): LiteRTModelInfo[] {
  return [];
}

export function isLiteRTModel(): boolean {
  return false;
}

export function isLiteRTModelDownloaded(): boolean {
  return false;
}

export function deleteLiteRTModel(): void {}

export class LiteRTDownloadCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'LiteRTDownloadCancelled';
  }
}

export async function getPendingLiteRTDownload(): Promise<string | null> {
  return null;
}

export function cancelLiteRTDownload(): void {}

export async function downloadLiteRTModel(): Promise<void> {
  throw new Error('LiteRT-LM is not available on this platform');
}

export type LiteRTDownloadSnapshot = { progress: number; etaSeconds: number; speedStr: string; sizeStr: string };

export function subscribeLiteRTDownload(): () => void {
  return () => {};
}

export function getLiteRTDownloadSnapshot(): LiteRTDownloadSnapshot | null {
  return null;
}

export class LiteRTProvider implements IAIProvider {
  async isAvailable(): Promise<boolean> {
    return false;
  }

  async getAvailableModels(): Promise<string[]> {
    return [];
  }

  async preloadModel(): Promise<void> {}

  async getModelCapabilities(): Promise<string[]> {
    return [];
  }

  async sendMessage(): Promise<{ toolCalls?: ToolCall[]; content?: string }> {
    throw new Error('LiteRT-LM is not available on this platform');
  }
}
