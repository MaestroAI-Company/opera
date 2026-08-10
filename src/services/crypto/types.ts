//per-platform crypto behind base64 boundary
export type BackupCrypto = {
  randomBytesB64(size: number): Promise<string>;
  sha256B64(messageUtf8: string): Promise<string>;
  pbkdf2Sha256B64(passwordUtf8: string, saltB64: string, iterations: number, keyLenBytes: number): Promise<string>;
  hmacSha256B64(keyB64: string, messageUtf8: string): Promise<string>;
  aesCbcEncryptB64(keyB64: string, ivB64: string, plaintextUtf8: string): Promise<string>;
  aesCbcDecryptUtf8(keyB64: string, ivB64: string, ciphertextB64: string): Promise<string>;
};
