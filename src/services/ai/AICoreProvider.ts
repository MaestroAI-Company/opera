import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import { IAIProvider } from './IAIProvider';
import { ToolCall, ToolDefinition } from './tools/ITool';

const MODULE = Platform.OS === 'android' ? (NativeModules.AICoreModule as any) : null;

//normalize tool name for fuzzy matching
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

//extract balanced braces block from text starting at given index
function extractBracesBlock(text: string, start: number): string | null {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

//parse tool calls from nano text response, resilient to malformed json
function parseToolCalls(text: string, knownNames: string[]): ToolCall[] | null {
  const result: ToolCall[] = [];
  let i = 0;

  while (i < text.length) {
    //find next function key
    const funcIdx = text.indexOf('"function":', i);
    if (funcIdx === -1) break;

    //find opening brace of function value
    const objStart = text.indexOf('{', funcIdx + '"function":'.length);
    if (objStart === -1) break;

    //extract balanced block
    const block = extractBracesBlock(text, objStart);
    if (!block) break;

    try {
      const funcValue = JSON.parse(block);
      if (typeof funcValue?.name === 'string' && typeof funcValue?.arguments === 'object') {
        //fuzzy match against registered tool names
        const normalized = normalizeName(funcValue.name);
        const matched = knownNames.find(n => normalizeName(n) === normalized) ?? funcValue.name;
        result.push({ function: { name: matched, arguments: funcValue.arguments } });
      }
    } catch {}

    i = objStart + (block?.length ?? 1);
  }

  return result.length > 0 ? result : null;
}

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
      //warm up gemini client
      await MODULE.checkStatus(modelName);
    } catch (e) {
      console.warn('AICore preloadModel error:', e);
    }
  }

  async getModelCapabilities(modelName: string): Promise<string[]> {
    if (!this.supported()) return [];
    //nano supports vision and prompt-based tool calling
    const caps = ['vision', 'tools'];
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
    messages: { role: string; content: string; images?: string[]; tool_calls?: any[] }[],
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    options?: { think?: boolean | string; tools?: ToolDefinition[] }
  ): Promise<{ toolCalls?: ToolCall[] }> {
    if (!this.supported()) throw new Error('AICore not available on this device');
    const requestId = `aicore_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const tools = options?.tools ?? [];
    const hasTools = tools.length > 0;

    //inject tool definitions into system prompt
    const effectiveSystemPrompt = hasTools
      ? systemPrompt + `\n\n[Available Tools]\n${JSON.stringify(tools, null, 2)}\n\nIf you need to call a tool, respond ONLY with valid JSON in this exact format (no other text):\n{"tool_calls":[{"function":{"name":"<tool_name>","arguments":{<args>}}}]}\nOtherwise respond normally.`
      : systemPrompt;

    //build prompt from history, skip tool result messages
    const prompt = messages
      .filter(m => m.role !== 'tool')
      .map(m => m.content)
      .filter(s => s && s.trim().length > 0)
      .join('\n\n');

    //append tool results as context
    const toolResults = messages
      .filter(m => m.role === 'tool')
      .map(m => `[Tool Result]\n${m.content}`);
    const fullPrompt = toolResults.length > 0 ? prompt + '\n\n' + toolResults.join('\n\n') : prompt;

    const firstImage = messages.flatMap(m => m.images ?? []).find(img => img && img.length > 0) ?? null;

    const onAbort = () => {
      if (MODULE.abortGeneration) MODULE.abortGeneration(requestId);
    };
    signal?.addEventListener('abort', onAbort);

    try {
      return await new Promise<{ toolCalls?: ToolCall[] }>((resolve, reject) => {
        let accumulated = '';
        //lookahead: null=undecided, true=streaming, false=accumulating
        let streamMode: boolean | null = hasTools ? null : true;

        const tokenSub = DeviceEventEmitter.addListener('AICoreToken', (e: any) => {
          if (e.requestId !== requestId || !e.chunk) return;

          if (streamMode === true) {
            //stream chunk directly
            onChunk(e.chunk);
            return;
          }

          accumulated += e.chunk;

          if (streamMode === null) {
            //wait for first non whitespace char
            const firstChar = accumulated.trimStart()[0];
            if (!firstChar) return;

            if (firstChar === '{') {
              //potential tool call, accumulate
              streamMode = false;
            } else {
              //normal text, flush and stream
              streamMode = true;
              onChunk(accumulated);
              accumulated = '';
            }
          }
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

        MODULE.generateContentStream(modelName, effectiveSystemPrompt, fullPrompt, firstImage, !!options?.think, requestId)
          .then(() => {
            cleanup();
            if (!hasTools || streamMode === true) {
              resolve({});
              return;
            }
            //parse tool call json from accumulated response
            const knownNames = tools.map(t => t.function.name);
            const toolCalls = parseToolCalls(accumulated, knownNames);
            if (toolCalls) {
              resolve({ toolCalls });
            } else {
              //not a tool call, flush to ui
              onChunk(accumulated);
              resolve({});
            }
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
