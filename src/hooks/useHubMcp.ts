import { useCallback, useSyncExternalStore } from "react";
import { HubMcp, McpListing, McpStatus, OperaHub } from "../services/hub/OperaHubService";

//fast while a server moves, idle otherwise
const BUSY_POLL_MS = 1500;
const IDLE_POLL_MS = 10000;
const GITHUB = "https://github.com/";

export type HubMcpSnapshot = {
  api: HubMcp | null;
  status: McpStatus | null;
  catalog: McpListing[];
  error: unknown;
};

const EMPTY: HubMcpSnapshot = { api: null, status: null, catalog: [], error: null };
let snapshot = EMPTY;
let loading = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function busy(status: McpStatus | null): boolean {
  return !!status && status.servers.some((s) => s.state === "installing" || s.state === "starting");
}

function publish(patch: Partial<HubMcpSnapshot>) {
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
    const api = await OperaHub.mcp();
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

//one poller shared by the page, the sheet and the server page
export function useHubMcp(active = true): HubMcpSnapshot {
  const subscribeActive = useCallback(
    (listener: () => void) => (active ? subscribe(listener) : noop()),
    [active],
  );
  return useSyncExternalStore(subscribeActive, getSnapshot);
}

//applies an action and shares the new status
export async function runHubMcp<T>(action: (api: HubMcp) => Promise<T>): Promise<T> {
  if (!snapshot.api) throw new Error("No Sampler paired");
  const result = await action(snapshot.api);
  publish({ status: await snapshot.api.status() });
  return result;
}

//repository owner avatar, none outside github
export function mcpAvatar(listing: McpListing): string | null {
  const repository = listing.repository ?? "";
  if (!repository.startsWith(GITHUB)) return null;
  const owner = repository.slice(GITHUB.length).split("/")[0];
  return owner ? `${GITHUB}${owner}.png?size=120` : null;
}

//npm 1.2.0 or mcpb, for meta lines
export function mcpSourceLabel(listing: McpListing): string {
  const kind = listing.source.type === "pypi" ? "PyPI" : listing.source.type === "npm" ? "npm" : "MCPB";
  return listing.version ? `${kind} · ${listing.version}` : kind;
}
