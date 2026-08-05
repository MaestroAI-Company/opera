import { MessageMetrics } from '../db/DatabaseService';
import { ToolCall, ToolDefinition } from './tools/ITool';

export interface IAIProvider {
  //check if service is online
  isAvailable(): Promise<boolean>;

  //get available models
  getAvailableModels(): Promise<string[]>;

  //preload model
  preloadModel(modelName: string): Promise<void>;

  //get model capabilities (e.g. vision, tools)
  getModelCapabilities?(modelName: string): Promise<string[]>;

  //send message and stream response, returns tool calls if any
  sendMessage(
    modelName: string,
    systemPrompt: string,
    messages: { role: string; content: string; images?: string[]; tool_calls?: any[] }[],
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    options?: { think?: boolean | string; tools?: ToolDefinition[] },
    onMetrics?: (metrics: MessageMetrics) => void
  ): Promise<{ toolCalls?: ToolCall[], content?: string }>;

  //pull model (optional)
  downloadService?(modelName: string, onProgress?: (progress: number, etaSeconds: number, speedStr: string, sizeStr: string) => void): Promise<void>;
}
