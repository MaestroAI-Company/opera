import type { InferenceSession } from 'onnxruntime-react-native';
import type { Ort } from './ortRuntime';

export type { Ort };

//metro cannot bundle its dynamic imports
const ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/';

const hasWebGpu = () => typeof navigator !== 'undefined' && 'gpu' in navigator;

export const RUNTIME_LABEL = hasWebGpu() ? 'webgpu' : 'wasm';

export function ortAvailable(): boolean {
  return typeof WebAssembly !== 'undefined' && typeof document !== 'undefined';
}

let runtime: Promise<Ort> | null = null;

export function loadOrt(): Promise<Ort> {
  runtime ??= new Promise<Ort>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${ORT_BASE}ort.min.js`;
    script.onload = () => {
      const ort = (globalThis as { ort?: Ort & { env: { wasm: { wasmPaths: string } } } }).ort;
      if (!ort) return reject(new Error('ONNX Runtime Web did not load'));
      ort.env.wasm.wasmPaths = ORT_BASE;
      //same api as the native binding
      resolve(ort);
    };
    script.onerror = () => reject(new Error('Failed to load ONNX Runtime Web'));
    document.head.appendChild(script);
  }).catch((e) => {
    //next attempt can retry
    runtime = null;
    throw e;
  });
  return runtime;
}

//wasm fallback when webgpu fails
export function sessionOptions(): InferenceSession.SessionOptions {
  return { executionProviders: hasWebGpu() ? ['webgpu', 'wasm'] : ['wasm'] };
}
