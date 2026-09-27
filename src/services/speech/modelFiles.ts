import { File, Paths } from 'expo-file-system';
import { executorch } from './executorch';

//expo fetcher stores files here
const RNE_DIR = 'react-native-executorch';

function requireExecutorch() {
  const lib = executorch();
  if (!lib) throw new Error('ExecuTorch is not available');
  return lib;
}

function localFile(source: string): File {
  const lib = requireExecutorch();
  return new File(Paths.document, RNE_DIR, lib.ResourceFetcherUtils.getFilenameFromUri(source));
}

//downloads go through the executorch fetcher
export function canStoreModels(): boolean {
  return !!executorch();
}

//filesystem read, safe while rendering
export function isDownloaded(sources: string[]): boolean {
  if (!executorch()) return false;
  try {
    return sources.every((source) => localFile(source).exists);
  } catch {
    return false;
  }
}

//fetcher skips files already on disk
export async function downloadFiles(sources: string[], onProgress: (progress: number) => void): Promise<void> {
  await requireExecutorch().ResourceFetcher.fetch(onProgress, ...sources);
}

export async function removeFiles(sources: string[]): Promise<void> {
  if (!executorch()) return;
  for (const source of sources) {
    const file = localFile(source);
    if (file.exists) file.delete();
  }
}

//native runtimes read the file path
export async function modelInput(source: string): Promise<string | Uint8Array> {
  return localFile(source).uri;
}

export function readText(source: string): Promise<string> {
  return localFile(source).text();
}
