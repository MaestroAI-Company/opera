import 'react-native-get-random-values';
import { BackupCryptoImpl } from './crypto/backupCrypto';
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
const SEEN_AUTHENTICATED_KEY = 'cloud_sync_seen_v3';

//v3 authenticates v2 stays readable
const ENC_VERSION = 3;
const LEGACY_ENC_VERSION = 2;
const PBKDF2_ITERATIONS = 50000;
const AES_KEY_BYTES = 32;
const IV_BYTES = 16;
const SALT_BYTES = 16;

type SyncOutcome = { success: boolean; error?: string };

//separate keys from one pbkdf2 pass
type DerivedKeys = {
  //v2 raw key opens legacy files
  legacyKey: string;
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
  //blocks v2 once authenticated seen
  private hasSeenAuthenticatedBackup = false;

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

    await this.loadAuthenticatedBackupFlag();

    const providerName = await this.getStorageItem(CLOUD_PROVIDER_KEY);
    const savedPin = await this.getStorageItem(SYNC_PIN_KEY);
    if (savedPin) {
      this.pin = savedPin;
    }

    if (providerName && providerName !== 'none') {
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
    if (!this.provider || !this.pin) return;
    
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
      if (this.provider) {
        await this.provider.logout();
      }
      this.provider = null;
      this.keyCache.clear();
      this.lastSaltB64 = null;
      await this.setStorageItem(CLOUD_PROVIDER_KEY, null);
      await this.setStorageItem(LAST_SYNC_SIZE_KEY, null);
      await this.clearPin();
      return true;
    }

    const def = getCloudProviderDefinition(providerName);
    if (!def) return false;

    const newProvider = def.create();
    const success = await newProvider.authenticate(true);
    if (success) {
      this.provider = newProvider;
      await this.setStorageItem(CLOUD_PROVIDER_KEY, providerName);
      return true;
    }
    return false;
  }

  getProviderName(): string {
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
    await this.setStorageItem(SYNC_PIN_KEY, pin);
  }

  hasPin(): boolean {
    return !!this.pin;
  }

  async hasCloudBackup(): Promise<boolean> {
    if (!this.provider) return false;
    try {
      const data = await this.provider.downloadFile(SYNC_FILE_NAME);
      return data !== null;
    } catch (e) {
      console.warn('Could not check for a cloud backup:', e);
      return false;
    }
  }

  async verifyAndSetPin(pin: string): Promise<boolean> {
    if (!this.provider) return false;
    try {
      const data = await this.provider.downloadFile(SYNC_FILE_NAME);
      if (!data) return false;

      const decrypted = await this.decrypt(data, pin);
      if (decrypted) {
        //decrypt already validated json
        await this.setPin(pin);
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

  //flag must survive restarts
  private async loadAuthenticatedBackupFlag(): Promise<void> {
    this.hasSeenAuthenticatedBackup = (await this.getStorageItem(SEEN_AUTHENTICATED_KEY)) === 'true';
  }

  private rememberAuthenticatedBackup(): void {
    if (this.hasSeenAuthenticatedBackup) return;
    this.hasSeenAuthenticatedBackup = true;
    this.setStorageItem(SEEN_AUTHENTICATED_KEY, 'true').catch((e) =>
      console.warn('Could not persist the authenticated-backup flag:', e)
    );
  }

  private async clearPin(): Promise<void> {
    this.pin = null;
    this.keyCache.clear();
    this.lastSaltB64 = null;
    await this.setStorageItem(SYNC_PIN_KEY, null);
  }

  //one pbkdf2 pass expands into subkeys
  private async deriveKeys(pin: string, saltB64: string, iterations: number): Promise<DerivedKeys> {
    //pin hidden from map keys
    const cacheKey = await BackupCryptoImpl.sha256B64(`${pin}:${iterations}:${saltB64}`);
    let keys = this.keyCache.get(cacheKey);
    if (!keys) {
      const master = await BackupCryptoImpl.pbkdf2Sha256B64(pin, saltB64, iterations, AES_KEY_BYTES);
      keys = {
        legacyKey: master,
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

  private async encrypt(data: string, pin: string): Promise<string> {
    const saltB64 = this.lastSaltB64 ?? (await BackupCryptoImpl.randomBytesB64(SALT_BYTES));
    this.lastSaltB64 = saltB64;
    const keys = await this.deriveKeys(pin, saltB64, PBKDF2_ITERATIONS);
    const ivB64 = await BackupCryptoImpl.randomBytesB64(IV_BYTES);
    const ctB64 = await BackupCryptoImpl.aesCbcEncryptB64(keys.encryptionKey, ivB64, data);
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

  private async decrypt(data: string, pin: string): Promise<string | null> {
    try {
      const env = JSON.parse(data);
      if (!env || env.kdf !== 'pbkdf2-sha256') return null;

      const iterations = typeof env.iter === 'number' ? env.iter : PBKDF2_ITERATIONS;
      const keys = await this.deriveKeys(pin, env.salt, iterations);

      if (env.v === ENC_VERSION) {
        const expectedMac = await this.computeMac(keys.macKey, env.v, iterations, env.salt, env.iv, env.ct);
        if (env.mac !== expectedMac) {
          console.warn('Cloud backup failed its integrity check, refusing to import it');
          return null;
        }
      } else if (env.v === LEGACY_ENC_VERSION) {
        //rejects forged unauthenticated backups
        if (this.hasSeenAuthenticatedBackup) {
          console.warn('Refusing a v2 backup: this account already uses the authenticated format');
          return null;
        }
      } else {
        //written by a newer version
        console.warn(`Unsupported cloud backup version: ${env.v}`);
        return null;
      }

      this.lastSaltB64 = env.salt;
      const aesKey = env.v === LEGACY_ENC_VERSION ? keys.legacyKey : keys.encryptionKey;
      //wrong pin throws padding error
      const decrypted = await BackupCryptoImpl.aesCbcDecryptUtf8(aesKey, env.iv, env.ct);
      if (!decrypted) return null;
      JSON.parse(decrypted); //ensure valid json

      //remember only once payload readable
      if (env.v === ENC_VERSION) {
        this.rememberAuthenticatedBackup();
      }
      return decrypted;
    } catch (e) {
      //caller decides what to report
      console.warn('Could not decrypt cloud payload:', e);
    }
    return null;
  }

  async sync(isBackground = false): Promise<SyncOutcome> {
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
      return await thisSync;
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
      //1. download cloud backup
      const encryptedCloudData = await provider.downloadFile(SYNC_FILE_NAME);
      let cloudBackup: BackupData | null = null;

      if (encryptedCloudData) {
        const decryptedStr = await this.decrypt(encryptedCloudData, pin);
        if (!decryptedStr) {
          //code no longer valid, clear stored pin
          await this.clearPin();
          DeviceEventEmitter.emit(AppEvents.syncPinInvalidated);
          return { success: false, error: 'Invalid PIN. Could not decrypt cloud backup.' };
        }
        try {
          const parsed = JSON.parse(decryptedStr);
          if (!parsed || typeof parsed !== 'object' || !parsed.settings || !Array.isArray(parsed.conversations) || !Array.isArray(parsed.messages)) {
            throw new Error('Invalid backup structure');
          }
          cloudBackup = parsed;
        } catch (e) {
          console.warn('Cloud backup is unreadable:', e);
          return { success: false, error: 'Cloud backup is corrupted or incompatible.' };
        }
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

      //4. encrypt and upload
      const jsonStr = JSON.stringify(newBackup);
      const encryptedToUpload = await this.encrypt(jsonStr, pin);
      const uploadSuccess = await provider.uploadFile(SYNC_FILE_NAME, encryptedToUpload);

      if (!uploadSuccess) {
        return { success: false, error: 'Failed to upload sync data to cloud.' };
      }

      await this.setStorageItem(LAST_SYNC_TIME_KEY, Date.now().toString());
      await this.setStorageItem(LAST_SYNC_SIZE_KEY, encryptedToUpload.length.toString());
      DeviceEventEmitter.emit(AppEvents.syncCompleted);
      return { success: true };
    } catch (e) {
      console.error('Sync failed:', e);
      return { success: false, error: String(e) };
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
