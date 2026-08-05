import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import { IAIProvider } from './IAIProvider';
import { MessageMetrics } from '../db/DatabaseService';
import { ToolCall, ToolDefinition } from "./tools/ITool";
import {
  parseToolCalls,
  buildToolSystemPrompt,
  buildToolResultsPrompt,
  extractContentBeforeToolCalls,
} from "./tools/toolCallParser";

const MODULE =
  Platform.OS === "android" ? (NativeModules.AICoreModule as any) : null;

const MODEL_LABELS: Record<string, string> = {
  "aicore-nano-full-stable": "Gemini Nano - Full (Stable)",
  "aicore-nano-fast-stable": "Gemini Nano - Fast (Stable)",
  "aicore-nano-full-preview": "Gemini Nano - Full (Preview)",
  "aicore-nano-fast-preview": "Gemini Nano - Fast (Preview)",
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
      console.warn("AICore isAvailable error:", e);
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    if (!this.supported()) return [];
    try {
      return await MODULE.getAvailableModels();
    } catch (e) {
      console.warn("AICore getAvailableModels error:", e);
      return [];
    }
  }

  async preloadModel(modelName: string): Promise<void> {
    if (!this.supported()) return;
    try {
      //warm up client
      await MODULE.checkStatus(modelName);
    } catch (e) {
      console.warn("AICore preloadModel error:", e);
    }
  }

  async getModelCapabilities(modelName: string): Promise<string[]> {
    if (!this.supported()) return [];
    //add caps
    const caps = ["vision", "tools"];
    try {
      if (await MODULE.isThinkingModeAvailable(modelName))
        caps.push("thinking");
    } catch (e) {
      console.warn("AICore isThinkingModeAvailable error:", e);
    }
    return caps;
  }

  async sendMessage(
    modelName: string,
    systemPrompt: string,
    messages: {
      role: string;
      content: string;
      images?: string[];
      tool_calls?: any[];
    }[],
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    options?: { think?: boolean | string; tools?: ToolDefinition[] },
    onMetrics?: (metrics: MessageMetrics) => void
  ): Promise<{ toolCalls?: ToolCall[], content?: string }> {
    if (!this.supported()) throw new Error('AICore not available on this device');
    const requestId = `aicore_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const startTime = Date.now();

    const tools = options?.tools ?? [];
    const hasTools = tools.length > 0;

    //add tools to prompt
    const effectiveSystemPrompt = hasTools
      ? buildToolSystemPrompt(systemPrompt, tools)
      : systemPrompt;

    //build prompt
    const prompt = messages
      .filter((m) => m.role !== "tool")
      .map((m) => m.content)
      .filter((s) => s && s.trim().length > 0)
      .join("\n\n");

    //add tool results
    const toolResults = messages
      .filter((m) => m.role === "tool")
      .map((m) => `[SYSTEM: Automated Tool Execution Result]\n${m.content}`);
    const fullPrompt = buildToolResultsPrompt(prompt, toolResults);

    const firstImage =
      messages
        .flatMap((m) => m.images ?? [])
        .find((img) => img && img.length > 0) ?? null;

    const onAbort = () => {
      if (MODULE.abortGeneration) MODULE.abortGeneration(requestId);
    };
    signal?.addEventListener("abort", onAbort);

    try {
      return await new Promise<{ toolCalls?: ToolCall[], content?: string }>(
        (resolve, reject) => {
          let accumulated = "";
          //stream mode state
          let streamMode: boolean | null = hasTools ? null : true;

          const tokenSub = DeviceEventEmitter.addListener(
            "AICoreToken",
            (e: any) => {
              if (e.requestId !== requestId || !e.chunk) return;

              accumulated += e.chunk;

              if (streamMode === true) {
                onChunk(e.chunk);
                return;
              }

              if (streamMode === null) {
                const trimmed = accumulated.trimStart();
                if (trimmed.length === 0) return;

                //tolerate markdown json
                const isMarkdown = trimmed.startsWith("```");
                if (isMarkdown && trimmed.length < 10) return; //wait for full json block

                if (trimmed.startsWith("{") || trimmed.startsWith("```json")) {
                  //stream tool call for ui
                  streamMode = true;
                  onChunk(accumulated);
                } else {
                  //flush normal text
                  streamMode = true;
                  onChunk(accumulated);
                }
              }
            },
          );
          const errorSub = DeviceEventEmitter.addListener(
            "AICoreError",
            (e: any) => {
              if (e.requestId !== requestId) return;
              tokenSub.remove();
              errorSub.remove();
              reject(new Error(e.message || "AICore generation error"));
            },
          );
          const cleanup = () => {
            tokenSub.remove();
            errorSub.remove();
            signal?.removeEventListener("abort", onAbort);
          };

          MODULE.generateContentStream(
            modelName,
            effectiveSystemPrompt,
            fullPrompt,
            firstImage,
            !!options?.think,
            requestId,
          )
            .then(() => {
              cleanup();
              onMetrics?.({ model: modelName, timeSec: (Date.now() - startTime) / 1000 });
              if (!hasTools) {
                resolve({});
                return;
              }
              //parse accumulated json
              const knownNames = tools.map((t) => t.function.name);
              const cleanedAccumulated = accumulated.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '');
              const toolCalls = parseToolCalls(cleanedAccumulated, knownNames);
              if (toolCalls) {
                resolve({ toolCalls, content: extractContentBeforeToolCalls(accumulated) });
              } else {
                //flush non tool text if not already flushed
                if (streamMode !== true) {
                  onChunk(accumulated);
                }
                resolve({});
              }
            })
            .catch((e: any) => {
              cleanup();
              reject(
                e instanceof Error ? e : new Error(String(e?.message ?? e)),
              );
            });
        },
      );
    } catch (e) {
      signal?.removeEventListener("abort", onAbort);
      throw e;
    }
  }
}
