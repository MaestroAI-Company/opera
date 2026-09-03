import { Buffer, createCipheriv, createDecipheriv, pbkdf2, randomBytes } from 'react-native-quick-crypto';
import type { PasteCrypto } from './types';

const GCM_ALGORITHM = 'aes-256-gcm';
const TAG_BYTES = 16;

const toBuffer = (bytes: Uint8Array) => Buffer.from(bytes);

//privatebin envelope, native side
export const PasteCryptoImpl: PasteCrypto = {
  async randomBytes(size) {
    return new Uint8Array(randomBytes(size));
  },

  pbkdf2Sha256(password, salt, iterations, keyLenBytes) {
    //keep key stretching off the js thread
    return new Promise((resolve, reject) => {
      pbkdf2(toBuffer(password), toBuffer(salt), iterations, keyLenBytes, 'sha256', (err, derived) => {
        if (err || !derived) reject(err ?? new Error('pbkdf2 produced no key'));
        else resolve(new Uint8Array(derived));
      });
    });
  },

  async aesGcmEncrypt(key, iv, aad, plaintext) {
    const cipher = createCipheriv(GCM_ALGORITHM, toBuffer(key), toBuffer(iv), { authTagLength: TAG_BYTES });
    cipher.setAAD(toBuffer(aad));
    const body = Buffer.concat([cipher.update(toBuffer(plaintext)), cipher.final()]);
    return new Uint8Array(Buffer.concat([body, cipher.getAuthTag()]));
  },

  async aesGcmDecrypt(key, iv, aad, sealed) {
    if (sealed.length <= TAG_BYTES) throw new Error('The shared conversation is too short to be valid');
    const decipher = createDecipheriv(GCM_ALGORITHM, toBuffer(key), toBuffer(iv), { authTagLength: TAG_BYTES });
    decipher.setAAD(toBuffer(aad));
    decipher.setAuthTag(toBuffer(sealed.subarray(sealed.length - TAG_BYTES)));
    const body = toBuffer(sealed.subarray(0, sealed.length - TAG_BYTES));
    return new Uint8Array(Buffer.concat([decipher.update(body), decipher.final()]));
  },
};
