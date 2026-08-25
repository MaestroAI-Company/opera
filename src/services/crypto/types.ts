//per-platform crypto behind base64 boundary
export type BackupCrypto = {
  randomBytesB64(size: number): Promise<string>;
  sha256B64(messageUtf8: string): Promise<string>;
  pbkdf2Sha256B64(passwordUtf8: string, saltB64: string, iterations: number, keyLenBytes: number): Promise<string>;
  hmacSha256B64(keyB64: string, messageUtf8: string): Promise<string>;
  //bytes in and out, the payload is gzipped before it is sealed
  aesCbcEncryptBytesB64(keyB64: string, ivB64: string, plaintext: Uint8Array): Promise<string>;
  aesCbcDecryptBytes(keyB64: string, ivB64: string, ciphertextB64: string): Promise<Uint8Array>;
};
