import { getOpenAIApiKey, OPENAI_PROVIDER_ID } from '../ai/providers/sources';

export type LiveKind = 'openai' | 'gemini';

export type LiveBackend = {
  kind: LiveKind;
  url: string;
  model: string;
  //model accepts camera frames
  camera: boolean;
};

const GEMINI_HOST = 'generativelanguage.googleapis.com';
const OPENAI_HOST = 'api.openai.com';

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

//models that take and return audio
export function liveBackend(service: string, url: string, model: string): LiveBackend | null {
  if (service !== OPENAI_PROVIDER_ID || !model) return null;
  const name = model.replace(/^models\//, '');
  const host = hostOf(url);
  if (host === OPENAI_HOST && name.includes('realtime')) {
    return { kind: 'openai', url, model: name, camera: true };
  }
  if (host === GEMINI_HOST && /live|native-audio/.test(name)) {
    return { kind: 'gemini', url, model: name, camera: true };
  }
  return null;
}

//websocket url and auth for a backend
export async function liveEndpoint(backend: LiveBackend): Promise<{ wsUrl: string; apiKey: string }> {
  const apiKey = await getOpenAIApiKey(backend.url);
  if (backend.kind === 'gemini') {
    return {
      wsUrl: `wss://${GEMINI_HOST}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(apiKey)}`,
      apiKey,
    };
  }
  const base = backend.url.trim().replace(/\/+$/, '').replace(/^http/, 'ws');
  const root = base.endsWith('/v1') ? base : `${base}/v1`;
  return { wsUrl: `${root}/realtime?model=${encodeURIComponent(backend.model)}`, apiKey };
}
