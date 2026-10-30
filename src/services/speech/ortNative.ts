import { invoke } from '@tauri-apps/api/core';

type TensorType = 'float32' | 'int64' | 'int32' | 'uint8' | 'bool';
type TensorData = Float32Array | BigInt64Array | Int32Array | Uint8Array;
type Slot = { name: string; type: TensorType; dims: number[]; offset: number; length: number };

const ARRAYS = {
  float32: Float32Array,
  int64: BigInt64Array,
  int32: Int32Array,
  uint8: Uint8Array,
  bool: Uint8Array,
};

class Tensor {
  constructor(public type: TensorType, public data: TensorData, public dims: readonly number[]) {}
}

//same surface as onnxruntime web
class InferenceSession {
  private constructor(private id: number, public inputNames: string[], public outputNames: string[]) {}

  //source is a url downloaded by rust
  static async create(source: string): Promise<InferenceSession> {
    const { id, inputNames, outputNames } = await invoke<{ id: number; inputNames: string[]; outputNames: string[] }>('ort_load', { source });
    return new InferenceSession(id, inputNames, outputNames);
  }

  //length then json header then bytes
  async run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>> {
    const inputs: Slot[] = [];
    const parts: Uint8Array[] = [];
    let offset = 0;
    for (const [name, tensor] of Object.entries(feeds)) {
      const bytes = new Uint8Array(tensor.data.buffer, tensor.data.byteOffset, tensor.data.byteLength);
      inputs.push({ name, type: tensor.type, dims: [...tensor.dims], offset, length: bytes.length });
      parts.push(bytes);
      offset += bytes.length;
    }
    const header = new TextEncoder().encode(JSON.stringify({ id: this.id, inputs }));
    const payload = new Uint8Array(4 + header.length + offset);
    new DataView(payload.buffer).setUint32(0, header.length, true);
    payload.set(header, 4);
    let at = 4 + header.length;
    for (const part of parts) {
      payload.set(part, at);
      at += part.length;
    }

    const reply = await invoke<ArrayBuffer>('ort_run', payload);
    const size = new DataView(reply).getUint32(0, true);
    const slots: Slot[] = JSON.parse(new TextDecoder().decode(new Uint8Array(reply, 4, size)));
    const start = 4 + size;
    const outputs: Record<string, Tensor> = {};
    for (const slot of slots) {
      //copy keeps typed arrays aligned
      const data = new ARRAYS[slot.type](reply.slice(start + slot.offset, start + slot.offset + slot.length));
      outputs[slot.name] = new Tensor(slot.type, data, slot.dims);
    }
    return outputs;
  }

  async release(): Promise<void> {
    await invoke('ort_release', { id: this.id });
  }
}

export const NativeOrt = { Tensor, InferenceSession };
