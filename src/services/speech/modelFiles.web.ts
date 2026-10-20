const CACHE_NAME = 'opera-models';
//cache api has no sync lookup
const MARKER_PREFIX = 'opera-model:';

function marked(source: string): boolean {
  try {
    return localStorage.getItem(MARKER_PREFIX + source) === '1';
  } catch {
    return false;
  }
}

function mark(source: string, stored: boolean): void {
  try {
    if (stored) localStorage.setItem(MARKER_PREFIX + source, '1');
    else localStorage.removeItem(MARKER_PREFIX + source);
  } catch {
    //marker only speeds up the check
  }
}

async function cachedResponse(source: string): Promise<Response> {
  const response = await (await caches.open(CACHE_NAME)).match(source);
  if (!response) {
    mark(source, false);
    throw new Error(`Model file missing from cache: ${source}`);
  }
  return response;
}

async function sizeOf(source: string): Promise<number> {
  try {
    const response = await fetch(source, { method: 'HEAD' });
    return Number(response.headers.get('content-length')) || 0;
  } catch {
    return 0;
  }
}

export function canStoreModels(): boolean {
  return typeof caches !== 'undefined' && typeof localStorage !== 'undefined';
}

export function isDownloaded(sources: string[]): boolean {
  return sources.every(marked);
}

//cached files are skipped
export async function downloadFiles(sources: string[], onProgress: (progress: number) => void): Promise<void> {
  const cache = await caches.open(CACHE_NAME);
  //browser may evict without it
  await navigator.storage?.persist?.().catch(() => false);
  const missing: string[] = [];
  for (const source of sources) {
    if (await cache.match(source)) mark(source, true);
    else missing.push(source);
  }
  const sizes = await Promise.all(missing.map(sizeOf));
  const total = sizes.reduce((sum, size) => sum + size, 0);
  let received = 0;

  for (const source of missing) {
    const response = await fetch(source);
    if (!response.ok || !response.body) throw new Error(`Failed to download ${source}: ${response.status}`);
    const chunks: Uint8Array[] = [];
    const reader = response.body.getReader();
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      chunks.push(read.value);
      received += read.value.length;
      if (total > 0) onProgress(Math.min(1, received / total));
    }
    await cache.put(source, new Response(new Blob(chunks as BlobPart[]), { headers: response.headers }));
    mark(source, true);
  }
  onProgress(1);
}

export async function removeFiles(sources: string[]): Promise<void> {
  const cache = await caches.open(CACHE_NAME);
  for (const source of sources) {
    await cache.delete(source);
    mark(source, false);
  }
}

//web runtime loads models from bytes
export async function modelInput(source: string): Promise<string | Uint8Array> {
  return new Uint8Array(await (await cachedResponse(source)).arrayBuffer());
}

export async function readText(source: string): Promise<string> {
  return (await cachedResponse(source)).text();
}
