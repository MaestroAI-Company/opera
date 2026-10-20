import type { InferenceSession } from 'onnxruntime-react-native';
import type { Ort } from './ortRuntime';
import { ORT_BASE } from './ortRuntime.web';

//v2c eval threshold
const THRESHOLD = 0.5;
const SAMPLE_RATE = 16000;
const MODELS = '/wakeword/';

//80 ms adds 8 frames
const HOP = 1280;
const BINS = 32;
//2 s window gives 197 frames
const WINDOW_FRAMES = 197;
const EMB_FRAMES = 76;
const EMB_STRIDE = 8;
const EMB_COUNT = 16;
const EMB_SIZE = 96;
const WARMUP_HOPS = 25;
//top_db of power_to_db
const TOP_DB = 80;
//stft kernel 512 hop 160
const TAIL = 480;
const FRESH = HOP - 128;

//same steps as the android detector
class Detector {
  private tail = new Float32Array(TAIL);
  private hops = 0;
  private frames: Float32Array[] = [];
  //index of the oldest frame
  private firstFrame = 0;
  private cache = new Map<number, { floor: number; emb: Float32Array }>();
  private embInput = new Float32Array(EMB_FRAMES * BINS);
  private clfInput = new Float32Array(EMB_COUNT * EMB_SIZE);

  constructor(
    private ort: Ort,
    private mel: InferenceSession,
    private embedding: InferenceSession,
    private classifier: InferenceSession,
  ) {}

  //null until 2 s of audio
  async process(pcm: Float32Array): Promise<number | null> {
    this.hops++;
    //first hop has no previous samples
    const offset = this.hops === 1 ? 0 : TAIL;
    const input = new Float32Array(offset + FRESH);
    input.set(this.tail.subarray(0, offset));
    input.set(pcm.subarray(0, FRESH), offset);
    this.tail = pcm.slice(HOP - TAIL);

    const raw = await this.run(this.mel, input, [1, input.length]);
    for (let f = 0; f < raw.length / BINS; f++) this.frames.push(raw.slice(f * BINS, (f + 1) * BINS));
    const extra = this.frames.length - WINDOW_FRAMES;
    if (extra > 0) {
      this.frames.splice(0, extra);
      this.firstFrame += extra;
    }
    if (this.hops < WARMUP_HOPS) return null;

    let peak = -Infinity;
    for (const frame of this.frames) for (const v of frame) if (v > peak) peak = v;
    const floor = peak - TOP_DB;

    for (let e = 0; e < EMB_COUNT; e++) {
      const start = this.firstFrame + e * EMB_STRIDE;
      let low = Infinity;
      for (let f = 0; f < EMB_FRAMES; f++) for (const v of this.frames[e * EMB_STRIDE + f]) if (v < low) low = v;
      const cached = this.cache.get(start);
      let emb: Float32Array;
      //floor clips nothing either way
      if (cached && (cached.floor === floor || (low >= cached.floor && low >= floor))) {
        emb = cached.emb;
      } else {
        for (let f = 0; f < EMB_FRAMES; f++) {
          const frame = this.frames[e * EMB_STRIDE + f];
          for (let b = 0; b < BINS; b++) this.embInput[f * BINS + b] = Math.max(frame[b], floor) / 10 + 2;
        }
        emb = await this.run(this.embedding, this.embInput, [1, EMB_FRAMES, BINS, 1]);
        this.cache.set(start, { floor, emb });
      }
      this.clfInput.set(emb, e * EMB_SIZE);
    }
    for (const key of this.cache.keys()) if (key < this.firstFrame) this.cache.delete(key);

    return (await this.run(this.classifier, this.clfInput, [1, EMB_COUNT, EMB_SIZE]))[0];
  }

  private async run(session: InferenceSession, data: Float32Array, dims: number[]): Promise<Float32Array> {
    //copy so the buffers stay reusable
    const tensor = new this.ort.Tensor('float32', data.slice(), dims);
    const result = await session.run({ [session.inputNames[0]]: tensor });
    return result[session.outputNames[0]].data as Float32Array;
  }
}

type Models = { ort: Ort; mel: InferenceSession; embedding: InferenceSession; classifier: InferenceSession };

type WasmOrt = Ort & { env: { wasm: { wasmPaths: string; numThreads: number } } };

//metro cannot bundle url imports
const importUrl = new Function('url', 'return import(url)') as (url: string) => Promise<WasmOrt>;

let models: Promise<Models> | null = null;

function loadModels(): Promise<Models> {
  models ??= (async () => {
    //shared runtime allows one run
    const ort = await importUrl(`${ORT_BASE}ort.wasm.min.mjs`);
    ort.env.wasm.wasmPaths = ORT_BASE;
    ort.env.wasm.numThreads = 1;
    const load = async (name: string) => {
      const bytes = new Uint8Array(await (await fetch(MODELS + name)).arrayBuffer());
      return ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
    };
    const [mel, embedding, classifier] = await Promise.all([
      load('melspectrogram_raw.onnx'),
      load('embedding_model.onnx'),
      load('maestro.onnx'),
    ]);
    return { ort, mel, embedding, classifier };
  })().catch((e) => {
    //next start can retry
    models = null;
    throw e;
  });
  return models;
}

type Capture = { stream: MediaStream; context: AudioContext; processor: ScriptProcessorNode; resume: () => void };

let capture: Capture | null = null;
let session = 0;
//old and new hops never overlap
let queue: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

function close(): void {
  session++;
  if (!capture) return;
  capture.processor.disconnect();
  capture.context.close();
  capture.stream.getTracks().forEach((track) => track.stop());
  document.removeEventListener('pointerdown', capture.resume);
  capture = null;
}

//false without the mic permission
export async function startWakeWord(): Promise<boolean> {
  if (capture) return true;
  const id = ++session;
  try {
    const { ort, mel, embedding, classifier } = await loadModels();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    //stopped while loading
    if (id !== session) {
      stream.getTracks().forEach((track) => track.stop());
      return false;
    }
    let det = new Detector(ort, mel, embedding, classifier);
    const context = new AudioContext({ sampleRate: SAMPLE_RATE });
    const processor = context.createScriptProcessor(2048, 1, 1);
    //autoplay may wait for a tap
    const resume = () => context.resume();
    document.addEventListener('pointerdown', resume, { once: true });
    const pending = new Float32Array(HOP);
    let filled = 0;
    processor.onaudioprocess = (e) => {
      const samples = e.inputBuffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) {
        pending[filled++] = samples[i];
        if (filled < HOP) continue;
        filled = 0;
        const hop = pending.slice();
        queue = queue.then(async () => {
          if (id !== session) return;
          const score = await det.process(hop);
          if (score === null || score < THRESHOLD || id !== session) return;
          close();
          listeners.forEach((listener) => listener());
        }).catch((e) => {
          console.warn('[WakeWord] hop failed:', e);
          //half hops break the frame grid
          det = new Detector(ort, mel, embedding, classifier);
        });
      }
    };
    context.createMediaStreamSource(stream).connect(processor);
    processor.connect(context.destination);
    capture = { stream, context, processor, resume };
    return true;
  } catch (e) {
    console.warn('[WakeWord] start failed:', e);
    return false;
  }
}

//resolves once the mic is free
export async function stopWakeWord(): Promise<void> {
  close();
  await queue;
}

export function onWakeWord(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
