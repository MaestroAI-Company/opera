import 'react-native-get-random-values';
import * as Device from 'expo-device';
import { NativeModules, Platform } from 'react-native';
import { getSecret, setSecret } from '../mcp/mcpStorage';

export type PairedHub = { id: string; name: string; relays: string[] };
export type HubStatus = { name: string; version: string; direct: boolean };
export type HubDevice = {
  id: string;
  name: string;
  kind: string;
  scopes: string[];
  pairedAt: number;
  pairedBy: string | null;
  lastSeen?: number;
};
export type SyncRecord = { id: string; updatedAt: number; deleted: boolean; payload: string | null };
export type PullPage = { records: SyncRecord[]; cursor: number; more: boolean };
export type McpGrant = {
  serverId: string;
  tokenEndpoint: string;
  clientId: string;
  refreshToken: string;
  accessToken: string | null;
  expiresAt: number;
};
export type McpAccessToken = { accessToken: string; expiresAt: number };
export type HubProvider = { id: string; name: string; kind: 'ollama' | 'openai' };
//a hub on this computer, desktop only
export type HostStatus = { running: boolean; embedded: boolean; id: string | null };
export type PairingQr = { svg: string; link: string };
export type HubErrorCode =
  | 'InvalidLink'
  | 'PairingRejected'
  | 'PairingExpired'
  | 'Unauthorized'
  | 'Unreachable'
  | 'Outdated'
  | 'Internal';

type NativeHub = {
  //missing on builds older than hub 0.5
  deviceId?(deviceKey: string): Promise<string>;
  pair(deviceKey: string, link: string, deviceName: string, kind: string): Promise<PairedHub>;
  status(deviceKey: string, hub: PairedHub): Promise<HubStatus>;
  unpair(deviceKey: string, hub: PairedHub): Promise<void>;
  devices(deviceKey: string, hub: PairedHub): Promise<HubDevice[]>;
  push(deviceKey: string, hub: PairedHub, collection: string, records: SyncRecord[]): Promise<void>;
  pull(deviceKey: string, hub: PairedHub, collection: string, since: number): Promise<PullPage>;
  watch(deviceKey: string, hub: PairedHub, since: number): Promise<number>;
  putGrant(deviceKey: string, hub: PairedHub, grant: McpGrant): Promise<void>;
  accessToken(deviceKey: string, hub: PairedHub, serverId: string): Promise<McpAccessToken | null>;
  dropGrant(deviceKey: string, hub: PairedHub, serverId: string): Promise<void>;
  providers(deviceKey: string, hub: PairedHub): Promise<HubProvider[]>;
  startProxy(deviceKey: string, hub: PairedHub): Promise<{ port: number; token: string }>;
};

type HubHost = {
  status(): Promise<HostStatus>;
  start(): Promise<void>;
  stop(): Promise<void>;
  pairingLink(): Promise<string>;
  pairingQr(dark: string, light: string): Promise<PairingQr>;
  computerName(): Promise<string>;
};

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import('@tauri-apps/api/core');
  return core.invoke<T>(command, args);
}

//desktop runs the same rust client natively
const tauriHub: NativeHub = {
  deviceId: (deviceKey) => invoke('hub_device_id', { deviceKey }),
  pair: (deviceKey, link, deviceName, kind) => invoke('hub_pair', { deviceKey, link, deviceName, kind }),
  status: (deviceKey, hub) => invoke('hub_status', { deviceKey, hub }),
  unpair: (deviceKey, hub) => invoke('hub_unpair', { deviceKey, hub }),
  devices: (deviceKey, hub) => invoke('hub_devices', { deviceKey, hub }),
  push: (deviceKey, hub, collection, records) => invoke('hub_push', { deviceKey, hub, collection, records }),
  pull: (deviceKey, hub, collection, since) => invoke('hub_pull', { deviceKey, hub, collection, since }),
  watch: (deviceKey, hub, since) => invoke('hub_watch', { deviceKey, hub, since }),
  putGrant: (deviceKey, hub, grant) => invoke('hub_put_grant', { deviceKey, hub, grant }),
  accessToken: (deviceKey, hub, serverId) => invoke('hub_access_token', { deviceKey, hub, serverId }),
  dropGrant: (deviceKey, hub, serverId) => invoke('hub_drop_grant', { deviceKey, hub, serverId }),
  providers: (deviceKey, hub) => invoke('hub_providers', { deviceKey, hub }),
  startProxy: (deviceKey, hub) => invoke('hub_start_proxy', { deviceKey, hub }),
};

const tauriHost: HubHost = {
  status: () => invoke('hub_host_status'),
  start: () => invoke('hub_host_start'),
  stop: () => invoke('hub_host_stop'),
  pairingLink: () => invoke('hub_host_pairing_link'),
  pairingQr: (dark, light) => invoke('hub_host_pairing_qr', { dark, light }),
  computerName: () => invoke('hub_computer_name'),
};

//absent without the rust client
const native: NativeHub | undefined =
  Platform.OS === 'android' ? NativeModules.OperaHubModule : isTauri ? tauriHub : undefined;
const host: HubHost | undefined = isTauri ? tauriHost : undefined;

//per device so never cloud synced
const DEVICE_KEY = 'opera_hub_device_key';
const PAIRED_HUB_KEY = 'opera_hub_paired';
const HOSTING_KEY = 'opera_hub_hosting';
//a fresh hub publishes its address slowly
const SELF_PAIR_ATTEMPTS = 5;
const SELF_PAIR_DELAY_MS = 2000;
//providers reached through the hub tunnel
export const HUB_URL_SCHEME = 'opera-hub://';

