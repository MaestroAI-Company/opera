import { formatBytes } from '../ai/providers/huggingFaceCatalog';
import { Settings } from '../settings/SettingsService';
import { NeuralTTSEngine } from './NeuralEngine';
import { Supertonic } from './SupertonicTTS';

export const NEURAL_ENGINES: Record<string, NeuralTTSEngine> = {
  supertonic: Supertonic,
};

export const TTS_SPEEDS = ['0.75', '0.9', '1', '1.1', '1.25', '1.5'];

export function supportedEngineIds(): string[] {
  return Object.keys(NEURAL_ENGINES).filter((id) => NEURAL_ENGINES[id].isSupported());
}

export type InstallSnapshot = { progress: number; sizeStr: string };
type InstallListener = (id: string, snapshot: InstallSnapshot | null) => void;

//settings and chat share one download
const installs: Record<string, Promise<void>> = {};
const lastProgress = new Map<string, InstallSnapshot>();
const installListeners = new Set<InstallListener>();

export function subscribeInstall(listener: InstallListener): () => void {
  installListeners.add(listener);
  return () => {
    installListeners.delete(listener);
  };
}

//late screens seed from last snapshot
export function getInstallSnapshot(id: string): InstallSnapshot | null {
  return lastProgress.get(id) ?? null;
}

function broadcastInstall(id: string, snapshot: InstallSnapshot | null) {
  if (snapshot) lastProgress.set(id, snapshot);
  else lastProgress.delete(id);
  installListeners.forEach((l) => l(id, snapshot));
}

async function download(id: string): Promise<void> {
  const engine = NEURAL_ENGINES[id];
  const sizeStr = (progress: number) => `${formatBytes(progress * engine.sizeBytes)} / ${formatBytes(engine.sizeBytes)}`;
  let lastPercent = -1;
  const report = (progress: number) => {
    //one update per percent
    const percent = Math.floor(progress * 100);
    if (percent === lastPercent) return;
    lastPercent = percent;
    broadcastInstall(id, { progress, sizeStr: sizeStr(progress) });
  };
  report(0);
  try {
    await engine.download(report);
  } finally {
    broadcastInstall(id, null);
  }
}

export function install(id: string): Promise<void> {
  installs[id] ??= download(id).finally(() => delete installs[id]);
  return installs[id];
}

export function isInstalling(id: string): boolean {
  return id in installs;
}

export function getSpeed(): number {
  return Number(Settings.getCached().ttsSpeed) || 1;
}

function storedVoices(): Record<string, string> {
  try {
    return JSON.parse(Settings.getCached().ttsVoices) || {};
  } catch {
    return {};
  }
}

export function getVoice(id: string): string {
  const engine = NEURAL_ENGINES[id];
  const voice = storedVoices()[id];
  return engine?.voices.includes(voice) ? voice : (engine?.defaultVoice ?? '');
}

export function setVoice(id: string, voice: string): void {
  Settings.set('ttsVoices', JSON.stringify({ ...storedVoices(), [id]: voice }));
}

//keeps a single engine in memory
export async function activate(id: string): Promise<NeuralTTSEngine> {
  const engine = NEURAL_ENGINES[id];
  await Promise.all(Object.values(NEURAL_ENGINES).filter((e) => e !== engine).map((e) => e.release()));
  return engine;
}
