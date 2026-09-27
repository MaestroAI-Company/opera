import type { TextToSpeechModelConfig } from 'react-native-executorch';
import { Executorch, executorch } from './executorch';
import { downloadFiles, isDownloaded, removeFiles } from './modelFiles';
import { NeuralTTSEngine, SerialQueue, SynthesisOptions, VoiceOption } from './NeuralEngine';

type TTSModule = Awaited<ReturnType<Executorch['TextToSpeechModule']['fromModelName']>>;

//total size of all kokoro sources
const KOKORO_SIZE_BYTES = 390_771_472;

//voice slots per standard kokoro language
function voices(lib: Executorch): Record<string, TextToSpeechModelConfig[]> {
  return {
    fr: [lib.KOKORO_FRENCH_FEMALE_SIWIS],
    en: [lib.KOKORO_AMERICAN_ENGLISH_FEMALE_HEART, lib.KOKORO_AMERICAN_ENGLISH_MALE_MICHAEL],
    es: [lib.KOKORO_SPANISH_FEMALE_DORA, lib.KOKORO_SPANISH_MALE_ALEX],
    it: [lib.KOKORO_ITALIAN_FEMALE_SARA, lib.KOKORO_ITALIAN_MALE_NICOLA],
    pt: [lib.KOKORO_PORTUGUESE_FEMALE_DORA, lib.KOKORO_PORTUGUESE_MALE_SANTA],
    hi: [lib.KOKORO_HINDI_FEMALE_ALPHA, lib.KOKORO_HINDI_MALE_OMEGA],
  };
}

//voices share the model files
function allSources(lib: Executorch): string[] {
  const sources = new Set<string>();
  for (const { model, voiceSource, phonemizerConfig: p } of Object.values(voices(lib)).flat()) {
    for (const source of [
      model.durationPredictorSource,
      model.synthesizerSource,
      voiceSource,
      p.taggerSource,
      p.lexiconSource,
      p.neuralModelSource,
    ]) {
      if (typeof source === 'string') sources.add(source);
    }
  }
  return [...sources];
}

//af_heart.bin becomes Heart
function voiceName({ voiceSource }: TextToSpeechModelConfig): string {
  const file = String(voiceSource).split('/').pop() ?? '';
  const name = file.replace(/^[a-z]+_/, '').replace(/\.bin$/, '');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

class KokoroEngine implements NeuralTTSEngine {
  readonly sampleRate = 24000;
  readonly sizeBytes = KOKORO_SIZE_BYTES;
  readonly voices = ['1', '2'];
  readonly defaultVoice = '1';

  private loaded: { key: string; module: TTSModule } | null = null;
  private queue = new SerialQueue();

  isSupported(): boolean {
    return !!executorch();
  }

  supports(lang: string): boolean {
    const lib = executorch();
    return !!lib && lang in voices(lib);
  }

  isInstalled(): boolean {
    const lib = executorch();
    return !!lib && isDownloaded(allSources(lib));
  }

  voiceOptions(lang: string): VoiceOption[] {
    const lib = executorch();
    if (!lib) return [];
    const slots = voices(lib)[lang] ?? voices(lib).en;
    return slots.map((config, i) => ({ id: this.voices[i], label: voiceName(config) }));
  }

  async download(onProgress: (progress: number) => void): Promise<void> {
    const lib = executorch();
    if (!lib) throw new Error('ExecuTorch is not available');
    await downloadFiles(allSources(lib), onProgress);
  }

  async remove(): Promise<void> {
    const lib = executorch();
    if (!lib) return;
    await this.release();
    await removeFiles(allSources(lib));
  }

  preload(lang: string, voice: string): Promise<void> {
    return this.queue.run(async () => {
      await this.moduleFor(lang, voice);
    });
  }

  synthesize(text: string, lang: string, { voice, speed }: SynthesisOptions): Promise<Float32Array> {
    return this.queue.run(async () => (await this.moduleFor(lang, voice)).forward(text, speed));
  }

  release(): Promise<void> {
    return this.queue.run(() => this.unload());
  }

  private unload(): void {
    this.loaded?.module.delete();
    this.loaded = null;
  }

  private async moduleFor(lang: string, voice: string): Promise<TTSModule> {
    const lib = executorch();
    if (!lib) throw new Error('ExecuTorch is not available');
    const slots = voices(lib)[lang];
    //missing slot falls back
    const index = Math.min(this.voices.indexOf(voice), slots.length - 1);
    const config = slots[Math.max(0, index)];
    const key = `${lang}:${config.voiceSource}`;
    if (this.loaded?.key === key) return this.loaded.module;
    //one model loaded at a time
    this.unload();
    const module = await lib.TextToSpeechModule.fromModelName(config);
    this.loaded = { key, module };
    return module;
  }
}

export const Kokoro = new KokoroEngine();