export function hubErrorCode(e: unknown): HubErrorCode {
  const code = (e as { code?: string })?.code;
  const known: HubErrorCode[] = [
    'InvalidLink',
    'PairingRejected',
    'PairingExpired',
    'Unauthorized',
    'Unreachable',
    'Outdated',
  ];
  return known.includes(code as HubErrorCode) ? (code as HubErrorCode) : 'Internal';
}

class OperaHubServiceImpl {
  isSupported(): boolean {
    return !!native;
  }

  async getPairedHub(): Promise<PairedHub | null> {
    const raw = await getSecret(PAIRED_HUB_KEY);
    return raw ? (JSON.parse(raw) as PairedHub) : null;
  }

  async pair(link: string): Promise<PairedHub> {
    const { name, kind } = await this.identity();
    const hub = await this.native().pair(await this.deviceKey(), link, name, kind);
    await setSecret(PAIRED_HUB_KEY, JSON.stringify(hub));
    return hub;
  }

  //null when the client predates it
  async deviceId(): Promise<string | null> {
    const native = this.native();
    return native.deviceId ? native.deviceId(await this.deviceKey()) : null;
  }

  canHost(): boolean {
    return !!host;
  }

  async hostStatus(): Promise<HostStatus> {
    return this.host().status();
  }

  async isHosting(): Promise<boolean> {
    return (await getSecret(HOSTING_KEY)) === 'true';
  }

  //runs while the app is open
  async setHosting(enabled: boolean): Promise<void> {
    if (enabled) await this.host().start();
    else await this.host().stop();
    await setSecret(HOSTING_KEY, enabled ? 'true' : null);
  }

  //restarts the hub after an app restart
  async resumeHosting(): Promise<void> {
    if (!host || !(await this.isHosting())) return;
    await host.start().catch((e) => console.warn('[OperaHub] hub did not start:', e));
  }

  //pairs with the hub running on this computer
  async pairWithThisComputer(): Promise<PairedHub> {
    const link = await this.host().pairingLink();
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.pair(link);
      } catch (e) {
        if (hubErrorCode(e) !== 'Unreachable' || attempt >= SELF_PAIR_ATTEMPTS) throw e;
        await new Promise((resolve) => setTimeout(resolve, SELF_PAIR_DELAY_MS));
      }
    }
  }

  //one time code for another device
  async hostPairingQr(dark: string, light: string): Promise<PairingQr> {
    return this.host().pairingQr(dark, light);
  }

  async status(hub: PairedHub): Promise<HubStatus> {
    return this.native().status(await this.deviceKey(), hub);
  }

  async devices(hub: PairedHub): Promise<HubDevice[]> {
    return this.native().devices(await this.deviceKey(), hub);
  }

  async push(hub: PairedHub, collection: string, records: SyncRecord[]): Promise<void> {
    return this.native().push(await this.deviceKey(), hub, collection, records);
  }

  async pull(hub: PairedHub, collection: string, since: number): Promise<PullPage> {
    return this.native().pull(await this.deviceKey(), hub, collection, since);
  }

  //hub cursor once something newer than since lands
  async watch(hub: PairedHub, since: number): Promise<number> {
    return this.native().watch(await this.deviceKey(), hub, since);
  }

  async putGrant(hub: PairedHub, grant: McpGrant): Promise<void> {
    return this.native().putGrant(await this.deviceKey(), hub, grant);
  }

  async accessToken(hub: PairedHub, serverId: string): Promise<McpAccessToken | null> {
    return this.native().accessToken(await this.deviceKey(), hub, serverId);
  }

  async dropGrant(hub: PairedHub, serverId: string): Promise<void> {
    return this.native().dropGrant(await this.deviceKey(), hub, serverId);
  }

  async providers(hub: PairedHub): Promise<HubProvider[]> {
    return this.native().providers(await this.deviceKey(), hub);
  }

  //maps hub urls to the local proxy
  async resolveUrl(url: string): Promise<string> {
    const hub = await this.getPairedHub();
    if (!hub) throw Object.assign(new Error('No Opera Hub paired'), { code: 'Unauthorized' });
    const { port, token } = await this.native().startProxy(await this.deviceKey(), hub);
    return `http://127.0.0.1:${port}/${token}/${url.slice(HUB_URL_SCHEME.length)}`;
  }

  //forgets locally even if unreachable
  async unpair(hub: PairedHub): Promise<void> {
    try {
      await this.native().unpair(await this.deviceKey(), hub);
    } catch (e) {
      console.warn('[OperaHub] hub not told about unpairing:', e);
    }
    await setSecret(PAIRED_HUB_KEY, null);
  }

  async forget(): Promise<void> {
    await setSecret(PAIRED_HUB_KEY, null);
  }

  private async identity(): Promise<{ name: string; kind: string }> {
    if (host) return { name: await host.computerName(), kind: 'desktop' };
    return { name: Device.deviceName ?? Device.modelName ?? 'Android', kind: 'phone' };
  }

  private host(): HubHost {
    if (!host) throw Object.assign(new Error('Hosting needs the desktop app'), { code: 'Internal' });
    return host;
  }

  private native(): NativeHub {
    if (!native) throw Object.assign(new Error('Opera Hub is not available'), { code: 'Internal' });
    return native;
  }

  //the hub knows its public key
  private async deviceKey(): Promise<string> {
    const existing = await getSecret(DEVICE_KEY);
    if (existing) return existing;
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    await setSecret(DEVICE_KEY, key);
    return key;
  }
}

export const OperaHub = new OperaHubServiceImpl();
