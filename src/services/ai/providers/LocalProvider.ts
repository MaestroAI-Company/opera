import { Platform } from 'react-native';
import { IAIProvider } from './IAIProvider';
import { AICoreProvider, getAICoreModelLabel } from './AICoreProvider';
import { BrowserAIProvider, getBrowserModelLabel, isBrowserModel } from './BrowserAIProvider';
import { currentPlatform } from './sources';
import { MessageMetrics } from '../../db/DatabaseService';
import { ToolCall, ToolDefinition } from "../tools/ITool";

//availability from the platform sdk
export type LocalModelStatus = 'unavailable' | 'downloadable' | 'downloading' | 'available';

//only what the sdk reports
export type LocalModelFacts = {
  id: string;
  label: string;
  status?: LocalModelStatus;
  version?: string;
  contextTokens?: number;
  thinking?: boolean;
};

export type LocalModelSheet = {
  runtime: string;
  family?: string;
  browser?: string;
  //the app starts downloads itself
  canDownload?: boolean;
  models: LocalModelFacts[];
};

//backend that describes models
export interface LocalBackend extends IAIProvider {
  getModelSheet(): Promise<LocalModelSheet>;
}

export function isLocalModel(modelName: string): boolean {
  return modelName.startsWith("aicore-") || isBrowserModel(modelName);
}

export function getLocalModelLabel(modelName: string, short = false): string {
  return isBrowserModel(modelName) ? getBrowserModelLabel() : getAICoreModelLabel(modelName, short);
}

//universal on-device provider: picks the local backend for the current platform
//android and web backends, rest todo
//unwired backends return unavailable so the provider stays hidden in the ui
function resolveBackend(): LocalBackend | null {
  if (Platform.OS === "android") return new AICoreProvider();
  if (currentPlatform() === "web") return new BrowserAIProvider();
  //todo: ios -> apple foundation models
  //todo: tauri windows -> phi silica
  //todo: tauri macos -> apple foundation models
  return null;
}

export class LocalProvider implements IAIProvider {
  private backend: LocalBackend | null;

  constructor() {
    this.backend = resolveBackend();
  }

  async isAvailable(): Promise<boolean> {
    if (!this.backend) return false;
    return this.backend.isAvailable();
  }

  async getAvailableModels(): Promise<string[]> {
    if (!this.backend) return [];
    return this.backend.getAvailableModels();
  }

  async preloadModel(modelName: string): Promise<void> {
    if (!this.backend) return;
    return this.backend.preloadModel(modelName);
  }

  async getModelCapabilities(modelName: string): Promise<string[]> {
    if (!this.backend || !this.backend.getModelCapabilities) return [];
    return this.backend.getModelCapabilities(modelName);
  }

  async downloadService(modelName: string, onProgress?: (progress: number, etaSeconds: number, speedStr: string, sizeStr: string) => void): Promise<void> {
    if (!this.backend?.downloadService) throw new Error("This on-device backend has nothing to download");
    return this.backend.downloadService(modelName, onProgress);
  }

  async getModelSheet(): Promise<LocalModelSheet | null> {
    if (!this.backend) return null;
    return this.backend.getModelSheet();
  }

  async sendMessage(
    modelName: string,
    systemPrompt: string,
    messages: { role: string; content: string; images?: string[]; tool_calls?: any[] }[],
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    options?: { think?: boolean | string; tools?: ToolDefinition[] },
    onMetrics?: (metrics: MessageMetrics) => void
  ): Promise<{ toolCalls?: ToolCall[], content?: string }> {
    if (!this.backend) throw new Error("No on-device AI backend on this platform");
    return this.backend.sendMessage(modelName, systemPrompt, messages, onChunk, signal, options, onMetrics);
  }
}
