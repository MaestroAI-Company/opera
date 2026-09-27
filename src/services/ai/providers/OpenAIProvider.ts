import { IAIProvider } from './IAIProvider';
import { ToolCall, ToolDefinition } from '../tools/ITool';
import { MessageMetrics } from '../../db/DatabaseService';
import { universalFetch } from '../utils/universalFetch';
import { sendMessageWithToolPrompt } from '../tools/fallbackToolCall';
import { getOpenAIApiKey } from './sources';

//unreachable ip blocks the socket
const PROBE_TIMEOUT_MS = 6000;
const MODELS_TIMEOUT_MS = 10000;

//no capability standard so allow all
const ALL_CAPABILITIES = ['tools', 'vision', 'thinking'];

type ChatMessage = { role: string; content: string; images?: string[]; tool_calls?: any[] };

//refusals learned per server and model
const rejectedFields = new Set<string>();
const rejectsTools = new Set<string>();

//bare host gets default version path
function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /^[a-z]+:\/\/[^/]+$/i.test(trimmed) ? `${trimmed}/v1` : trimmed;
}

//servers check the declared image type
function imageUrl(b64: string): string {
  const mime = b64.startsWith('iVBOR') ? 'image/png'
    : b64.startsWith('R0lGOD') ? 'image/gif'
    : b64.startsWith('UklGR') ? 'image/webp'
    : 'image/jpeg';
  return `data:${mime};base64,${b64}`;
}

//results pair to calls by id
function toOpenAIMessages(messages: ChatMessage[], nativeTools: boolean): any[] {
  const out: any[] = [];
  let pendingIds: string[] = [];
  messages.forEach((m, i) => {
    if (m.role === 'assistant' && nativeTools && m.tool_calls?.length) {
      //short alphanumeric ids suit strict servers
      pendingIds = m.tool_calls.map((tc, j) => tc.id ?? `call${String(i * 10 + j).padStart(5, '0')}`);
      out.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.tool_calls.map((tc, j) => ({
          id: pendingIds[j],
          type: 'function',
          function: {
            name: tc.function.name,
            arguments: typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments ?? {}),
          },
        })),
      });
      return;
    }
    if (m.role === 'tool') {
      const id = nativeTools ? pendingIds.shift() : undefined;
      //no native tools means text results
      out.push(id ? { role: 'tool', tool_call_id: id, content: m.content } : { role: 'user', content: `[Tool Result]\n${m.content}` });
      return;
    }
    //strict servers refuse empty assistant turns
    if (m.role === 'assistant' && !m.content?.trim()) return;
    if (!m.images || m.images.length === 0) {
      out.push({ role: m.role, content: m.content });
      return;
    }
    out.push({
      role: m.role,
      content: [
        { type: 'text', text: m.content },
        ...m.images.map((b64) => ({ type: 'image_url', image_url: { url: imageUrl(b64) } })),
      ],
    });
  });
  return out;
}

function parseArguments(raw: string): Record<string, any> {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    console.warn('[OpenAI] unreadable tool arguments:', raw.slice(0, 200));
    return {};
  }
}

//unknown field or unsupported feature
function isRejected(response: Response): boolean {
  return response.status === 400 || response.status === 422;
}

export class OpenAIProvider implements IAIProvider {
  private rawUrl: string;
  private baseUrl: string;
  private apiKey?: string;

  //unsaved servers pass their key directly
  constructor(baseUrl: string, apiKey?: string) {
    this.rawUrl = baseUrl.trim();
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.apiKey = apiKey?.trim();
  }

  //storage is async so read lazily
  private async authHeaders(): Promise<Record<string, string>> {
    this.apiKey ??= await getOpenAIApiKey(this.rawUrl);
    return this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {};
  }

  private isConfigured(): boolean {
    return this.baseUrl.length > 0;
  }

