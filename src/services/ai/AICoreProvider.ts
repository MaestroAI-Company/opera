import { DeviceEventEmitter, NativeModules, Platform } from "react-native";
import { IAIProvider } from "./IAIProvider";
import { ToolCall, ToolDefinition } from "./tools/ITool";

const MODULE =
  Platform.OS === "android" ? (NativeModules.AICoreModule as any) : null;

//normalize tool name
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

//extract json block
function extractBracesBlock(text: string, start: number): string | null {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

//parse nano tool calls
function parseToolCalls(text: string, knownNames: string[]): ToolCall[] | null {
  const result: ToolCall[] = [];

  //regex to find function opening
  const regex = /"function"\s*:\s*\{/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    //start of match
    const objStart = match.index + match[0].length - 1;

    const block = extractBracesBlock(text, objStart);
    if (!block) continue;

    try {
      const funcValue = JSON.parse(block);
      if (
        typeof funcValue?.name === "string" &&
        typeof funcValue?.arguments === "object"
      ) {
        //match tool name
        const normalized = normalizeName(funcValue.name);
        const matched =
          knownNames.find((n) => normalizeName(n) === normalized) ??
          funcValue.name;
        result.push({
          function: { name: matched, arguments: funcValue.arguments },
        });
      }
    } catch {}

    //advance regex index
    regex.lastIndex = objStart + block.length;
  }

  return result.length > 0 ? result : null;
}

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
  ): Promise<{ toolCalls?: ToolCall[] }> {
    if (!this.supported())
      throw new Error("AICore not available on this device");
    const requestId = `aicore_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const tools = options?.tools ?? [];
    const hasTools = tools.length > 0;

    //add tools to prompt
    const effectiveSystemPrompt = hasTools
      ? systemPrompt +
        `\n\n[Available Tools]\n${JSON.stringify(tools, null, 2)}\n\nCRITICAL INSTRUCTION: If you need to call a tool, you MUST output ONLY the raw JSON block. DO NOT write any conversational text (e.g. "Je vais chercher..."). DO NOT wrap the JSON in markdown backticks. Output EXACTLY and ONLY this format:\n{"tool_calls":[{"function":{"name":"<tool_name>","arguments":{<args>}}}]}\nIf you do not need tools, respond normally.`
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
      .map((m) => `[Tool Result]\n${m.content}`);
    const fullPrompt =
      toolResults.length > 0
        ? prompt + "\n\n" + toolResults.join("\n\n")
        : prompt;

    const firstImage =
      messages
        .flatMap((m) => m.images ?? [])
        .find((img) => img && img.length > 0) ?? null;

    const onAbort = () => {
      if (MODULE.abortGeneration) MODULE.abortGeneration(requestId);
    };
    signal?.addEventListener("abort", onAbort);

    try {
      return await new Promise<{ toolCalls?: ToolCall[] }>(
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
                  //buffer tool call
                  streamMode = false;
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
              if (!hasTools) {
                resolve({});
                return;
              }
              //parse accumulated json
              const knownNames = tools.map((t) => t.function.name);
              const toolCalls = parseToolCalls(accumulated, knownNames);
              if (toolCalls) {
                resolve({ toolCalls });
              } else {
                //flush non tool text
                onChunk(accumulated);
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
