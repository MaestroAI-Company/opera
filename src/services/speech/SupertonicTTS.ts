import { canStoreModels, downloadFiles, isDownloaded, modelInput, readText, removeFiles } from './modelFiles';
import { NeuralTTSEngine, SerialQueue, SynthesisOptions, VoiceOption } from './NeuralEngine';
import { loadOrt, Ort, ortAvailable, RUNTIME_LABEL, sessionOptions } from './ortRuntime';

type Session = Awaited<ReturnType<Ort['InferenceSession']['create']>>;
type Tensor = InstanceType<Ort['Tensor']>;

//pinned so files never change
const REPO = 'https://huggingface.co/supertone-oss-archive/supertonic-3/resolve/aafc6e32416a594460b32413efc49d7fe4ce6d46';
const MODELS = {
  durationPredictor: `${REPO}/onnx/duration_predictor.onnx`,
  textEncoder: `${REPO}/onnx/text_encoder.onnx`,
  vectorEstimator: `${REPO}/onnx/vector_estimator.onnx`,
  vocoder: `${REPO}/onnx/vocoder.onnx`,
};
const INDEXER = `${REPO}/onnx/unicode_indexer.json`;
const VOICES = ['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5'];
const voiceSource = (voice: string) => `${REPO}/voice_styles/${voice}.json`;
const SOURCES = [...Object.values(MODELS), INDEXER, ...VOICES.map(voiceSource)];

//total size of all supertonic sources
const SUPERTONIC_SIZE_BYTES = 401_268_491;

//values from onnx/tts.json
const SAMPLE_RATE = 44100;
const CHUNK_SIZE = 512 * 6;
const LATENT_CHANNELS = 24 * 6;

//few steps trade quality for speed
const TOTAL_STEPS = 5;
const BASE_SPEED = 1.05;

const LANGS = new Set([
  'en', 'ko', 'ja', 'ar', 'bg', 'cs', 'da', 'de', 'el', 'es', 'et', 'fi', 'fr', 'hi', 'hr', 'hu',
  'id', 'it', 'lt', 'lv', 'nl', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'tr', 'uk', 'vi',
]);

const REPLACEMENTS: [string, string][] = [
  ['–', '-'], ['‑', '-'], ['—', '-'], ['_', ' '],
  ['“', '"'], ['”', '"'], ['‘', "'"], ['’', "'"], ['´', "'"], ['`', "'"],
  ['[', ' '], [']', ' '], ['|', ' '], ['/', ' '], ['#', ' '], ['→', ' '], ['←', ' '],
  ['@', ' at '], ['e.g.,', 'for example, '], ['i.e.,', 'that is, '],
];
const EMOJI = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu;

type Style = { ttl: Tensor; dp: Tensor };
type Loaded = {
  ort: Ort;
  indexer: number[];
  durationPredictor: Session;
  textEncoder: Session;
  vectorEstimator: Session;
  vocoder: Session;
  styles: Map<string, Style>;
};

