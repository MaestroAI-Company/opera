//base58 as used by privatebin
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base58Encode(bytes: Uint8Array): string {
  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '';
  //leading zero bytes keep their own digit
  for (const byte of bytes) {
    if (byte !== 0) break;
    out += BASE58_ALPHABET[0];
  }
  for (let i = digits.length - 1; i >= 0; i--) out += BASE58_ALPHABET[digits[i]];
  return out;
}

export function base58Decode(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    let carry = BASE58_ALPHABET.indexOf(char);
    if (carry < 0) throw new Error('The share key is not valid base58');
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of text) {
    if (char !== BASE58_ALPHABET[0]) break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

//hermes has no atob
export function base64ToBytes(b64: string): Uint8Array {
  const globalBuffer = (globalThis as any).Buffer;
  if (globalBuffer?.from) {
    const buffer = globalBuffer.from(b64, 'base64');
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array((clean.length * 3) >> 2);
  let outIndex = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = BASE64_ALPHABET.indexOf(clean[i]);
    const b = BASE64_ALPHABET.indexOf(clean[i + 1]);
    const c = BASE64_ALPHABET.indexOf(clean[i + 2]);
    const d = BASE64_ALPHABET.indexOf(clean[i + 3]);
    out[outIndex++] = (a << 2) | (b >> 4);
    if (c >= 0) out[outIndex++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[outIndex++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, outIndex);
}

export function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const globalBuffer = (globalThis as any).Buffer;
  const b64 = globalBuffer?.from
    ? globalBuffer.from(bytes).toString('base64')
    : bytesToBase64Fallback(bytes);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  return new TextDecoder().decode(base64ToBytes(b64));
}

function bytesToBase64Fallback(bytes: Uint8Array): string {
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