  private async fetchWithTimeout(url: string, init: any, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await universalFetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private async listModels(timeoutMs: number): Promise<string[]> {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/models`, { headers: await this.authHeaders() }, timeoutMs);
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Failed to fetch models: ${response.status} - ${text.slice(0, 200)}`);
    }
    const data = await response.json();
    if (!Array.isArray(data?.data)) {
      throw new Error(`Unexpected /models payload: ${JSON.stringify(data).slice(0, 200)}`);
    }
    return data.data.map((m: any) => m?.id).filter((id: unknown): id is string => typeof id === 'string');
  }

  async isAvailable(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      //model list also checks the key
      await this.listModels(PROBE_TIMEOUT_MS);
      return true;
    } catch (error) {
      console.warn(`[OpenAI] probe failed for ${this.baseUrl}:`, error);
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    if (!this.isConfigured()) return [];
    try {
      const models = await this.listModels(MODELS_TIMEOUT_MS);
      console.log(`[OpenAI] ${this.baseUrl} listed ${models.length} models`);
      return models;
    } catch (error) {
      console.warn(`[OpenAI] could not list models from ${this.baseUrl}:`, error);
      return [];
    }
  }

  //only server refusals remove a capability
  async getModelCapabilities(modelName: string): Promise<string[]> {
    const key = `${this.baseUrl}|${modelName}`;
    return ALL_CAPABILITIES.filter((c) =>
      !(c === 'tools' && rejectsTools.has(key)) &&
      !(c === 'thinking' && rejectedFields.has(`${key}|reasoning_effort`)));
  }

  //no warm-up endpoint in the protocol
  async preloadModel(): Promise<void> {}

  private async post(payload: Record<string, any>, signal?: AbortSignal): Promise<Response> {
    return universalFetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(await this.authHeaders()) },
      body: JSON.stringify(payload),
      signal,
    });
  }

  async sendMessage(
    modelName: string,
    systemPrompt: string,
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
    options?: { think?: boolean | string; tools?: ToolDefinition[] },
    onMetrics?: (metrics: MessageMetrics) => void
  ): Promise<{ toolCalls?: ToolCall[], content?: string }> {
    if (!this.isConfigured()) throw new Error('AI server not configured');

    const key = `${this.baseUrl}|${modelName}`;
    const tools = options?.tools ?? [];
    //model already refused native tools
    if (tools.length > 0 && rejectsTools.has(key)) {
      return sendMessageWithToolPrompt(this, modelName, systemPrompt, messages, onChunk, signal, { think: options?.think }, tools);
    }

    const nativeTools = tools.length > 0;
    const payload: Record<string, any> = {
      model: modelName,
      messages: [{ role: 'system', content: systemPrompt }, ...toOpenAIMessages(messages, nativeTools)],
      stream: true,
    };
    if (nativeTools) payload.tools = tools;
    //optional fields strict servers may refuse
    const extras: Record<string, any> = { stream_options: { include_usage: true } };
    //reflection levels match effort names
    if (typeof options?.think === 'string') extras.reasoning_effort = options.think;
    for (const field of Object.keys(extras)) {
      if (rejectedFields.has(`${key}|${field}`)) delete extras[field];
    }

    const startedAt = Date.now();
    let response = await this.post({ ...payload, ...extras }, signal);

    //drop named fields else all
    while (isRejected(response) && Object.keys(extras).length > 0) {
      const errorText = await response.text().catch(() => '');
      const named = Object.keys(extras).filter((field) => errorText.includes(field));
      const dropped = named.length > 0 ? named : Object.keys(extras);
      console.warn(`[OpenAI] ${this.baseUrl} refused ${dropped.join(', ')} (${response.status}), retrying without`);
      for (const field of dropped) delete extras[field];
      response = await this.post({ ...payload, ...extras }, signal);
      //keep a guess only once confirmed
      if (named.length > 0 || response.ok) {
        for (const field of dropped) rejectedFields.add(`${key}|${field}`);
      }
    }

    if (isRejected(response) && nativeTools) {
      console.warn(`[OpenAI] ${this.baseUrl} refused native tools for ${modelName} (${response.status}), using prompt tools`);
      await response.text().catch(() => '');
      const result = await sendMessageWithToolPrompt(this, modelName, systemPrompt, messages, onChunk, signal, { think: options?.think }, tools);
      rejectsTools.add(key);
      return result;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    //protocol cannot stop reasoning so hide
    const showReasoning = options?.think !== false;
    let isThinkingMode = false;
    let accumulatedContent = '';
    let firstTokenAt = 0;
    let promptTokens: number | undefined;
    let completionTokens: number | undefined;
    type ToolSlot = { id?: string; index?: number; name: string; args: string };
    const toolSlots: ToolSlot[] = [];

    //calls stream by index or whole
    const slotFor = (tc: any): ToolSlot => {
      const index = typeof tc.index === 'number' ? tc.index : undefined;
      if (tc.id) {
        const byId = toolSlots.find((s) => s.id === tc.id);
        if (byId) return byId;
      } else {
        const continued = index === undefined
          ? toolSlots[toolSlots.length - 1]
          : [...toolSlots].reverse().find((s) => s.index === index);
        if (continued) return continued;
      }
      const slot: ToolSlot = { id: tc.id, index, name: '', args: '' };
      toolSlots.push(slot);
      return slot;
    };

    const emitReasoning = (text: string) => {
      if (!showReasoning || !text) return;
      if (!isThinkingMode) {
        onChunk('<think>\n');
        isThinkingMode = true;
      }
      onChunk(text);
    };

    const emitContent = (text: string) => {
      if (!text) return;
      if (isThinkingMode) {
        onChunk('\n</think>\n');
        isThinkingMode = false;
      }
      accumulatedContent += text;
      onChunk(text);
    };

    //sse payload follows the data prefix
    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) return;
      const body = trimmed.slice(5).trim();
      if (body === '' || body === '[DONE]') return;
      let parsed: any;
      try {
        parsed = JSON.parse(body);
      } catch {
        console.warn('Failed to parse OpenAI chunk:', line);
        return;
      }
      //errors can arrive mid stream
      if (parsed.error) throw new Error(parsed.error.message ?? JSON.stringify(parsed.error));

      //usage comes last without choices
      if (parsed.usage) {
        if (typeof parsed.usage.prompt_tokens === 'number') promptTokens = parsed.usage.prompt_tokens;
        if (typeof parsed.usage.completion_tokens === 'number') completionTokens = parsed.usage.completion_tokens;
      }
      const delta = parsed.choices?.[0]?.delta;
      if (!delta) return;
      if (!firstTokenAt) firstTokenAt = Date.now();

      //reasoning field name varies by server
      const reasoning = typeof delta.reasoning_content === 'string' ? delta.reasoning_content : delta.reasoning;
      if (typeof reasoning === 'string') emitReasoning(reasoning);

      if (typeof delta.content === 'string') {
        emitContent(delta.content);
      } else if (Array.isArray(delta.content)) {
        //content may come as typed parts
        for (const part of delta.content) {
          if (part?.type === 'text' && typeof part.text === 'string') emitContent(part.text);
          else if (part?.type === 'thinking' || part?.type === 'reasoning') {
            const inner = part.thinking ?? part.reasoning ?? part.text;
            const thought = Array.isArray(inner)
              ? inner.map((t: any) => (typeof t?.text === 'string' ? t.text : '')).join('')
              : typeof inner === 'string' ? inner : '';
            emitReasoning(thought);
          }
        }
      }

      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const slot = slotFor(tc);
          if (tc.id) slot.id = tc.id;
          if (tc.function?.name && !slot.name) slot.name = tc.function.name;
          const args = tc.function?.arguments;
          if (typeof args === 'string') slot.args += args;
          else if (args && typeof args === 'object') slot.args = JSON.stringify(args);
        }
      }
    };

    //json can split across network chunks
    let pendingLine = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = (pendingLine + decoder.decode(value, { stream: true })).split('\n');
      //last piece may be incomplete
      pendingLine = lines.pop() ?? '';

      for (const line of lines) {
        handleLine(line);
      }
    }
    //stream may end without newline
    handleLine(pendingLine);

    //stream can stop mid thought
    if (isThinkingMode) {
      onChunk('\n</think>\n');
    }

    if (onMetrics) {
      const endedAt = Date.now();
      const genSec = (endedAt - (firstTokenAt || startedAt)) / 1000;
      onMetrics({
        model: modelName,
        timeSec: (endedAt - startedAt) / 1000,
        tokens: completionTokens,
        tokensPerSec: genSec > 0 && completionTokens ? completionTokens / genSec : undefined,
        contextTokens: promptTokens ? promptTokens + (completionTokens || 0) : undefined,
      });
    }

    const toolCalls: ToolCall[] = toolSlots
      .filter((s) => s.name)
      .map((s) => ({ id: s.id, function: { name: s.name, arguments: parseArguments(s.args) } }));

    return {
      content: accumulatedContent.trim(),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}