//port of the official text normalizer
function preprocess(text: string, lang: string): string {
  let t = text.normalize('NFKD').replace(EMOJI, '');
  for (const [from, to] of REPLACEMENTS) t = t.split(from).join(to);
  t = t
    .replace(/[♥☆♡©\\]/g, '')
    .replace(/ ([,.!?;:'])/g, '$1')
    .replace(/"{2,}/g, '"')
    .replace(/'{2,}/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (!/[.!?;:,'")\]}…。」』】〉》›»]$/.test(t)) t += '.';
  return `<${lang}>${t}</${lang}>`;
}

const ms = (since: number) => Math.round(performance.now() - since);

async function readJson<T>(source: string): Promise<T> {
  return JSON.parse(await readText(source)) as T;
}

class SupertonicEngine implements NeuralTTSEngine {
  readonly sampleRate = SAMPLE_RATE;
  readonly sizeBytes = SUPERTONIC_SIZE_BYTES;
  readonly voices = VOICES;
  readonly defaultVoice = 'F1';

  private loaded: Loaded | null = null;
  private queue = new SerialQueue();

  isSupported(): boolean {
    return ortAvailable() && canStoreModels();
  }

  supports(lang: string): boolean {
    return LANGS.has(lang);
  }

  isInstalled(): boolean {
    return isDownloaded(SOURCES);
  }

  //official names, same for every language
  voiceOptions(): VoiceOption[] {
    return VOICES.map((id) => ({ id, label: id }));
  }

  download(onProgress: (progress: number) => void): Promise<void> {
    return downloadFiles(SOURCES, onProgress);
  }

  async remove(): Promise<void> {
    await this.release();
    await removeFiles(SOURCES);
  }

  preload(_lang: string, voice: string): Promise<void> {
    return this.queue.run(async () => {
      await this.style(await this.load(), voice);
    });
  }

  synthesize(text: string, lang: string, { voice, speed }: SynthesisOptions): Promise<Float32Array> {
    return this.queue.run(async () => this.infer(await this.load(), text, lang, voice, BASE_SPEED * speed));
  }

  release(): Promise<void> {
    return this.queue.run(() => this.unload());
  }

  private async unload(): Promise<void> {
    const loaded = this.loaded;
    this.loaded = null;
    if (!loaded) return;
    await Promise.all(
      [loaded.durationPredictor, loaded.textEncoder, loaded.vectorEstimator, loaded.vocoder].map((s) => s.release()),
    );
  }

  private async load(): Promise<Loaded> {
    if (this.loaded) return this.loaded;
    const ort = await loadOrt();
    const start = performance.now();
    const session = async (source: string) => {
      const input = await modelInput(source);
      return typeof input === 'string'
        ? ort.InferenceSession.create(input, sessionOptions())
        : ort.InferenceSession.create(input, sessionOptions());
    };
    const [durationPredictor, textEncoder, vectorEstimator, vocoder, indexer] = await Promise.all([
      session(MODELS.durationPredictor),
      session(MODELS.textEncoder),
      session(MODELS.vectorEstimator),
      session(MODELS.vocoder),
      readJson<number[]>(INDEXER),
    ]);
    console.log(`[Supertonic] models loaded in ${ms(start)}ms (${RUNTIME_LABEL})`);
    this.loaded = { ort, indexer, durationPredictor, textEncoder, vectorEstimator, vocoder, styles: new Map() };
    return this.loaded;
  }

  private async style({ ort, styles }: Loaded, voice: string): Promise<Style> {
    const id = VOICES.includes(voice) ? voice : this.defaultVoice;
    const cached = styles.get(id);
    if (cached) return cached;
    type Entry = { dims: number[]; data: unknown[] };
    const json = await readJson<{ style_ttl: Entry; style_dp: Entry }>(voiceSource(id));
    const tensor = ({ dims, data }: Entry) =>
      new ort.Tensor('float32', Float32Array.from(data.flat(Infinity) as number[]), dims);
    const style = { ttl: tensor(json.style_ttl), dp: tensor(json.style_dp) };
    styles.set(id, style);
    return style;
  }

  private async infer(loaded: Loaded, text: string, lang: string, voice: string, speed: number): Promise<Float32Array> {
    const { ort, indexer } = loaded;
    const start = performance.now();
    const style = await this.style(loaded, voice);

    //text to unicode ids
    const input = preprocess(text, lang);
    const ids = new BigInt64Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const code = input.codePointAt(i)!;
      ids[i] = BigInt(code < indexer.length ? indexer[code] : -1);
    }
    const textIds = new ort.Tensor('int64', ids, [1, input.length]);
    const textMask = new ort.Tensor('float32', new Float32Array(input.length).fill(1), [1, 1, input.length]);

    let mark = performance.now();
    const { duration } = await loaded.durationPredictor.run({ text_ids: textIds, style_dp: style.dp, text_mask: textMask });
    const seconds = (duration.data as Float32Array)[0] / speed;
    const durationMs = ms(mark);
    mark = performance.now();
    const { text_emb: textEmb } = await loaded.textEncoder.run({ text_ids: textIds, style_ttl: style.ttl, text_mask: textMask });
    const encoderMs = ms(mark);

    //gaussian noise sized to the duration
    const latentLen = Math.max(1, Math.ceil(Math.floor(seconds * SAMPLE_RATE) / CHUNK_SIZE));
    let latent: Float32Array = new Float32Array(LATENT_CHANNELS * latentLen);
    for (let i = 0; i < latent.length; i++) {
      const u1 = Math.max(0.0001, Math.random());
      latent[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * Math.random());
    }
    const shape = [1, LATENT_CHANNELS, latentLen];
    const latentMask = new ort.Tensor('float32', new Float32Array(latentLen).fill(1), [1, 1, latentLen]);
    const totalStep = new ort.Tensor('float32', new Float32Array([TOTAL_STEPS]), [1]);

    //flow matching denoise
    mark = performance.now();
    for (let step = 0; step < TOTAL_STEPS; step++) {
      const { denoised_latent: denoised } = await loaded.vectorEstimator.run({
        noisy_latent: new ort.Tensor('float32', latent, shape),
        text_emb: textEmb,
        style_ttl: style.ttl,
        latent_mask: latentMask,
        text_mask: textMask,
        current_step: new ort.Tensor('float32', new Float32Array([step]), [1]),
        total_step: totalStep,
      });
      latent = denoised.data as Float32Array;
    }
    const estimatorMs = ms(mark);

    mark = performance.now();
    const { wav_tts: wav } = await loaded.vocoder.run({ latent: new ort.Tensor('float32', latent, shape) });
    const vocoderMs = ms(mark);

    const totalMs = ms(start);
    console.log(
      `[Supertonic:${RUNTIME_LABEL}] ${text.length} chars, ${seconds.toFixed(2)}s audio in ${totalMs}ms` +
        ` (rtf ${(totalMs / 1000 / seconds).toFixed(2)}) duration ${durationMs}ms encoder ${encoderMs}ms` +
        ` estimator ${estimatorMs}ms (${Math.round(estimatorMs / TOTAL_STEPS)}ms/step) vocoder ${vocoderMs}ms`,
    );
    //vocoder pads to the latent chunk
    return (wav.data as Float32Array).subarray(0, Math.floor(seconds * SAMPLE_RATE));
  }
}

export const Supertonic = new SupertonicEngine();
