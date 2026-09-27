import { CaptureRegion, DetectionInput, ScreenCapture } from './screenCapture';

//graph fixed at 640 input
const INPUT_SIZE = 640;
const ANCHORS = 8400;
const CLASSES = 4;
const SCORE_MIN = 0.3;
const IOU_MAX = 0.5;
const MAX_BOXES = 120;
const MIN_SIDE = 0.005;

//vulkan returns zeroed scores
const MODEL_SOURCES = [
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  { backend: 'cpu', source: require('../../../assets/models/deki-yolo-int8.pte') },
  // { backend: 'vulkan', source: require('../../../assets/models/deki-yolo-vulkan.pte') },
];

type Executorch = typeof import('react-native-executorch');
type Model = InstanceType<Executorch['ExecutorchModule']>;
type Box = { x1: number; y1: number; x2: number; y2: number };
type Candidate = Box & { score: number; label: number };

let runtime: Executorch | null | undefined;
let loading: Promise<Model | null> | null = null;

//missing runtime must not crash overlay
function executorch(): Executorch | null {
  if (runtime === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const lib = require('react-native-executorch') as Executorch;
      runtime = lib.isAvailable ? lib : null;
    } catch {
      runtime = null;
    }
    if (!runtime) console.warn('[Detector] executorch is not available on this device');
  }
  return runtime;
}

async function load(): Promise<Model | null> {
  const lib = executorch();
  if (!lib) return null;

  for (const { backend, source } of MODEL_SOURCES) {
    const model = new lib.ExecutorchModule();
    const startedAt = Date.now();
    try {
      await model.load(source);
      console.log(`[Detector] model loaded on ${backend} in ${Date.now() - startedAt} ms`);
      return model;
    } catch (e) {
      console.warn(`[Detector] ${backend} failed to load, trying the next backend:`, e);
      model.delete();
    }
  }
  console.warn('[Detector] no backend could load the model, selection runs without snapping');
  return null;
}

//base64 alphabet to 6-bit values
const B64_VALUES = (() => {
  const table = new Uint8Array(128);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < alphabet.length; i++) table[alphabet.charCodeAt(i)] = i;
  return table;
})();

//decode and normalize in one pass
function toInputTensor(data: string): Float32Array {
  const length = data.length;
  const floats = new Float32Array((length >> 2) * 3);
  let out = 0;
  for (let i = 0; i < length; i += 4) {
    const a = B64_VALUES[data.charCodeAt(i)];
    const b = B64_VALUES[data.charCodeAt(i + 1)];
    const c = B64_VALUES[data.charCodeAt(i + 2)];
    const d = B64_VALUES[data.charCodeAt(i + 3)];
    floats[out++] = ((a << 2) | (b >> 4)) / 255;
    floats[out++] = (((b & 15) << 4) | (c >> 2)) / 255;
    floats[out++] = (((c & 3) << 6) | d) / 255;
  }
  return floats;
}

function toFloats(buffer: unknown): Float32Array {
  if (buffer instanceof Float32Array) return buffer;
  if (ArrayBuffer.isView(buffer)) return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  return new Float32Array(buffer as ArrayBuffer);
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

//output channel first per anchor
function decode(data: Float32Array, input: DetectionInput): Candidate[] {
  const found: Candidate[] = [];

  for (let i = 0; i < ANCHORS; i++) {
    let label = 0;
    let score = data[4 * ANCHORS + i];
    for (let c = 1; c < CLASSES; c++) {
      const value = data[(4 + c) * ANCHORS + i];
      if (value > score) {
        score = value;
        label = c;
      }
    }
    if (score < SCORE_MIN) continue;

    const halfW = data[2 * ANCHORS + i] / 2;
    const halfH = data[3 * ANCHORS + i] / 2;
    const centerX = data[i];
    const centerY = data[ANCHORS + i];

    //map back over the capture
    const box = {
      x1: clamp01((centerX - halfW - input.offsetX) / input.contentWidth),
      y1: clamp01((centerY - halfH - input.offsetY) / input.contentHeight),
      x2: clamp01((centerX + halfW - input.offsetX) / input.contentWidth),
      y2: clamp01((centerY + halfH - input.offsetY) / input.contentHeight),
    };
    //padding detections become slivers
    if (box.x2 - box.x1 < MIN_SIDE || box.y2 - box.y1 < MIN_SIDE) continue;

    found.push({ ...box, score, label });
  }

  return found;
}

function overlap(a: Box, b: Box): number {
  const width = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const height = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  if (width <= 0 || height <= 0) return 0;
  const shared = width * height;
  const union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - shared;
  return union > 0 ? shared / union : 0;
}

function suppress(candidates: Candidate[]): Candidate[] {
  const kept: Candidate[] = [];
  //suppress per class keep text
  for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
    if (kept.some(k => k.label === candidate.label && overlap(k, candidate) > IOU_MAX)) continue;
    kept.push(candidate);
    if (kept.length >= MAX_BOXES) break;
  }
  return kept;
}

export const ObjectDetector = {
  //load once keep for whole launch
  prepare(): Promise<Model | null> {
    if (!loading) loading = load();
    return loading;
  },

  //current capture boxes or null
  async detect(): Promise<CaptureRegion[] | null> {
    const lib = executorch();
    const model = await ObjectDetector.prepare();
    if (!lib || !model) return null;

    const input = await ScreenCapture.getDetectionInput(INPUT_SIZE);
    if (!input) {
      console.warn('[Detector] no model input, the capture is not ready');
      return null;
    }

    try {
      const startedAt = Date.now();
      const output = await model.forward([{
        dataPtr: toInputTensor(input.data),
        sizes: [1, 3, INPUT_SIZE, INPUT_SIZE],
        scalarType: lib.ScalarType.FLOAT,
      }]);

      const data = toFloats(output[0]?.dataPtr);
      //constants match this export
      if (data.length < (4 + CLASSES) * ANCHORS) {
        console.warn('[Detector] unexpected model output of', data.length, 'values');
        return null;
      }

      const boxes = suppress(decode(data, input));
      console.log(`[Detector] ${boxes.length} elements detected in ${Date.now() - startedAt} ms`);

      return boxes.map(box => ({
        x: box.x1,
        y: box.y1,
        w: box.x2 - box.x1,
        h: box.y2 - box.y1,
      }));
    } catch (e) {
      console.warn('[Detector] inference failed:', e);
      return null;
    }
  },
};
