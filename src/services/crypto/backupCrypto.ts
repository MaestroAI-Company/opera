import {
  Buffer,
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  pbkdf2,
  randomBytes,
} from 'react-native-quick-crypto';
import { b64ToBytes as fromB64 } from './encoding';
import type { BackupCrypto } from './types';

const AES_ALGORITHM = 'aes-256-cbc';

//same primitives as legacy js backups
export const BackupCryptoImpl: BackupCrypto = {
  async randomBytesB64(size) {
    return randomBytes(size).toString('base64');
  },

  async sha256B64(messageUtf8) {
    return createHash('sha256').update(messageUtf8).digest('base64');
  },

  pbkdf2Sha256B64(passwordUtf8, saltB64, iterations, keyLenBytes) {
    //keep key stretching off js thread
    return new Promise((resolve, reject) => {
      pbkdf2(passwordUtf8, fromB64(saltB64), iterations, keyLenBytes, 'sha256', (err, derived) => {
        if (err || !derived) reject(err ?? new Error('pbkdf2 produced no key'));
        else resolve(derived.toString('base64'));
      });
    });
  },

  async hmacSha256B64(keyB64, messageUtf8) {
    return createHmac('sha256', fromB64(keyB64)).update(messageUtf8, 'utf8').digest('base64');
  },

  async aesCbcEncryptBytesB64(keyB64, ivB64, plaintext) {
    const cipher = createCipheriv(AES_ALGORITHM, fromB64(keyB64), fromB64(ivB64));
    const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
    return encrypted.toString('base64');
  },

  async aesCbcDecryptBytes(keyB64, ivB64, ciphertextB64) {
    const decipher = createDecipheriv(AES_ALGORITHM, fromB64(keyB64), fromB64(ivB64));
    const decrypted = Buffer.concat([decipher.update(fromB64(ciphertextB64)), decipher.final()]);
    return new Uint8Array(decrypted.buffer, decrypted.byteOffset, decrypted.byteLength);
  },
};
