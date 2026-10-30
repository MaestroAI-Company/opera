import { invoke } from '@tauri-apps/api/core';
import type { InferenceSession } from 'onnxruntime-react-native';
import { loadOrt, sessionOptions } from '../speech/ortRuntime.web';
import type { CaptureRegion, DetectionInput } from './screenCapture';

const INPUT_SIZE = 640;
const SCORE_MIN = 0.3;
const MIN_SIDE = 0.005;

let loading: Promise<InferenceSession | null> | null = null;
//one session cannot run twice at once
let running: Promise<unknown> = Promise.resolve();

function load(): Promise<InferenceSession | null> {
  loading ??= Promise.all([loadOrt(), invoke<ArrayBuffer>('stage_model')])
    .then(([ort, model]) => ort.InferenceSession.create(new Uint8Array(model), { ...sessionOptions(), logSeverityLevel: 3 }))
    .catch(e => {
      console.warn('[Detector] desktop model failed to load', e);
      loading = null;
      return null;
    });
  return loading;
}

function toInputTensor(data: string): Float32Array {
  const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
  const floats = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) floats[i] = bytes[i] / 255;
  return floats;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export const DesktopDetector = {
  prepare(): void {
    load();
  },

  detect(): Promise<CaptureRegion[] | null> {
    const next = running.then(run, run);
    running = next.catch(() => { });
    return next;
  },
};

async function run(): Promise<CaptureRegion[] | null> {
  const input = await invoke<DetectionInput | null>('stage_detection_input');
  const session = await load();
  if (!input || !session) return null;
  const ort = await loadOrt();
  const startedAt = Date.now();
  const tensor = new ort.Tensor('float32', toInputTensor(input.data), [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const result = await session.run({ [session.inputNames[0]]: tensor });
  //rows of box score and label
  const rows = result[session.outputNames[0]].data as Float32Array;
  const boxes: CaptureRegion[] = [];
  for (let i = 0; i + 6 <= rows.length; i += 6) {
    if (rows[i + 4] < SCORE_MIN) continue;
    const x1 = clamp01((rows[i] - input.offsetX) / input.contentWidth);
    const y1 = clamp01((rows[i + 1] - input.offsetY) / input.contentHeight);
    const x2 = clamp01((rows[i + 2] - input.offsetX) / input.contentWidth);
    const y2 = clamp01((rows[i + 3] - input.offsetY) / input.contentHeight);
    if (x2 - x1 < MIN_SIDE || y2 - y1 < MIN_SIDE) continue;
    boxes.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
  }
  console.log(`[Detector] ${boxes.length} elements detected in ${Date.now() - startedAt} ms`);
  return boxes;
}
