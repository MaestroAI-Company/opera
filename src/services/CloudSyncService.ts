import 'react-native-get-random-values';
import { strToU8 } from 'fflate';
import { BackupCryptoImpl } from './crypto/backupCrypto';
import { b64ToBytes, bytesToB64, utf8Decode } from './crypto/encoding';
import { gunzip, gzip } from './cloud/compress';
import { BackupData } from './BackupService';
import { DB, Conversation, Message, SyncTombstone } from './db/DatabaseService';
import { Settings, AppSettings } from './settings/SettingsService';
import { CloudProvider, CloudUserInfo } from './cloud/CloudProvider';
import { getCloudProviderDefinition } from './cloud/registry';
import { AppEvents } from './events';
import * as SecureStore from 'expo-secure-store';
import { Platform, AppState, DeviceEventEmitter } from 'react-native';

const SYNC_FILE_NAME = 'opera_sync.enc';
const CLOUD_PROVIDER_KEY = 'cloud_provider';
const SYNC_PIN_KEY = 'cloud_sync_pin';
const LAST_SYNC_TIME_KEY = 'cloud_sync_last_time';
const LAST_SYNC_SIZE_KEY = 'cloud_sync_last_size';
const SYNC_PAUSED_KEY = 'cloud_sync_paused';
const REMOTE_STATE_KEY = 'cloud_sync_remote_state';

//a full migration flow (prompt, gating, local snapshot) lives in 78bd429
const ENC_VERSION = 2;
//v1 gzipped everything, images included
const LEGACY_ENC_VERSION = 1;
const BLOB_REF_PREFIX = 'opera-blob:';
const PBKDF2_ITERATIONS = 50000;
const AES_KEY_BYTES = 32;
const IV_BYTES = 16;
const SALT_BYTES = 16;

const RETRY_BASE_DELAY_MS = 15000;
const RETRY_MAX_DELAY_MS = 5 * 60 * 1000;
const MAX_RETRY_ATTEMPTS = 5;

type SyncOutcome = { success: boolean; error?: string; retryable?: boolean };

//tag and hash of last upload
type RemoteState = { tag: string; hash: string };

type DecryptOutcome = { backup: unknown; unsupportedVersion?: boolean };

//image bytes trail the gzipped json
type BlobEntry = { id: string; prefix: string; length: number };
type PackedBackup = { backup: BackupData; blobs: BlobEntry[] };

//separate keys from one pbkdf2 pass
type DerivedKeys = {
  encryptionKey: string;
  macKey: string;
};

class CloudSyncServiceImpl {
  private provider: CloudProvider | null = null;
  private pin: string | null = null;
  private syncTimeout: ReturnType<typeof setTimeout> | null = null;
  //current sync promise or null
  private runningSync: Promise<SyncOutcome> | null = null;
  private isMerging: boolean = false;
  private initialized: boolean = false;
  private keyCache = new Map<string, DerivedKeys>();
  private lastSaltB64: string | null = null;
  //account stays linked while sync is off
  private paused: boolean = false;
  //lets sync skip when nothing moved
  private remoteState: RemoteState | null = null;
  //pin check result, spares a second decrypt
  private verifiedDownload: { tag: string; backup: unknown } | null = null;
  private retryAttempt = 0;

