import { gunzipSync, gzipSync } from 'fflate';

//async so gzip leaves the thread
export async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  //level 1 trades bytes for speed
  return gzipSync(bytes, { level: 1, mtime: 0 });
}

export async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  return gunzipSync(bytes);
}
