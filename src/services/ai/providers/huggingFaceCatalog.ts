import * as Device from 'expo-device';
import { Settings } from '../../settings/SettingsService';
import { universalFetch } from '../utils/universalFetch';

const HF_API = 'https://huggingface.co/api/models';
//only .litertlm containers run, not mediapipe
const MODEL_EXT = '.litertlm';
const CACHE_KEY = 'litert_catalog';
const LIST_LIMIT = 100;
const SEARCH_LIMIT = 40;
//resolving costs one blob call each
const SEARCH_RESOLVE_MAX = 10;
export const MIN_SEARCH_LENGTH = 2;

//model size gated on android ram
const MIN_TOTAL_RAM_RATIO = 4;

//rough int4 gate for obvious giants
const BYTES_PER_PARAM_FLOOR = 0.6e9;

//tiny models are test artifacts
const MIN_MODEL_BYTES = 50e6;

//vendor npu builds lead nowhere useful
const VENDOR_BUILD = /[._-](web|intel|Google_Tensor|qualcomm|mediatek)[._-]/i;

//gpu delegate needs an opencl build
const GPU_BUILD = /[._-]gpu[._-]/i;

//gemma 4 plain build runs on both
const GEMMA_4 = /gemma-4-/i;

export function backendForFile(file: string): 'gpu' | 'cpu' {
  return GPU_BUILD.test(file) || GEMMA_4.test(file) ? 'gpu' : 'cpu';
}

//speech and embedding models cannot chat
const CHAT_PIPELINES = ['text-generation', 'image-text-to-text'];

//google litert-lm repos are gated
//this org is the usable catalog
//scoped to drop hobbyist re-uploads
const CATALOG_AUTHOR = 'litert-community';

export type CatalogEntry = {
  repoId: string;
  label: string;
  family: string;
  file: string;
  url: string;
  sizeBytes: number;
  capabilities: string[];
};

export type ModelFamily = { id: string; label: string; repoIds: string[] };

//deepseek matches before qwen
const FAMILIES: { id: string; label: string; match: RegExp }[] = [
  { id: 'deepseek', label: 'DeepSeek', match: /deepseek/i },
  { id: 'gemma', label: 'Gemma', match: /gemma/i },
  { id: 'qwen', label: 'Qwen', match: /qwen/i },
  { id: 'smollm', label: 'SmolLM', match: /smol/i },
  { id: 'phi', label: 'Phi', match: /phi-?\d/i },
  { id: 'lfm', label: 'LFM', match: /lfm\d/i },
  { id: 'llama', label: 'Llama', match: /llama/i },
  { id: 'mistral', label: 'Mistral', match: /ministral|mistral/i },
  { id: 'granite', label: 'Granite', match: /granite/i },
  { id: 'falcon', label: 'Falcon', match: /falcon/i },
  { id: 'internvl', label: 'InternVL', match: /internvl/i },
];