  private async setStorageItem(key: string, value: string | null) {
    if (Platform.OS === 'web') {
      if (value === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, value);
      }
    } else {
      if (value === null) {
        await SecureStore.deleteItemAsync(key);
      } else {
        await SecureStore.setItemAsync(key, value);
      }
    }
  }

  private async getStorageItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key) || null;
    }
    return await SecureStore.getItemAsync(key);
  }

  async init(): Promise<void> {
    //init once or listeners register twice
    if (this.initialized) return;
    this.initialized = true;

    this.remoteState = await this.loadRemoteState();
    this.paused = (await this.getStorageItem(SYNC_PAUSED_KEY)) === 'true';

    const providerName = await this.getStorageItem(CLOUD_PROVIDER_KEY);

    if (providerName && providerName !== 'none') {
      await this.migrateSharedPin(providerName);
      await this.loadPinFor(providerName);
      const def = getCloudProviderDefinition(providerName);
      if (def) {
        const provider = def.create();
        if (await provider.authenticate(false)) { //silent auth
          this.provider = provider;
        }
      }
    }

    //trigger initial sync on startup
    if (this.provider && this.pin) {
      this.requestAutoSync(0);
    }

    //auto-sync on app active
    AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        this.requestAutoSync(0); //trigger on foreground
      }
    });

    //sync on any data change
    const onDataChanged = () => {
      if (this.isMerging) return; //merge already persists tombstones
      this.requestAutoSync(5000); //5s debounce
    };
    DeviceEventEmitter.addListener(AppEvents.conversationsChanged, onDataChanged);
    DeviceEventEmitter.addListener(AppEvents.settingsChanged, onDataChanged);
  }

  requestAutoSync(delay = 5000) {
    if (this.paused || !this.provider || !this.pin) return;
    
    if (this.syncTimeout) clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(() => {
      this.sync(true).catch((e) => console.error('Auto-sync failed:', e));
    }, delay);
  }

  async getLastSyncTime(): Promise<number | null> {
    const time = await this.getStorageItem(LAST_SYNC_TIME_KEY);
    return time ? parseInt(time, 10) : null;
  }

  async getLastSyncSize(): Promise<number | null> {
    const size = await this.getStorageItem(LAST_SYNC_SIZE_KEY);
    return size ? parseInt(size, 10) : null;
  }

  async isProviderConfigured(providerName: string): Promise<boolean> {
    const def = getCloudProviderDefinition(providerName);
    if (!def) return false;
    if (!def.SetupComponent) return true; //providers without setup are always ready
    const provider = def.create();
    return provider.isConfigured ? await provider.isConfigured() : true;
  }

  async setProvider(providerName: string): Promise<boolean> {
    if (providerName === 'none') {
      await this.setPaused(true);
      return true;
    }

    //same account still linked just turn sync back on
    if (this.provider?.getId() === providerName) {
      await this.setStorageItem(CLOUD_PROVIDER_KEY, providerName);
      await this.setPaused(false);
      return true;
    }

    const def = getCloudProviderDefinition(providerName);
    if (!def) return false;

    const newProvider = def.create();
    const success = await newProvider.authenticate(true);
    if (success) {
      this.provider = newProvider;
      await this.setStorageItem(CLOUD_PROVIDER_KEY, providerName);
      await this.loadPinFor(providerName);
      //another account, another remote file
      await this.setRemoteState(null);
      this.retryAttempt = 0;
      await this.setPaused(false);
      return true;
    }
    return false;
  }

  //unlinks the account for good
  async disconnect(): Promise<void> {
    await this.clearPin();
    if (this.provider) {
      await this.provider.logout();
    }
    this.provider = null;
    this.keyCache.clear();
    this.lastSaltB64 = null;
    this.retryAttempt = 0;
    await this.setRemoteState(null);
    await this.setStorageItem(CLOUD_PROVIDER_KEY, null);
    await this.setStorageItem(LAST_SYNC_TIME_KEY, null);
    await this.setStorageItem(LAST_SYNC_SIZE_KEY, null);
    await this.setPaused(false);
  }

  private async setPaused(paused: boolean): Promise<void> {
    this.paused = paused;
    if (paused && this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }
    await this.setStorageItem(SYNC_PAUSED_KEY, paused ? 'true' : null);
    if (!paused) {
      this.retryAttempt = 0;
      this.requestAutoSync(0);
    }
  }

  getProviderName(): string {
    //paused reads as none so the ui shows sync off
    if (this.paused) return 'none';
    return this.provider?.getId() ?? 'none';
  }

  async getUserInfo(): Promise<CloudUserInfo | null> {
    if (!this.provider) return null;
    return this.provider.getUserInfo();
  }

  async setPin(pin: string): Promise<void> {
    this.pin = pin;
    this.keyCache.clear();
    this.lastSaltB64 = null;
    //new pin rewrites envelope, stale tag
    await this.setRemoteState(null);
    const providerName = this.provider?.getId();
    if (providerName) {
      await this.setStorageItem(this.pinKey(providerName), pin);
    }
  }

  hasPin(): boolean {
    return !!this.pin;
  }

  //each account encrypts its backup with its own pin
  private pinKey(providerName: string): string {
    return `${SYNC_PIN_KEY}_${providerName}`;
  }

  private async loadPinFor(providerName: string): Promise<void> {
    this.pin = await this.getStorageItem(this.pinKey(providerName));
    this.keyCache.clear();
    this.lastSaltB64 = null;
  }

  //older builds kept one pin for every provider
  private async migrateSharedPin(providerName: string): Promise<void> {
    const sharedPin = await this.getStorageItem(SYNC_PIN_KEY);
    if (!sharedPin) return;
    const key = this.pinKey(providerName);
    if (!(await this.getStorageItem(key))) {
      await this.setStorageItem(key, sharedPin);
    }
    await this.setStorageItem(SYNC_PIN_KEY, null);
  }

  async hasCloudBackup(): Promise<boolean> {
    if (!this.provider) return false;
    try {
      const download = await this.provider.downloadFile(SYNC_FILE_NAME);
      return download.status === 'ok';
    } catch (e) {
      console.warn('Could not check for a cloud backup:', e);
      return false;
    }
  }

  async verifyAndSetPin(pin: string): Promise<boolean> {
    if (!this.provider) return false;
    try {
      const download = await this.provider.downloadFile(SYNC_FILE_NAME);
      if (download.status !== 'ok') return false;

      const decrypted = await this.decrypt(download.content, pin);
      if (decrypted.backup) {
        //decrypt already validated json
        await this.setPin(pin);
        if (download.tag) this.verifiedDownload = { tag: download.tag, backup: decrypted.backup };
        return true;
      }
    } catch (e) {
      console.warn('PIN verification failed:', e);
    }
    return false;
  }

  async forgetCode(): Promise<void> {
    if (this.provider) {
      await this.provider.deleteFile(SYNC_FILE_NAME);
    }
    await this.clearPin();
    await this.setStorageItem(LAST_SYNC_SIZE_KEY, null);
  }

  private async clearPin(): Promise<void> {
    this.pin = null;
    this.keyCache.clear();
    this.lastSaltB64 = null;
    await this.setRemoteState(null);
    const providerName = this.provider?.getId();
    if (providerName) {
      await this.setStorageItem(this.pinKey(providerName), null);
    }
  }

  private async loadRemoteState(): Promise<RemoteState | null> {
    const raw = await this.getStorageItem(REMOTE_STATE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.tag === 'string' && typeof parsed?.hash === 'string') return parsed;
    } catch (e) {
      console.warn('Could not read the stored sync state:', e);
    }
    return null;
  }

  //written only after successful uploads
  private async setRemoteState(state: RemoteState | null): Promise<void> {
    this.verifiedDownload = null;
    this.remoteState = state;
    await this.setStorageItem(REMOTE_STATE_KEY, state ? JSON.stringify(state) : null);
  }


  private scheduleRetry(): void {
    if (this.retryAttempt >= MAX_RETRY_ATTEMPTS) return;
    const delay = Math.min(RETRY_BASE_DELAY_MS * 2 ** this.retryAttempt, RETRY_MAX_DELAY_MS);
    this.retryAttempt++;
    //jitter avoids lockstep retries
    this.requestAutoSync(delay + Math.random() * 1000);
  }

  //one pbkdf2 pass expands into subkeys
  private async deriveKeys(pin: string, saltB64: string, iterations: number): Promise<DerivedKeys> {
    //pin hidden from map keys
    const cacheKey = await BackupCryptoImpl.sha256B64(`${pin}:${iterations}:${saltB64}`);
    let keys = this.keyCache.get(cacheKey);
    if (!keys) {
      const master = await BackupCryptoImpl.pbkdf2Sha256B64(pin, saltB64, iterations, AES_KEY_BYTES);
      keys = {
        encryptionKey: await BackupCryptoImpl.hmacSha256B64(master, 'opera-encryption'),
        macKey: await BackupCryptoImpl.hmacSha256B64(master, 'opera-authentication'),
      };
      this.keyCache.set(cacheKey, keys);
    }
    return keys;
  }

  //mac covers ciphertext and params
  private computeMac(macKey: string, version: number, iterations: number, saltB64: string, ivB64: string, ctB64: string): Promise<string> {
    return BackupCryptoImpl.hmacSha256B64(macKey, `${version}|${iterations}|${saltB64}|${ivB64}|${ctB64}`);
  }

  //base64 wastes gzip, ship raw bytes
  private async packBackup(backup: BackupData): Promise<{ json: string; blobs: Uint8Array[] }> {
    const entries: BlobEntry[] = [];
    const blobs: Uint8Array[] = [];
    const packedIds = new Set<string>();
    const messages: Message[] = [];
    for (const message of backup.messages) {
      if (!message.images?.length) {
        messages.push(message);
        continue;
      }
      const images: string[] = [];
      for (const uri of message.images) {
        const comma = uri.indexOf(',');
        const prefix = uri.slice(0, comma + 1);
        if (!uri.startsWith('data:') || !prefix.endsWith(';base64,')) {
          images.push(uri);
          continue;
        }
        //content hash dedupes identical images
        const id = await BackupCryptoImpl.sha256B64(uri);
        if (!packedIds.has(id)) {
          const b64 = uri.slice(comma + 1);
          const bytes = b64ToBytes(b64);
          //stay inline unless restore is exact
          if (bytesToB64(bytes) !== b64) {
            images.push(uri);
            continue;
          }
          packedIds.add(id);
          entries.push({ id, prefix, length: bytes.length });
          blobs.push(bytes);
        }
        images.push(BLOB_REF_PREFIX + id);
      }
      messages.push({ ...message, images });
    }
    const packed: PackedBackup = { backup: { ...backup, messages }, blobs: entries };
    return { json: JSON.stringify(packed), blobs };
  }

  private unpackBackup(packed: PackedBackup, blobBytes: Uint8Array): BackupData {
    const uris = new Map<string, string>();
    let offset = 0;
    for (const entry of packed.blobs) {
      uris.set(BLOB_REF_PREFIX + entry.id, entry.prefix + bytesToB64(blobBytes.subarray(offset, offset + entry.length)));
      offset += entry.length;
    }
    const messages = packed.backup.messages.map((message) =>
      message.images?.length
        ? { ...message, images: message.images.map((uri) => uris.get(uri) ?? uri) }
        : message
    );
    return { ...packed.backup, messages };
  }

  private async encrypt(json: string, blobs: Uint8Array[], pin: string): Promise<string> {
    const saltB64 = this.lastSaltB64 ?? (await BackupCryptoImpl.randomBytesB64(SALT_BYTES));
    this.lastSaltB64 = saltB64;
    const keys = await this.deriveKeys(pin, saltB64, PBKDF2_ITERATIONS);
    const ivB64 = await BackupCryptoImpl.randomBytesB64(IV_BYTES);
    //gzip shrinks chat json about fivefold
    const gzipped = await gzip(strToU8(json));
    //u32 length, gzipped json, image bytes
    const payload = new Uint8Array(4 + gzipped.length + blobs.reduce((sum, blob) => sum + blob.length, 0));
    new DataView(payload.buffer).setUint32(0, gzipped.length);
    payload.set(gzipped, 4);
    let offset = 4 + gzipped.length;
    for (const blob of blobs) {
      payload.set(blob, offset);
      offset += blob.length;
    }
    const ctB64 = await BackupCryptoImpl.aesCbcEncryptBytesB64(keys.encryptionKey, ivB64, payload);
    return JSON.stringify({
      v: ENC_VERSION,
      kdf: 'pbkdf2-sha256',
      iter: PBKDF2_ITERATIONS,
      salt: saltB64,
      iv: ivB64,
      ct: ctB64,
      mac: await this.computeMac(keys.macKey, ENC_VERSION, PBKDF2_ITERATIONS, saltB64, ivB64, ctB64),
    });
  }

  private async decrypt(data: string, pin: string): Promise<DecryptOutcome> {
    try {
      const env = JSON.parse(data);
      if (!env || env.kdf !== 'pbkdf2-sha256') return { backup: null };

      if (env.v !== ENC_VERSION && env.v !== LEGACY_ENC_VERSION) {
        //pin fine, file written by another version
        console.warn(`Unsupported cloud backup version: ${env.v}`);
        return { backup: null, unsupportedVersion: true };
      }

      const iterations = typeof env.iter === 'number' ? env.iter : PBKDF2_ITERATIONS;
      const keys = await this.deriveKeys(pin, env.salt, iterations);

      const expectedMac = await this.computeMac(keys.macKey, env.v, iterations, env.salt, env.iv, env.ct);
      if (env.mac !== expectedMac) {
        console.warn('Cloud backup failed its integrity check, refusing to import it');
        return { backup: null };
      }

      this.lastSaltB64 = env.salt;
      //wrong pin throws padding error
      const bytes = await BackupCryptoImpl.aesCbcDecryptBytes(keys.encryptionKey, env.iv, env.ct);
      if (env.v === LEGACY_ENC_VERSION) {
        return { backup: JSON.parse(utf8Decode(await gunzip(bytes))) };
      }

      const jsonLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
      const packed: PackedBackup = JSON.parse(utf8Decode(await gunzip(bytes.subarray(4, 4 + jsonLength))));
      return { backup: this.unpackBackup(packed, bytes.subarray(4 + jsonLength)) };
    } catch (e) {
      //caller decides what to report
      console.warn('Could not decrypt cloud payload:', e);
    }
    return { backup: null };
  }

  async sync(isBackground = false): Promise<SyncOutcome> {
    if (this.paused) {
      return { success: false, error: 'Sync is turned off' };
    }
    if (!this.provider || !this.pin) {
      return { success: false, error: 'Provider or PIN not configured' };
    }

    //skip if another sync runs
    if (isBackground && this.runningSync) {
      return { success: true };
    }

    //manual sync waits its turn
    const thisSync = this.runSyncAfter(this.runningSync);
    this.runningSync = thisSync;
    try {
      const outcome = await thisSync;
      if (outcome.success) {
        this.retryAttempt = 0;
      } else if (outcome.retryable) {
        this.scheduleRetry();
      }
      return outcome;
    } finally {
      if (this.runningSync === thisSync) {
        this.runningSync = null;
      }
    }
  }

  private async runSyncAfter(previousSync: Promise<SyncOutcome> | null): Promise<SyncOutcome> {
    if (previousSync) {
      await previousSync.catch(() => undefined);
    }
    return this.runSync();
  }

  private async runSync(): Promise<SyncOutcome> {
    if (!this.provider || !this.pin) {
      return { success: false, error: 'Provider or PIN not configured' };
    }
    //capture provider once for sync
    const provider = this.provider;
    const pin = this.pin;

    try {
      //1. download unless unchanged since upload
      const knownState = this.remoteState;
      const verified = this.verifiedDownload;
      this.verifiedDownload = null;
      const download = await provider.downloadFile(SYNC_FILE_NAME, knownState?.tag ?? verified?.tag ?? null);
      if (download.status === 'error') {
        //blind upload would drop remote changes
        return { success: false, error: 'Could not reach the cloud.', retryable: true };
      }

      let cloudBackup: BackupData | null = null;
      let fetched: unknown = null;

      if (download.status === 'ok') {
        const decrypted = await this.decrypt(download.content, pin);
        if (decrypted.unsupportedVersion) {
          //newer build wrote it, leave untouched
          return { success: false, error: 'Cloud backup was written by a newer version of Opera.' };
        }
        if (!decrypted.backup) {
          //code no longer valid, clear stored pin
          await this.clearPin();
          DeviceEventEmitter.emit(AppEvents.syncPinInvalidated);
          return { success: false, error: 'Invalid PIN. Could not decrypt cloud backup.' };
        }
        fetched = decrypted.backup;
      } else if (download.status === 'unchanged' && !knownState && verified) {
        //file the pin check just decrypted
        fetched = verified.backup;
      }

      if (fetched) {
        const parsed = fetched as BackupData;
        if (typeof parsed !== 'object' || !parsed.settings || !Array.isArray(parsed.conversations) || !Array.isArray(parsed.messages)) {
          console.warn('Cloud backup is unreadable: invalid backup structure');
          return { success: false, error: 'Cloud backup is corrupted or incompatible.' };
        }
        cloudBackup = parsed;
      }

      //2. merge cloud into local
      if (cloudBackup) {
        const backupToMerge = cloudBackup;
        this.isMerging = true;
        try {
          await DB.runSilently(() => this.mergeCloudIntoLocal(backupToMerge));
          //one notification for the merge
          DeviceEventEmitter.emit(AppEvents.conversationsChanged);
        } finally {
          this.isMerging = false;
        }
      }

      //3. create merged backup from db
      const updatedConversations = await DB.getConversations();
      const updatedMessages = await DB.getAllMessagesAllConversations();
      const tombstones = await DB.getTombstones();

      const newBackup: BackupData = {
        version: 2,
        settings: Settings.getCached(),
        settingsUpdatedAt: await Settings.getSettingsUpdatedAt(),
        conversations: updatedConversations,
        messages: updatedMessages,
        tombstones,
      };

      //4. nothing moved, no transfer needed
      const { json, blobs } = await this.packBackup(newBackup);
      const hash = await BackupCryptoImpl.sha256B64(json);
      if (download.status === 'unchanged' && knownState?.hash === hash) {
        await this.setStorageItem(LAST_SYNC_TIME_KEY, Date.now().toString());
        DeviceEventEmitter.emit(AppEvents.syncCompleted);
        return { success: true };
      }

      //5. compress, encrypt and upload
      const encryptedToUpload = await this.encrypt(json, blobs, pin);
      const upload = await provider.uploadFile(SYNC_FILE_NAME, encryptedToUpload);

      if (!upload.ok) {
        await this.setRemoteState(null);
        return { success: false, error: 'Failed to upload sync data to cloud.', retryable: true };
      }

      //no tag means redownload next sync
      await this.setRemoteState(upload.tag ? { tag: upload.tag, hash } : null);
      await this.setStorageItem(LAST_SYNC_TIME_KEY, Date.now().toString());
      await this.setStorageItem(LAST_SYNC_SIZE_KEY, encryptedToUpload.length.toString());
      DeviceEventEmitter.emit(AppEvents.syncCompleted);
      return { success: true };
    } catch (e) {
      console.error('Sync failed:', e);
      return { success: false, error: String(e), retryable: true };
    }
  }

  private async mergeCloudIntoLocal(cloudBackup: BackupData): Promise<void> {
    //merge settings (last-write-wins, exclude device specific)
    const localSettingsUpdatedAt = await Settings.getSettingsUpdatedAt();
    const cloudSettingsUpdatedAt = cloudBackup.settingsUpdatedAt ?? 0;
    let mergedSettingsUpdatedAt = localSettingsUpdatedAt;
    if (cloudSettingsUpdatedAt >= localSettingsUpdatedAt) {
      const mergedSettings: Partial<AppSettings> = {
        language: cloudBackup.settings.language,
        theme: cloudBackup.settings.theme,
        instruction: cloudBackup.settings.instruction,
        name: cloudBackup.settings.name,
        includeDateTime: cloudBackup.settings.includeDateTime,
        useAppContext: cloudBackup.settings.useAppContext,
        hasSeenOnboarding: cloudBackup.settings.hasSeenOnboarding,
      };
      //account-level links stay on device
      //legacy backup may lack this key
      if (typeof cloudBackup.settings.mcpServers === 'string') {
        mergedSettings.mcpServers = cloudBackup.settings.mcpServers;
      }
      await Settings.applyCloudSettings(mergedSettings);
      mergedSettingsUpdatedAt = cloudSettingsUpdatedAt;
    }
    await Settings.setSettingsUpdatedAt(mergedSettingsUpdatedAt);

    //load local state
    const localConversations = await DB.getConversations();
    const localMessages = await DB.getAllMessagesAllConversations();

    //union local + cloud tombstones (keep newest deletedAt per item)
    const localTombstones = await DB.getTombstones();
    const cloudTombstones = cloudBackup.tombstones ?? [];
    const mergedTombstones = this.unionTombstones(localTombstones, cloudTombstones);
    const tombByKey = new Map(mergedTombstones.map(t => [t.kind + ':' + t.id, t]));

    const localConvsMap = new Map<string, Conversation>();
    localConversations.forEach(c => localConvsMap.set(c.id, c));
    const localMsgsByConv = new Map<string, Message[]>();
    for (const m of localMessages) {
      if (!localMsgsByConv.has(m.conversationId)) localMsgsByConv.set(m.conversationId, []);
      localMsgsByConv.get(m.conversationId)!.push(m);
    }
    const cloudMsgsByConv = new Map<string, Message[]>();
    for (const m of cloudBackup.messages) {
      if (!cloudMsgsByConv.has(m.conversationId)) cloudMsgsByConv.set(m.conversationId, []);
      cloudMsgsByConv.get(m.conversationId)!.push(m);
    }

    //apply tombstones to local data
    for (const conv of localConversations) {
      const t = tombByKey.get('conversation:' + conv.id);
      if (t && t.deletedAt >= conv.updatedAt) {
        await DB.deleteConversation(conv.id, { recordTombstone: false });
        localConvsMap.delete(conv.id);
        localMsgsByConv.delete(conv.id);
      }
    }
    for (const msg of localMessages) {
      const t = tombByKey.get('message:' + msg.id);
      if (t && t.deletedAt >= msg.createdAt) {
        await DB.deleteMessage(msg.id, { recordTombstone: false });
      }
    }

    //merge cloud conversations into local
    for (const cloudConv of cloudBackup.conversations) {
      const tomb = tombByKey.get('conversation:' + cloudConv.id);
      if (tomb && tomb.deletedAt >= cloudConv.updatedAt) continue; //deleted more recently

      const cloudMsgs = cloudMsgsByConv.get(cloudConv.id) ?? [];
      const localConv = localConvsMap.get(cloudConv.id);

      if (!localConv) {
        //fresh conversation from cloud
        const msgs = cloudMsgs.filter(m => {
          const mt = tombByKey.get('message:' + m.id);
          return !(mt && mt.deletedAt >= m.createdAt);
        });
        await DB.replaceConversationWithMessages(cloudConv, msgs);
        continue;
      }

      //both exist -> union messages, last-write-wins on conflicts
      const cloudNewer = cloudConv.updatedAt > localConv.updatedAt;
      const mergedMsgs = this.unionMessages(
        localMsgsByConv.get(cloudConv.id) ?? [],
        cloudMsgs,
        cloudNewer
      );
      const finalMsgs = mergedMsgs.filter(m => {
        const mt = tombByKey.get('message:' + m.id);
        return !(mt && mt.deletedAt >= m.createdAt);
      });

      const mergedConv: Conversation = {
        ...(cloudNewer ? cloudConv : localConv),
        updatedAt: Math.max(cloudConv.updatedAt, localConv.updatedAt),
      };

      const localMsgs = localMsgsByConv.get(cloudConv.id) ?? [];
      const localMsgMap = new Map(localMsgs.map(m => [m.id, m]));
      const changed =
        mergedConv.updatedAt !== localConv.updatedAt ||
        mergedConv.name !== localConv.name ||
        mergedConv.model !== localConv.model ||
        (mergedConv.pinned ?? 0) !== (localConv.pinned ?? 0) ||
        finalMsgs.length !== localMsgs.length ||
        finalMsgs.some(m => {
          const lm = localMsgMap.get(m.id);
          if (!lm) return true;
          return lm.content !== m.content ||
            lm.role !== m.role ||
            JSON.stringify(lm.images) !== JSON.stringify(m.images);
        });

      if (changed) {
        await DB.replaceConversationWithMessages(mergedConv, finalMsgs);
      }
    }

    //persist merged tombstones (keep any newer recorded during deletes above)
    const freshTombstones = await DB.getTombstones();
    await DB.setTombstones(this.unionTombstones(mergedTombstones, freshTombstones));
  }

  private unionTombstones(a: SyncTombstone[], b: SyncTombstone[]): SyncTombstone[] {
    const map = new Map<string, SyncTombstone>();
    for (const t of [...a, ...b]) {
      const key = t.kind + ':' + t.id;
      const cur = map.get(key);
      if (!cur || t.deletedAt > cur.deletedAt) map.set(key, t);
    }
    return Array.from(map.values());
  }

  private unionMessages(localMsgs: Message[], cloudMsgs: Message[], cloudWins: boolean): Message[] {
    const map = new Map<string, Message>();
    for (const m of cloudMsgs) map.set(m.id, m);
    for (const m of localMsgs) {
      const existing = map.get(m.id);
      if (!existing) map.set(m.id, m);
      else if (!cloudWins) map.set(m.id, m); //local wins conflicts
    }
    return Array.from(map.values());
  }
}

export const CloudSync = new CloudSyncServiceImpl();
