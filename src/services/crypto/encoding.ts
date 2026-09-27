import { fromByteArray, toByteArray } from 'react-native-quick-base64';
import { bufferToString } from 'react-native-quick-crypto';

//native paths, js polyfills stall the thread
export const b64ToBytes = (b64: string): Uint8Array => toByteArray(b64);

export const bytesToB64 = (bytes: Uint8Array): string => fromByteArray(bytes);

export const utf8Decode = (bytes: Uint8Array): string =>
  bufferToString(bytes.buffer as ArrayBuffer, 'utf8', bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