export const OTHER_FAMILY_ID = 'other';

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${units[i]}`;
}

export function fitsInDeviceMemory(sizeBytes: number): boolean {
  const totalMemory = Device.totalMemory;
  if (!totalMemory) return true;
  return totalMemory >= sizeBytes * MIN_TOTAL_RAM_RATIO;
}

//strips org and packaging suffix
function repoLabel(repoId: string): string {
  return repoId.split('/').pop()!.replace(/[-_.]?litert(-|_)?lm$/i, '');
}

function familyOf(repoId: string): string {
  const name = repoLabel(repoId);
  return FAMILIES.find((f) => f.match.test(name))?.id ?? OTHER_FAMILY_ID;
}

export function familyLabel(id: string): string {
  return FAMILIES.find((f) => f.id === id)?.label ?? '';
}

//parameter count from name or null
function parseParamsB(name: string): number | null {
  const billions = name.match(/(\d+(?:[.,]\d+)?)\s*b\b/i);
  if (billions) return parseFloat(billions[1].replace(',', '.'));
  const millions = name.match(/(\d+(?:[.,]\d+)?)\s*m\b/i);
  if (millions) return parseFloat(millions[1].replace(',', '.')) / 1000;
  return null;
}

//heavy families stay off phones
function plausibleOnDevice(repoId: string): boolean {
  const paramsB = parseParamsB(repoLabel(repoId));
  if (paramsB === null) return true;
  return fitsInDeviceMemory(paramsB * BYTES_PER_PARAM_FLOOR);
}

function capabilitiesFromTags(repoId: string, tags: string[], pipeline?: string): string[] {
  if (GEMMA_4.test(repoId)) return ['vision', 'thinking'];
  const capabilities: string[] = [];
  const lower = tags.map((t) => t.toLowerCase());
  const vision = pipeline === 'image-text-to-text'
    || lower.some((t) => t === 'vlm' || t === 'multimodal' || t === 'vision-language' || t === 'image-text-to-text');
  if (vision) capabilities.push('vision');
  if (lower.some((t) => t === 'reasoning' || t === 'thinking')) capabilities.push('thinking');
  return capabilities;
}

type HFSibling = { rfilename: string; size?: number };
type HFModel = {
  id: string;
  gated?: boolean | string;
  downloads?: number;
  tags?: string[];
  pipeline_tag?: string;
  siblings?: HFSibling[];
};

type Store = { families: ModelFamily[]; entries: Record<string, CatalogEntry> };

const EMPTY_STORE: Store = { families: [], entries: {} };

let store: Store = EMPTY_STORE;
let hydrated = false;

function sanitize(parsed: unknown): Store {
  if (!parsed || typeof parsed !== 'object') return { families: [], entries: {} };
  const raw = parsed as Partial<Store>;
  const families = Array.isArray(raw.families)
    ? raw.families.filter((f) => f && typeof f.id === 'string' && Array.isArray(f.repoIds))
    : [];
  const entries: Record<string, CatalogEntry> = {};
  for (const [key, value] of Object.entries(raw.entries ?? {})) {
    if (value && typeof value.url === 'string' && typeof value.sizeBytes === 'number') entries[key] = value;
  }
  return { families, entries };
}

//retried, settings may be closed
export async function hydrateLiteRTCatalog(): Promise<void> {
  if (hydrated) return;
  try {
    const raw = await Settings.getLocal(CACHE_KEY);
    store = raw ? sanitize(JSON.parse(raw)) : { ...EMPTY_STORE };
    hydrated = true;
  } catch (error) {
    console.warn('[litertCatalog] could not read the stored catalog:', error);
  }
}

function persist(): void {
  Settings.setLocal(CACHE_KEY, JSON.stringify(store)).catch((error) => {
    console.warn('[litertCatalog] could not store the catalog:', error);
  });
}

export function getCatalogEntry(repoId: string): CatalogEntry | null {
  return store.entries[repoId] ?? null;
}

export function listCatalogEntries(): CatalogEntry[] {
  return Object.values(store.entries);
}

//cache lets the browser open offline
export function getCachedFamilies(): ModelFamily[] {
  return store.families;
}

async function getJson(url: string): Promise<any> {
  const response = await universalFetch(url);
  if (!response.ok) throw new Error(`Hugging Face returned ${response.status}`);
  return response.json();
}

//runnable judged on list metadata
function usableRepo(model: HFModel): boolean {
  //gated repos need licences, avoid those
  if (model.gated !== false) return false;
  //untagged repos keep the gemma builds
  if (model.pipeline_tag && !CHAT_PIPELINES.includes(model.pipeline_tag)) return false;
  const files = (model.siblings ?? []).map((s) => s.rfilename);
  if (!files.some((f) => f.endsWith(MODEL_EXT) && !VENDOR_BUILD.test(f))) return false;
  return plausibleOnDevice(model.id);
}

//one listing call, public models only
export async function fetchFamilies(): Promise<ModelFamily[]> {
  const url = `${HF_API}?author=${CATALOG_AUTHOR}&filter=litert-lm&full=true&sort=downloads&direction=-1&limit=${LIST_LIMIT}`;
  const models: HFModel[] = await getJson(url);

  const byFamily = new Map<string, string[]>();
  for (const model of models) {
    if (!usableRepo(model)) continue;

    const family = familyOf(model.id);
    const repos = byFamily.get(family) ?? [];
    repos.push(model.id);
    byFamily.set(family, repos);

    //list metadata cached, sizes cost calls
    const known = store.entries[model.id];
    store.entries[model.id] = {
      repoId: model.id,
      label: repoLabel(model.id),
      family,
      file: known?.file ?? '',
      url: known?.url ?? '',
      sizeBytes: known?.sizeBytes ?? 0,
      capabilities: capabilitiesFromTags(model.id, model.tags ?? [], model.pipeline_tag),
    };
  }

  //families keep the api popularity order
  const families: ModelFamily[] = [];
  for (const [id, repoIds] of byFamily) {
    families.push({ id, label: familyLabel(id), repoIds });
  }
  families.sort((a, b) => (a.id === OTHER_FAMILY_ID ? 1 : b.id === OTHER_FAMILY_ID ? -1 : 0));

  store.families = families;
  persist();
  return families;
}

//smallest fitting build keeps headroom
//gpu gemma build garbles on litert
function pickFile(siblings: HFSibling[]): { file: string; sizeBytes: number } | null {
  const candidates = siblings
    .filter((s) => s.rfilename.endsWith(MODEL_EXT) && !VENDOR_BUILD.test(s.rfilename) && (s.size ?? 0) >= MIN_MODEL_BYTES)
    .sort((a, b) => a.size! - b.size!)
    .filter((s) => fitsInDeviceMemory(s.size!));
  const fitting = candidates.find((s) => !GPU_BUILD.test(s.rfilename)) ?? candidates[0];
  if (!fitting) return null;
  return { file: fitting.rfilename, sizeBytes: fitting.size! };
}

//manifest decides vision and audio
async function readManifest(repoId: string): Promise<string[] | null> {
  try {
    const manifest = await getJson(`https://huggingface.co/${repoId}/raw/main/litertlm_manifest.json`);
    const declared = manifest?.model?.capabilities;
    if (!declared) return null;
    const capabilities: string[] = [];
    if (declared.vision) capabilities.push('vision');
    if (declared.audio) capabilities.push('audio');
    if (declared.thinking?.declared) capabilities.push('thinking');
    return capabilities;
  } catch {
    return null;
  }
}

