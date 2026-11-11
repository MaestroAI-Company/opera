import { getOpenAIApiKey, HUB_PROVIDER_ID, OPENAI_PROVIDER_ID } from '../ai/providers/sources';
import { HUB_URL_SCHEME, SamplerHub } from '../hub/SamplerHubService';

export type LiveKind = 'openai' | 'gemini' | 'llamacpp';

export type LiveBackend = {
  kind: LiveKind;
  url: string;
  model: string;
  //model accepts camera frames
  camera: boolean;
};

const GEMINI_HOST = 'generativelanguage.googleapis.com';
const OPENAI_HOST = 'api.openai.com';
const LFM_LIVE_RE = /lfm3-(audio|omni)/i;
//only the hub's llama.cpp speaks realtime
const HUB_LLAMA_URL = `${HUB_URL_SCHEME}llamacpp`;

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

//default live models
export function isLiveModel(url: string, model: string): boolean {
  const name = model.replace(/^models\//, '');
  const host = hostOf(url);
  if (host === OPENAI_HOST) return name.includes('realtime');
  if (host === GEMINI_HOST) return /live|native-audio/.test(name);
  return LFM_LIVE_RE.test(name);
}

//user toggled live models
export function liveBackend(service: string, url: string, model: string, capabilities: string[]): LiveBackend | null {
  if (!model || !capabilities.includes('live')) return null;
  if (service === HUB_PROVIDER_ID) {
    if (url !== HUB_LLAMA_URL) return null;
    return { kind: 'llamacpp', url, model, camera: false };
  }
  if (service !== OPENAI_PROVIDER_ID) return null;
  const name = model.replace(/^models\//, '');
  const host = hostOf(url);
  if (host === OPENAI_HOST) {
    return { kind: 'openai', url, model: name, camera: true };
  }
  if (host === GEMINI_HOST) {
    return { kind: 'gemini', url, model: name, camera: true };
  }
  //other servers act like llama.cpp
  return { kind: 'llamacpp', url, model, camera: false };
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
  //browsers go through the tunnel
  const onHub = backend.url.startsWith(HUB_URL_SCHEME);
  const http = onHub && !SamplerHub.needsTunnelFetch() ? await SamplerHub.resolveUrl(backend.url) : backend.url;
  const base = http.trim().replace(/\/+$/, '').replace(/^http/, 'ws');
  const root = base.endsWith('/v1') ? base : `${base}/v1`;
  return { wsUrl: `${root}/realtime?model=${encodeURIComponent(backend.model)}`, apiKey };
}
