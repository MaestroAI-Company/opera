const decoder = new TextDecoder();

export const b64ToBytes = (b64: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(b64), (char) => char.charCodeAt(0));

export const bytesToB64 = (bytes: Uint8Array): string => {
  let binary = '';
  //chunked spread avoids argument limit
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};

export const utf8Decode = (bytes: Uint8Array): string => decoder.decode(bytes);
