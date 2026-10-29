import { useCallback, useSyncExternalStore } from "react";
import { modelAvatarUrl } from "../services/ai/providers/huggingFaceCatalog";
import { CatalogModel, HubModels, LlamaStatus, SamplerHub } from "../services/hub/SamplerHubService";

//fast while something moves, idle otherwise
const BUSY_POLL_MS = 1500;
const IDLE_POLL_MS = 10000;

//gguf repos are mirrors, the avatar comes from the upstream org
const PUBLISHERS = [
  { match: /gemma/i, family: "Gemma", org: "google", publisher: "Google" },
  { match: /qwen/i, family: "Qwen", org: "Qwen", publisher: "Qwen" },
  { match: /deepseek/i, family: "DeepSeek", org: "deepseek-ai", publisher: "DeepSeek" },
  { match: /llama/i, family: "Llama", org: "meta-llama", publisher: "Meta" },
  { match: /ministral|mistral/i, family: "Mistral", org: "mistralai", publisher: "Mistral AI" },
  { match: /phi-?\d/i, family: "Phi", org: "microsoft", publisher: "Microsoft" },
  { match: /smol/i, family: "SmolLM", org: "HuggingFaceTB", publisher: "Hugging Face" },
  { match: /granite/i, family: "Granite", org: "ibm-granite", publisher: "IBM" },
  { match: /lfm\d/i, family: "LFM", org: "LiquidAI", publisher: "Liquid AI" },
];

export type HubModelsSnapshot = {
  api: HubModels | null;
  status: LlamaStatus | null;
  catalog: CatalogModel[];
  error: unknown;
};

const EMPTY: HubModelsSnapshot = { api: null, status: null, catalog: [], error: null };
let snapshot = EMPTY;
let loading = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function busy(status: LlamaStatus | null): boolean {
  return !!status && (status.state === "installing" || status.downloads.some((d) => !d.error));
}

function publish(patch: Partial<HubModelsSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
  schedule();
}

function schedule() {
  clearTimeout(timer);
  if (listeners.size === 0 || !snapshot.api) return;
  timer = setTimeout(poll, busy(snapshot.status) ? BUSY_POLL_MS : IDLE_POLL_MS);
}

async function poll() {
  try {
    publish({ status: await snapshot.api!.status() });
  } catch {
    schedule();
  }
}

async function load() {
  if (loading) return;
  loading = true;
  try {
    const api = await SamplerHub.models();
    const [status, catalog] = await Promise.all([api.status(), api.catalog()]);
    publish({ api, status, catalog, error: null });
  } catch (error) {
    publish({ error });
  } finally {
    loading = false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  //the hub may have changed since the last visit
  if (listeners.size === 1) load();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) clearTimeout(timer);
  };
}

const getSnapshot = () => snapshot;
const noop = () => () => {};

//one poller shared by the page, the sheet and the model page
export function useHubModels(active = true): HubModelsSnapshot {
  const subscribeActive = useCallback(
    (listener: () => void) => (active ? subscribe(listener) : noop()),
    [active],
  );
  return useSyncExternalStore(subscribeActive, getSnapshot);
}

//applies an action and shares the new status
export async function runHubModels(action: (api: HubModels) => Promise<LlamaStatus>) {
  if (!snapshot.api) throw new Error("No Sampler paired");
  publish({ status: await action(snapshot.api) });
}

export function isHubModelsBusy(status: LlamaStatus | null): boolean {
  return busy(status);
}

export const fileStem = (file: string) => file.replace(/\.gguf$/i, "");

export const repoLabel = (repo: string) => repo.split("/").pop()!.replace(/[-_.]gguf$/i, "");

export function hubModelName(file: string, catalog: CatalogModel[]): string {
  return catalog.find((m) => m.file === file)?.name ?? fileStem(file);
}

export function hubModelPublisher(name: string) {
  return PUBLISHERS.find((p) => p.match.test(name)) ?? null;
}

//upstream org first, repo owner otherwise
export function hubModelAvatar(name: string, repo?: string): string {
  const org = hubModelPublisher(name)?.org ?? repo?.split("/")[0] ?? "ggml-org";
  return modelAvatarUrl(null, `${org}/${name}`);
}
