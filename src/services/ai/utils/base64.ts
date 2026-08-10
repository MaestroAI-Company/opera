//hermes lacks btoa use fallback
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  //native buffer polyfill much faster
  const globalBuffer = (globalThis as any).Buffer;
  if (globalBuffer?.from) {
    return globalBuffer.from(buffer).toString('base64');
  }

  const bytes = new Uint8Array(buffer);
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const first = bytes[i];
    const second = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const third = i + 2 < bytes.length ? bytes[i + 2] : 0;
    parts.push(
      BASE64_ALPHABET[first >> 2] +
      BASE64_ALPHABET[((first & 3) << 4) | (second >> 4)] +
      (i + 1 < bytes.length ? BASE64_ALPHABET[((second & 15) << 2) | (third >> 6)] : '=') +
      (i + 2 < bytes.length ? BASE64_ALPHABET[third & 63] : '=')
    );
  }
  return parts.join('');
}
