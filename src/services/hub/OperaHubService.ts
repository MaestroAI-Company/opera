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
export type HubErrorCode =
  | 'InvalidLink'
  | 'PairingRejected'
  | 'PairingExpired'
  | 'Unauthorized'
  | 'Unreachable'
  | 'Outdated'
  | 'Internal';

type NativeHub = {
  pair(deviceKey: string, link: string, deviceName: string, kind: string): Promise<PairedHub>;
  status(deviceKey: string, hub: PairedHub): Promise<HubStatus>;
  unpair(deviceKey: string, hub: PairedHub): Promise<void>;
  devices(deviceKey: string, hub: PairedHub): Promise<HubDevice[]>;
  push(deviceKey: string, hub: PairedHub, collection: string, records: SyncRecord[]): Promise<void>;
  pull(deviceKey: string, hub: PairedHub, collection: string, since: number): Promise<PullPage>;
  putGrant(deviceKey: string, hub: PairedHub, grant: McpGrant): Promise<void>;
  accessToken(deviceKey: string, hub: PairedHub, serverId: string): Promise<McpAccessToken | null>;
  dropGrant(deviceKey: string, hub: PairedHub, serverId: string): Promise<void>;
  providers(deviceKey: string, hub: PairedHub): Promise<HubProvider[]>;
  startProxy(deviceKey: string, hub: PairedHub): Promise<{ port: number; token: string }>;
};

//absent without the rust client
const native: NativeHub | undefined =
  Platform.OS === 'android' ? NativeModules.OperaHubModule : undefined;

//per device so never cloud synced
const DEVICE_KEY = 'opera_hub_device_key';
const PAIRED_HUB_KEY = 'opera_hub_paired';
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
    const name = Device.deviceName ?? Device.modelName ?? 'Android';
    const hub = await this.native().pair(await this.deviceKey(), link, name, 'phone');
    await setSecret(PAIRED_HUB_KEY, JSON.stringify(hub));
    return hub;
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
