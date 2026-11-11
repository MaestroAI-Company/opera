//linear resample, enough for speech
export function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const length = Math.floor((input.length * to) / from);
  const output = new Float32Array(length);
  const ratio = from / to;
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const index = Math.floor(pos);
    const next = Math.min(index + 1, input.length - 1);
    output[i] = input[index] + (input[next] - input[index]) * (pos - index);
  }
  return output;
}

export function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

//float samples to base64 pcm16 little endian
export function floatToPcm16Base64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytesToBase64(bytes);
}

export function pcm16Base64ToFloat(data: string): Float32Array {
  const binary = atob(data);
  const count = binary.length >> 1;
  const output = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const lo = binary.charCodeAt(i * 2);
    const hi = binary.charCodeAt(i * 2 + 1);
    const value = (hi << 8) | lo;
    output[i] = (value >= 0x8000 ? value - 0x10000 : value) / 0x8000;
  }
  return output;
}

