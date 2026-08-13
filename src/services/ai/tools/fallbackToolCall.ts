import { IAIProvider } from '../IAIProvider';
import { ToolCall, ToolDefinition } from './ITool';
import {
  parseToolCalls,
  buildToolSystemPrompt,
  buildToolResultsPrompt,
  extractContentBeforeToolCalls,
} from './toolCallParser';

//fallback tool calling via prompt injection (same method as aicore)
export async function sendMessageWithToolPrompt(
  provider: IAIProvider,
  modelName: string,
  systemPrompt: string,
  messages: { role: string; content: string; images?: string[]; tool_calls?: any[] }[],
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
  options?: { think?: boolean | string },
  tools: ToolDefinition[] = [],
): Promise<{ toolCalls?: ToolCall[]; content?: string }> {
  const effectiveSystemPrompt = buildToolSystemPrompt(systemPrompt, tools);
  const prompt = messages
    .filter((m) => m.role !== "tool")
    .map((m) => m.content)
    .filter((s) => s && s.trim().length > 0)
    .join("\n\n");
  const toolResults = messages
    .filter((m) => m.role === "tool")
    .map((m) => `[SYSTEM: Automated Tool Execution Result]\n${m.content}`);
  const fullPrompt = buildToolResultsPrompt(prompt, toolResults);
  const images = messages.flatMap((m) => m.images ?? []);

  //payload serialization was overhead
  if (__DEV__) {
    console.log(`[fallbackToolCall] sending request to ${modelName}`, {
      tools: tools.length,
      think: !!options?.think,
    });
  }

  let accumulated = "";
  const result = await provider.sendMessage(
    modelName,
    effectiveSystemPrompt,
    [{ role: 'user', content: fullPrompt, images: images.length > 0 ? images : undefined }],
    (chunk) => { accumulated += chunk; onChunk(chunk); },
    signal,
    options,
  );

  //provider returned native tool calls, use them
  if (result?.toolCalls && result.toolCalls.length > 0) return result;

  //parse tool calls from streamed text
  const cleaned = accumulated.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '');
  const toolCalls = parseToolCalls(cleaned, tools.map((t) => t.function.name));
  if (toolCalls) return { toolCalls, content: extractContentBeforeToolCalls(accumulated) };
  return {};
}
