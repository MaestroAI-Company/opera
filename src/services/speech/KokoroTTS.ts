import { File, Paths } from 'expo-file-system';
import type { TextToSpeechModelConfig } from 'react-native-executorch';

type Executorch = typeof import('react-native-executorch');
type AudioApi = typeof import('react-native-audio-api');
type TTSModule = Awaited<ReturnType<Executorch['TextToSpeechModule']['fromModelName']>>;
type AudioContext = InstanceType<AudioApi['AudioContext']>;

const SAMPLE_RATE = 24000;
//expo fetcher stores files here
const RNE_DIR = 'react-native-executorch';

//total size of all kokoro sources
export const KOKORO_SIZE_BYTES = 388_160_272;

export type KokoroPlayback = {
  enqueue(samples: Float32Array): void;
  finish(): Promise<void>;
  stop(): void;
};

let runtime: Executorch | null | undefined;

//missing runtime on web and desktop
function executorch(): Executorch | null {
  if (runtime === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const lib = require('react-native-executorch') as Executorch;
      runtime = lib.isAvailable ? lib : null;
    } catch {
      runtime = null;
    }
  }
  return runtime;
}

//one voice per standard kokoro language
function voices(lib: Executorch): Record<string, TextToSpeechModelConfig> {
  return {
    fr: lib.KOKORO_FRENCH_FEMALE_SIWIS,
    en: lib.KOKORO_AMERICAN_ENGLISH_FEMALE_HEART,
    es: lib.KOKORO_SPANISH_FEMALE_DORA,
    it: lib.KOKORO_ITALIAN_FEMALE_SARA,
    pt: lib.KOKORO_PORTUGUESE_FEMALE_DORA,
    hi: lib.KOKORO_HINDI_FEMALE_ALPHA,
  };
}

//voices share the model files
function allSources(lib: Executorch): string[] {
  const sources = new Set<string>();
  for (const { model, voiceSource, phonemizerConfig: p } of Object.values(voices(lib))) {
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

function localFile(lib: Executorch, source: string): File {
  return new File(Paths.document, RNE_DIR, lib.ResourceFetcherUtils.getFilenameFromUri(source));
}

class KokoroEngine {
  private loaded: { lang: string; module: TTSModule } | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private context: AudioContext | null = null;

  isSupported(): boolean {
    return !!executorch();
  }

  supports(lang: string): boolean {
    const lib = executorch();
    return !!lib && lang in voices(lib);
  }

  //filesystem read, safe while rendering
  isInstalled(): boolean {
    const lib = executorch();
    if (!lib) return false;
    try {
      return allSources(lib).every((source) => localFile(lib, source).exists);
    } catch {
      return false;
    }
  }

  async download(onProgress: (progress: number) => void): Promise<void> {
    const lib = executorch();
    if (!lib) throw new Error('ExecuTorch is not available');
    await lib.ResourceFetcher.fetch(onProgress, ...allSources(lib));
  }

  async remove(): Promise<void> {
    const lib = executorch();
    if (!lib) return;
    await this.queue;
    this.loaded?.module.delete();
    this.loaded = null;
    for (const source of allSources(lib)) {
      const file = localFile(lib, source);
      if (file.exists) file.delete();
    }
  }

  //serialized so swaps never race
  synthesize(text: string, lang: string): Promise<Float32Array> {
    const run = this.queue.then(async () => (await this.moduleFor(lang)).forward(text));
    this.queue = run.catch(() => {});
    return run;
  }

  private async moduleFor(lang: string): Promise<TTSModule> {
    if (this.loaded?.lang === lang) return this.loaded.module;
    const lib = executorch();
    if (!lib) throw new Error('ExecuTorch is not available');
    //one model loaded at a time
    this.loaded?.module.delete();
    this.loaded = null;
    const module = await lib.TextToSpeechModule.fromModelName(voices(lib)[lang]);
    this.loaded = { lang, module };
    return module;
  }

  //plays silence while the chunk synthesizes
  createPlayback(): KokoroPlayback {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const api = require('react-native-audio-api') as AudioApi;
    const context = (this.context ??= new api.AudioContext({ sampleRate: SAMPLE_RATE }));
    const node = context.createBufferQueueSource();
    node.connect(context.destination);

    let pending = 0;
    let closed = false;
    let released = false;
    let done = () => {};
    const finished = new Promise<void>((resolve) => (done = resolve));
    const release = () => {
      if (released) return;
      released = true;
      node.onBufferEnded = null;
      node.disconnect();
      done();
    };
    const settle = () => {
      if (closed && pending === 0) release();
    };

    node.onBufferEnded = () => {
      pending--;
      settle();
    };
    //lib rejects the default offset
    node.start(0, 0);

    return {
      enqueue(samples) {
        if (released) return;
        const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
        buffer.getChannelData(0).set(samples);
        pending++;
        node.enqueueBuffer(buffer);
      },
      finish() {
        closed = true;
        settle();
        return finished;
      },
      stop() {
        try {
          node.stop();
        } catch (e) {
          console.warn('Kokoro stop error:', e);
        }
        release();
      },
    };
  }
}

export const Kokoro = new KokoroEngine();
