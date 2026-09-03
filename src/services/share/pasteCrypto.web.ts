import type { PasteCrypto } from './types';

const GCM_TAG_BITS = 128;

const subtle = () => {
  const webcrypto = globalThis.crypto;
  if (!webcrypto?.subtle) throw new Error('WebCrypto is unavailable, cannot open the shared conversation');
  return webcrypto.subtle;
};

const aesKey = (key: Uint8Array, usage: KeyUsage) =>
  subtle().importKey('raw', key as BufferSource, { name: 'AES-GCM' }, false, [usage]);

//webcrypto mirror of the native envelope
export const PasteCryptoImpl: PasteCrypto = {
  async randomBytes(size) {
    const bytes = new Uint8Array(size);
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  },

  async pbkdf2Sha256(password, salt, iterations, keyLenBytes) {
    const baseKey = await subtle().importKey('raw', password as BufferSource, 'PBKDF2', false, ['deriveBits']);
    const derived = await subtle().deriveBits(
      { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
      baseKey,
      keyLenBytes * 8,
    );
    return new Uint8Array(derived);
  },

  async aesGcmEncrypt(key, iv, aad, plaintext) {
    const cryptoKey = await aesKey(key, 'encrypt');
    const sealed = await subtle().encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource, tagLength: GCM_TAG_BITS },
      cryptoKey,
      plaintext as BufferSource,
    );
    return new Uint8Array(sealed);
  },

  async aesGcmDecrypt(key, iv, aad, sealed) {
    const cryptoKey = await aesKey(key, 'decrypt');
    const plaintext = await subtle().decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource, tagLength: GCM_TAG_BITS },
      cryptoKey,
      sealed as BufferSource,
    );
    return new Uint8Array(plaintext);
  },
};
