import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { LocalBackend, LocalModelSheet, LocalModelStatus } from './LocalProvider';
import { currentPlatform } from './sources';
import { MessageMetrics } from '../../db/DatabaseService';
import { ToolCall, ToolDefinition } from "../tools/ITool";
import {
  parseToolCalls,
  buildToolSystemPrompt,
  buildToolResultsPrompt,
  extractContentBeforeToolCalls,
} from "../tools/toolCallParser";

const MODEL_ID = "apple-fm-system";

export function getAppleFMModelLabel(modelName: string, short = false): string {
  return short ? "On-device" : "Apple Foundation Model";
}

//status codes from the native side
type AppleFMNative = {
  status(): Promise<number>;
  generate(requestId: string, system: string, prompt: string, onChunk: (chunk: string) => void): Promise<void>;
  abort(requestId: string): void;
};

const STATUS: Record<number, LocalModelStatus> = {
  0: "unavailable",
  1: "unavailable",
  2: "downloading",
  3: "available",
};

function iosNative(): AppleFMNative | null {
  const module = NativeModules.AppleFMModule;
  if (!module) return null;
  const emitter = new NativeEventEmitter(module);
  return {
    status: () => module.status(),
    generate: (requestId, system, prompt, onChunk) => {
      const sub = emitter.addListener("AppleFMToken", (e: any) => {
        if (e.requestId === requestId && e.chunk) onChunk(e.chunk);
      });
      return module.generate(requestId, system, prompt).finally(() => sub.remove());
    },
    abort: (requestId) => module.abort(requestId),
  };
}

export function isMacDesktop(): boolean {
  return currentPlatform() === "desktop" && /Mac/.test(navigator.userAgent);
}

function desktopNative(): AppleFMNative {
  return {
    status: async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<number>("afm_status");
    },
    generate: async (requestId, system, prompt, onChunk) => {
      const { invoke } = await import("@tauri-apps/api/core");
      const { listen } = await import("@tauri-apps/api/event");
      const unlisten = await listen<{ requestId: string; chunk: string }>("afm-token", (e) => {
        if (e.payload.requestId === requestId && e.payload.chunk) onChunk(e.payload.chunk);
      });
      try {
        await invoke("afm_generate", { requestId, system, prompt });
      } finally {
        unlisten();
      }
    },
    abort: (requestId) => {
      import("@tauri-apps/api/core").then(({ invoke }) => invoke("afm_abort", { requestId }));
    },
  };
}

function resolveNative(): AppleFMNative | null {
  if (Platform.OS === "ios") return iosNative();
  if (isMacDesktop()) return desktopNative();
  return null;
}

const native = resolveNative();

export class AppleFMProvider implements LocalBackend {
  private async status(): Promise<number> {
    if (!native) return 0;
    try {
      return await native.status();
    } catch (e) {
      console.warn("AppleFM status error:", e);
      return 0;
    }
  }

  async isAvailable(): Promise<boolean> {
    return (await this.status()) !== 0;
  }

  async getAvailableModels(): Promise<string[]> {
    return (await this.status()) !== 0 ? [MODEL_ID] : [];
  }

  async preloadModel(modelName: string): Promise<void> {}

  async getModelCapabilities(modelName: string): Promise<string[]> {
    return ["tools"];
  }

  async getModelSheet(): Promise<LocalModelSheet> {
    const status = await this.status();
    return {
      runtime: "Foundation Models · Apple Intelligence",
      family: "Apple Foundation Model",
      models: [{ id: MODEL_ID, label: getAppleFMModelLabel(MODEL_ID), status: STATUS[status] }],
    };
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
    if (!native) throw new Error('Apple Foundation Models not available on this device');
    const requestId = `applefm_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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

    const onAbort = () => native.abort(requestId);
    signal?.addEventListener("abort", onAbort);

    let accumulated = "";
    //stream mode state
    let streamMode: boolean | null = hasTools ? null : true;

    try {
      await native.generate(requestId, effectiveSystemPrompt, fullPrompt, (chunk) => {
        accumulated += chunk;

        if (streamMode === true) {
          onChunk(chunk);
          return;
        }

        if (streamMode === null) {
          const trimmed = accumulated.trimStart();
          if (trimmed.length === 0) return;

          //wait for full json block
          if (trimmed.startsWith("```") && trimmed.length < 10) return;

          streamMode = true;
          onChunk(accumulated);
        }
      });
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }

    onMetrics?.({ model: modelName, timeSec: (Date.now() - startTime) / 1000 });
    if (!hasTools) return {};

    //parse accumulated json
    const knownNames = tools.map((t) => t.function.name);
    const cleanedAccumulated = accumulated.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '');
    const toolCalls = parseToolCalls(cleanedAccumulated, knownNames);
    if (toolCalls) {
      return { toolCalls, content: extractContentBeforeToolCalls(accumulated) };
    }
    //flush non tool text if not already flushed
    if (streamMode !== true) onChunk(accumulated);
    return {};
  }
}