//one call per repo, for sizes
async function resolveEntry(repoId: string): Promise<CatalogEntry | null> {
  try {
    const model: HFModel = await getJson(`${HF_API}/${repoId}?blobs=true`);
    const picked = pickFile(model.siblings ?? []);
    if (!picked) return null;

    const hasManifest = (model.siblings ?? []).some((s) => s.rfilename === 'litertlm_manifest.json');
    const capabilities = (hasManifest ? await readManifest(repoId) : null)
      ?? capabilitiesFromTags(repoId, model.tags ?? [], model.pipeline_tag);

    const entry: CatalogEntry = {
      repoId,
      label: repoLabel(repoId),
      family: familyOf(repoId),
      file: picked.file,
      url: `https://huggingface.co/${repoId}/resolve/main/${picked.file}`,
      sizeBytes: picked.sizeBytes,
      capabilities,
    };
    store.entries[repoId] = entry;
    return entry;
  } catch (error) {
    console.warn(`[litertCatalog] could not read ${repoId}:`, error);
    return null;
  }
}

const bySize = (a: CatalogEntry, b: CatalogEntry) => a.sizeBytes - b.sizeBytes;

//lazy, one call per repo
export async function fetchFamilyModels(familyId: string): Promise<CatalogEntry[]> {
  const family = store.families.find((f) => f.id === familyId);
  if (!family) return [];

  const resolved = await Promise.all(family.repoIds.map(resolveEntry));
  const entries = resolved.filter((e): e is CatalogEntry => e !== null).sort(bySize);
  //name gate misses show empty families
  if (entries.length === 0) store.families = store.families.filter((f) => f.id !== familyId);
  persist();
  return entries;
}

//hub search finds anything runnable
export async function searchModels(query: string, signal?: AbortSignal): Promise<CatalogEntry[]> {
  const q = query.trim();
  if (q.length < MIN_SEARCH_LENGTH) return [];
  const url = `${HF_API}?filter=litert-lm&search=${encodeURIComponent(q)}&full=true&sort=downloads&direction=-1&limit=${SEARCH_LIMIT}`;
  const models: HFModel[] = await getJson(url);
  if (signal?.aborted) return [];

  //resolve only the popular survivors
  const candidates = models.filter(usableRepo).slice(0, SEARCH_RESOLVE_MAX);
  const resolved = await Promise.all(candidates.map((m) => resolveEntry(m.id)));
  if (signal?.aborted) return [];

  persist();
  return resolved.filter((e): e is CatalogEntry => e !== null).sort(bySize);
}
