import { Platform } from 'react-native';
import { IAIProvider } from './IAIProvider';
import { AICoreProvider } from './AICoreProvider';
import { MessageMetrics } from '../../db/DatabaseService';
import { ToolCall, ToolDefinition } from "../tools/ITool";

//universal on-device provider: picks the local backend for the current platform
//android -> aicore (gemini nano), ios -> apple foundation models, tauri windows -> phi silica, tauri macos -> apple foundation models
//unwired backends return unavailable so the provider stays hidden in the ui
function resolveBackend(): IAIProvider | null {
  if (Platform.OS === "android") return new AICoreProvider();
  //todo: ios -> apple foundation models
  //todo: tauri windows -> phi silica
  //todo: tauri macos -> apple foundation models
  return null;
}

export function getLocalProviderLabel(): string {
  if (Platform.OS === "android") return "On-Device AI";
  //todo: platform specific labels for ios / windows / macos
  return "On-Device AI";
}

export class LocalProvider implements IAIProvider {
  private backend: IAIProvider | null;

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
