//platform-specific crypto so the rest of the share module stays isomorphic
export type PasteCrypto = {
  randomBytes(size: number): Promise<Uint8Array>;
  pbkdf2Sha256(password: Uint8Array, salt: Uint8Array, iterations: number, keyLenBytes: number): Promise<Uint8Array>;
  //auth tag appended to ciphertext
  aesGcmEncrypt(key: Uint8Array, iv: Uint8Array, aad: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array>;
  aesGcmDecrypt(key: Uint8Array, iv: Uint8Array, aad: Uint8Array, sealed: Uint8Array): Promise<Uint8Array>;
};

//shared payload without local ids
export type SharedMessage = {
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  images?: string[];
  sources?: { url: string; title?: string; favicon?: string }[];
};

export type SharedPayload = {
  v: 1;
  name: string;
  model: string;
  createdAt: number;
  messages: SharedMessage[];
};
