import { NativeModules } from 'react-native';
import type { InferenceSession } from 'onnxruntime-react-native';

export type Ort = typeof import('onnxruntime-react-native');

//little cores slow the work
const THREADS = 4;

export const RUNTIME_LABEL = `cpu, ${THREADS} threads`;

//lib throws without its native module
export function ortAvailable(): boolean {
  return !!NativeModules.Onnxruntime;
}

export async function loadOrt(): Promise<Ort> {
  if (!ortAvailable()) throw new Error('ONNX Runtime is not available');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('onnxruntime-react-native') as Ort;
}

export function sessionOptions(): InferenceSession.SessionOptions {
  return { intraOpNumThreads: THREADS };
}
