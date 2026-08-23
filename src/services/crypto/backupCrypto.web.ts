import type { BackupCrypto } from './types';

const encoder = new TextEncoder();

const subtle = () => {
  const webcrypto = globalThis.crypto;
  if (!webcrypto?.subtle) throw new Error('WebCrypto is unavailable, cannot open the cloud backup');
  return webcrypto.subtle;
};

const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (char) => char.charCodeAt(0));

const toB64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  //chunked spread avoids argument limit
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};

const aesKey = (keyB64: string, usage: KeyUsage) =>
  subtle().importKey('raw', fromB64(keyB64), { name: 'AES-CBC' }, false, [usage]);

//webcrypto mirror of native envelope
export const BackupCryptoImpl: BackupCrypto = {
  async randomBytesB64(size) {
    const bytes = new Uint8Array(size);
    globalThis.crypto.getRandomValues(bytes);
    return toB64(bytes.buffer);
  },

  async sha256B64(messageUtf8) {
    return toB64(await subtle().digest('SHA-256', encoder.encode(messageUtf8)));
  },

  async pbkdf2Sha256B64(passwordUtf8, saltB64, iterations, keyLenBytes) {
    const baseKey = await subtle().importKey('raw', encoder.encode(passwordUtf8), 'PBKDF2', false, ['deriveBits']);
    const derived = await subtle().deriveBits(
      { name: 'PBKDF2', salt: fromB64(saltB64), iterations, hash: 'SHA-256' },
      baseKey,
      keyLenBytes * 8,
    );
    return toB64(derived);
  },

  async hmacSha256B64(keyB64, messageUtf8) {
    const key = await subtle().importKey('raw', fromB64(keyB64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return toB64(await subtle().sign('HMAC', key, encoder.encode(messageUtf8)));
  },

  async aesCbcEncryptBytesB64(keyB64, ivB64, plaintext) {
    const key = await aesKey(keyB64, 'encrypt');
    //webcrypto rejects shared buffers
    const encrypted = await subtle().encrypt({ name: 'AES-CBC', iv: fromB64(ivB64) }, key, plaintext as BufferSource);
    return toB64(encrypted);
  },

  async aesCbcDecryptBytes(keyB64, ivB64, ciphertextB64) {
    const key = await aesKey(keyB64, 'decrypt');
    const decrypted = await subtle().decrypt({ name: 'AES-CBC', iv: fromB64(ivB64) }, key, fromB64(ciphertextB64));
    return new Uint8Array(decrypted);
  },
};
