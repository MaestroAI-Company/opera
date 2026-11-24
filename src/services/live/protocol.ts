import type { ToolDefinition } from '../ai/tools/ITool';
import { HUB_URL_SCHEME, SamplerHub } from '../hub/SamplerHubService';

export type LiveToolCall = { id: string; name: string; args: Record<string, any> };
export type LiveToolResult = { call: LiveToolCall; output: string };

//events every live protocol reports
export type ProtocolEvents = {
  //model waits for these results
  toolCalls(calls: LiveToolCall[]): void;
  audio(samples: Float32Array): void;
  assistantText(delta: string): void;
  userText(delta: string): void;
  //user spoke over the reply
  speechStarted(): void;
  responseDone(tokens?: number): void;
  error(message: string): void;
};

export type LiveProtocol = {
  inputRate: number;
  outputRate: number;
  //server detects the end of turns
  serverVad: boolean;
  transcribesUser: boolean;
  appendAudio(pcm16Base64: string): void;
  //client vad decided the user finished
  endTurn(): void;
  sendFrame(jpegBase64: string): void;
  //results then the model goes on
  sendToolResults(results: LiveToolResult[]): void;
  cancel(): void;
  close(): void;
};

export type ProtocolOptions = {
  wsUrl: string;
  apiKey: string;
  model: string;
  instructions: string;
  tools: ToolDefinition[];
  events: ProtocolEvents;
};

//tool args arrive as a json string
export function parseArgs(raw: unknown): Record<string, any> {
  if (raw && typeof raw === 'object') return raw as Record<string, any>;
  try {
    return JSON.parse(String(raw || '{}'));
  } catch {
    return {};
  }
}

const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

//servers may send json in binary frames
export async function frameText(data: unknown): Promise<string> {
  if (typeof data === 'string') return data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) return data.text();
  const bytes = new Uint8Array(data as ArrayBuffer);
  if (decoder) return decoder.decode(bytes);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return decodeURIComponent(escape(binary));
}

//rn websocket takes headers as a third argument
export function openSocket(url: string, protocols?: string[], headers?: Record<string, string>): WebSocket {
  if (url.startsWith(HUB_URL_SCHEME)) return SamplerHub.realtimeSocket(url);
  const Socket = WebSocket as unknown as new (u: string, p?: string[], o?: { headers?: Record<string, string> }) => WebSocket;
  const ws = headers ? new Socket(url, protocols, { headers }) : new Socket(url, protocols);
  ws.binaryType = 'arraybuffer';
  return ws;
}

//resolves on the first message matching the check
export function waitFor(ws: WebSocket, check: (msg: any) => boolean, timeoutMs = 15000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('live session timed out')), timeoutMs);
    const onMessage = async (e: MessageEvent) => {
      try {
        const msg = JSON.parse(await frameText(e.data));
        if (msg.type === 'error') done(new Error(msg.error?.message ?? 'live session error'));
        else if (check(msg)) done(null, msg);
      } catch {}
    };
    const onClose = (e: CloseEvent) => done(new Error(e.reason || 'live session closed'));
    const onError = () => done(new Error('cannot reach the live server'));
    function done(err: Error | null, msg?: any) {
      clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
      ws.removeEventListener('close', onClose);
      ws.removeEventListener('error', onError);
      if (err) reject(err);
      else resolve(msg);
    }
    ws.addEventListener('message', onMessage);
    ws.addEventListener('close', onClose);
    ws.addEventListener('error', onError);
  });
}
