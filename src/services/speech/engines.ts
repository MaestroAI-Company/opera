import { Settings } from '../settings/SettingsService';
import { Kokoro } from './KokoroTTS';
import { NeuralTTSEngine } from './NeuralEngine';
import { Supertonic } from './SupertonicTTS';

export const NEURAL_ENGINES: Record<string, NeuralTTSEngine> = {
  kokoro: Kokoro,
  supertonic: Supertonic,
};

export const TTS_SPEEDS = ['0.75', '0.9', '1', '1.1', '1.25', '1.5'];

export function supportedEngineIds(): string[] {
  return Object.keys(NEURAL_ENGINES).filter((id) => NEURAL_ENGINES[id].isSupported());
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
