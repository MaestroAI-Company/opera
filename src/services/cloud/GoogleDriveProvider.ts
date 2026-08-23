import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { CloudDownload, CloudProvider, CloudUpload, CloudUserInfo } from './CloudProvider';

const ANDROID_CLIENT_ID = '390321100520-3mi4mkdrdt8ke2nvl3ksbjef000ad5eg.apps.googleusercontent.com';
const IOS_CLIENT_ID = '390321100520-8pkv241s2finuqth4cc9h74ii4ph99af.apps.googleusercontent.com';
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  || '390321100520-82j857htbn2g0i6as2ai8uhiti6aurk1.apps.googleusercontent.com';
const WEB_REDIRECT_URI = process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_URI;

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
//drive lacks etag, checksum stands in
const META_FIELDS = 'id,md5Checksum';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

const ACCESS_TOKEN_KEY = 'gdrive_access_token';
const REFRESH_TOKEN_KEY = 'gdrive_refresh_token';
const TOKEN_EXPIRY_KEY = 'gdrive_token_expiry';

//fixed loopback port, must be registered in google console as authorized redirect uri
const OAUTH_LOOPBACK_PORT = 46357;

//lookup outcome, null when missing
type DriveFileMeta = { id: string; md5Checksum: string | null };

export class GoogleDriveProvider implements CloudProvider {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: number | null = null;
  //saves a lookup query per transfer
  private fileIds = new Map<string, string>();

  getId(): string {
    return 'google_drive';
  }

  private getClientId(): string {
    if (Platform.OS === 'android') return ANDROID_CLIENT_ID;
    if (Platform.OS === 'ios') return IOS_CLIENT_ID;
    return WEB_CLIENT_ID;
  }

  private getRedirectUri(): string {
    if (Platform.OS === 'web') {
      return WEB_REDIRECT_URI
        || AuthSession.makeRedirectUri({ preferLocalhost: true, path: 'oauth2redirect/google' });
    }
    const clientId = this.getClientId();
    const reversedClientId = clientId.split('.').reverse().join('.');
    return `${reversedClientId}:/oauth2redirect/google`;
  }

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

  private currentRequest: AuthSession.AuthRequest | null = null;

  async authenticate(forcePrompt = false): Promise<boolean> {
    try {
      await this.loadTokens();

      if (this.accessToken && !this.isTokenExpired()) {
        return true;
      }

      if (this.refreshToken) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) return true;
      }

      //no usable session, don't show auth ui unless explicitly requested
      if (!forcePrompt) return false;

      const isWeb = Platform.OS === 'web';
      const isTauri = isWeb && typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

      //tauri: open oauth in the default browser via a loopback server
      if (isTauri) {
        return this.authenticateInBrowser(forcePrompt);
      }

      this.currentRequest = new AuthSession.AuthRequest({
        clientId: this.getClientId(),
        redirectUri: this.getRedirectUri(),
        scopes: ['https://www.googleapis.com/auth/drive.appdata', 'email', 'profile'],
        responseType: isWeb ? AuthSession.ResponseType.Token : AuthSession.ResponseType.Code,
        prompt: forcePrompt ? AuthSession.Prompt.SelectAccount : undefined,
        usePKCE: !isWeb,
        extraParams: isWeb ? {} : {
          access_type: 'offline',
        }
      });

      const discovery: AuthSession.DiscoveryDocument = {
        authorizationEndpoint: GOOGLE_AUTH_URL,
        tokenEndpoint: GOOGLE_TOKEN_URL,
      };

      if (isWeb) {
        //full-page redirect on web (popups are blocked in tauri/webviews)
        const authUrl = await this.currentRequest.makeAuthUrlAsync(discovery);
        window.location.href = authUrl;
        return new Promise<boolean>(() => {});
      }

      const result = await this.currentRequest.promptAsync(discovery);

      if (result.type === 'success') {
        if (result.params.code) {
          const exchanged = await this.exchangeCodeForToken(result.params.code, discovery);
          return exchanged;
        } else if (result.params.access_token) {
          //implicit flow (web)
          await this.saveTokens(
            result.params.access_token,
            undefined,
            result.params.expires_in ? parseInt(result.params.expires_in, 10) : 3600
          );
          return true;
        }
      }

      return false;
    } catch (e) {
      console.error('GoogleDriveProvider authenticate error:', e);
      return false;
    }
  }

  private async authenticateInBrowser(forcePrompt: boolean): Promise<boolean> {
    try {
      const oauth = await import('@fabianlars/tauri-plugin-oauth');
      const { openUrl } = await import('@tauri-apps/plugin-opener');

      const port = await oauth.start({ ports: [OAUTH_LOOPBACK_PORT] });
      const redirectUri = `http://localhost:${port}/oauth2redirect/google`;

      const params = new URLSearchParams({
        client_id: this.getClientId(),
        redirect_uri: redirectUri,
        response_type: 'token',
        scope: 'https://www.googleapis.com/auth/drive.appdata email profile',
      });
      if (forcePrompt) params.set('prompt', 'select_account');

      const callbackPromise = new Promise<string>((resolve, reject) => {
        let settled = false;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          oauth.cancel(port).catch(() => {});
          reject(new Error('OAuth timed out'));
        }, 3 * 60 * 1000);

        oauth.onUrl((url) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          oauth.cancel(port).catch(() => {});
          resolve(url);
        }).catch((e) => {
          clearTimeout(timeout);
          reject(e);
        });
      });

      await openUrl(`${GOOGLE_AUTH_URL}?${params.toString()}`);

      const callbackUrl = await callbackPromise;

      const redirect = new URL(callbackUrl);
      const redirectParams = new URLSearchParams(redirect.hash.slice(1));
      const accessToken = redirectParams.get('access_token');
      if (!accessToken) return false;

      const expiresIn = parseInt(redirectParams.get('expires_in') || '3600', 10);
      await this.saveTokens(accessToken, undefined, expiresIn);
      return true;
    } catch (e) {
      console.error('GoogleDriveProvider browser auth error:', e);
      return false;
    }
  }

  async logout(): Promise<void> {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.fileIds.clear();
    await this.setStorageItem(ACCESS_TOKEN_KEY, null);
    await this.setStorageItem(REFRESH_TOKEN_KEY, null);
    await this.setStorageItem(TOKEN_EXPIRY_KEY, null);
  }

  async persistRedirectTokens(accessToken: string, expiresIn: number): Promise<void> {
    await this.saveTokens(accessToken, undefined, expiresIn);
  }

  async getUserInfo(): Promise<CloudUserInfo | null> {
    const token = await this.getValidToken();
    if (!token) return null;

    try {
      const response = await fetch(USERINFO_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return null;
      const data = await response.json();
      return {
        email: data.email,
        name: data.name,
        picture: data.picture,
      };
    } catch (e) {
      console.error('Failed to get user info:', e);
      return null;
    }
  }

  async uploadFile(filename: string, content: string): Promise<CloudUpload> {
    const token = await this.getValidToken();
    if (!token) return { ok: false, tag: null };

    try {
      let existingFileId = this.fileIds.get(filename) ?? null;
      if (!existingFileId) {
        const meta = await this.lookupMeta(filename, token);
        //failed lookup risks duplicate, retry later
        if (meta === 'error') return { ok: false, tag: null };
        existingFileId = meta?.id ?? null;
      }

      let response = await this.putContent(token, filename, content, existingFileId);
      //cached id stale, create again
      if (existingFileId && response.status === 404) {
        this.fileIds.delete(filename);
        response = await this.putContent(token, filename, content, null);
      }
      if (!response.ok) return { ok: false, tag: null };

      const data = await response.json();
      if (data?.id) this.fileIds.set(filename, data.id);
      return { ok: true, tag: data?.md5Checksum ?? null };
    } catch (e) {
      console.error('Failed to upload file:', e);
      return { ok: false, tag: null };
    }
  }

  async downloadFile(filename: string, knownTag?: string | null): Promise<CloudDownload> {
    const token = await this.getValidToken();
    if (!token) return { status: 'error' };

    try {
      const meta = await this.getFileMeta(filename, token);
      if (meta === 'error') return { status: 'error' };
      if (!meta) return { status: 'missing' };
      if (knownTag && meta.md5Checksum === knownTag) return { status: 'unchanged' };

      const response = await fetch(`${DRIVE_FILES_URL}/${meta.id}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 404) {
        this.fileIds.delete(filename);
        return { status: 'missing' };
      }
      if (!response.ok) return { status: 'error' };
      return { status: 'ok', content: await response.text(), tag: meta.md5Checksum };
    } catch (e) {
      console.error('Failed to download file:', e);
      return { status: 'error' };
    }
  }

  async deleteFile(filename: string): Promise<boolean> {
    const token = await this.getValidToken();
    if (!token) return false;

    try {
      const meta = await this.getFileMeta(filename, token);
      if (meta === 'error') return false;
      if (!meta) return true; //already deleted

      const response = await fetch(`${DRIVE_FILES_URL}/${meta.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok && response.status !== 404) return false;
      this.fileIds.delete(filename);
      return true;
    } catch (e) {
      console.error('Failed to delete file:', e);
      return false;
    }
  }

  private putContent(token: string, filename: string, content: string, fileId: string | null): Promise<Response> {
    const boundary = 'foo_bar_baz';
    const metadata = {
      name: filename,
      mimeType: 'text/plain',
      ...(fileId ? {} : { parents: ['appDataFolder'] }),
    };

    const requestBody =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: text/plain\r\n\r\n` +
      `${content}\r\n` +
      `--${boundary}--`;

    const query = `?uploadType=multipart&fields=${META_FIELDS}`;
    return fetch(fileId ? `${DRIVE_UPLOAD_URL}/${fileId}${query}` : `${DRIVE_UPLOAD_URL}${query}`, {
      method: fileId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': requestBody.length.toString(),
      },
      body: requestBody,
    });
  }

  //cached id first, else lookup query
  private async getFileMeta(filename: string, token: string): Promise<DriveFileMeta | null | 'error'> {
    const cachedId = this.fileIds.get(filename);
    if (!cachedId) return this.lookupMeta(filename, token);

    const response = await fetch(`${DRIVE_FILES_URL}/${cachedId}?fields=${META_FIELDS}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 404) {
      this.fileIds.delete(filename);
      return this.lookupMeta(filename, token);
    }
    if (!response.ok) return 'error';

    const data = await response.json();
    return { id: cachedId, md5Checksum: data?.md5Checksum ?? null };
  }

  private async lookupMeta(filename: string, token: string): Promise<DriveFileMeta | null | 'error'> {
    const q = encodeURIComponent(`name = '${filename}' and 'appDataFolder' in parents and trashed = false`);
    const url = `${DRIVE_FILES_URL}?spaces=appDataFolder&q=${q}&fields=files(${META_FIELDS})`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return 'error';

    const data = await response.json();
    const file = data?.files?.[0];
    if (!file?.id) return null;

    this.fileIds.set(filename, file.id);
    return { id: file.id, md5Checksum: file.md5Checksum ?? null };
  }

  private async getValidToken(): Promise<string | null> {
    if (this.accessToken && !this.isTokenExpired()) {
      return this.accessToken;
    }
    if (this.refreshToken) {
      const success = await this.refreshAccessToken();
      if (success) return this.accessToken;
    }
    return null;
  }

  private async exchangeCodeForToken(code: string, discovery: AuthSession.DiscoveryDocument): Promise<boolean> {
    try {
      const tokenResult = await AuthSession.exchangeCodeAsync({
        clientId: this.getClientId(),
        code,
        redirectUri: this.getRedirectUri(),
        extraParams: this.currentRequest?.codeVerifier ? { code_verifier: this.currentRequest.codeVerifier } : undefined,
      }, discovery);
      
      await this.saveTokens(tokenResult.accessToken, tokenResult.refreshToken, tokenResult.expiresIn || 3600);
      return true;
    } catch(e) {
      console.error('Failed to exchange code:', e);
      return false;
    }
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) return false;
    try {
      const discovery: AuthSession.DiscoveryDocument = {
        authorizationEndpoint: GOOGLE_AUTH_URL,
        tokenEndpoint: GOOGLE_TOKEN_URL,
      };
      
      const tokenResult = await AuthSession.refreshAsync({
        clientId: this.getClientId(),
        refreshToken: this.refreshToken,
      }, discovery);
      
      await this.saveTokens(tokenResult.accessToken, tokenResult.refreshToken || this.refreshToken, tokenResult.expiresIn || 3600);
      return true;
    } catch (e) {
      console.error('Failed to refresh token:', e);
      return false;
    }
  }

  private async loadTokens() {
    this.accessToken = await this.getStorageItem(ACCESS_TOKEN_KEY);
    this.refreshToken = await this.getStorageItem(REFRESH_TOKEN_KEY);
    const expiry = await this.getStorageItem(TOKEN_EXPIRY_KEY);
    if (expiry) this.tokenExpiry = parseInt(expiry, 10);
  }

  private async saveTokens(accessToken: string, refreshToken: string | undefined, expiresIn: number) {
    this.accessToken = accessToken;
    if (refreshToken) this.refreshToken = refreshToken;
    this.tokenExpiry = Date.now() + expiresIn * 1000;

    await this.setStorageItem(ACCESS_TOKEN_KEY, this.accessToken);
    await this.setStorageItem(REFRESH_TOKEN_KEY, this.refreshToken ?? null);
    await this.setStorageItem(TOKEN_EXPIRY_KEY, this.tokenExpiry ? this.tokenExpiry.toString() : null);
  }

  private isTokenExpired(): boolean {
    if (!this.tokenExpiry) return true;
    return Date.now() > this.tokenExpiry - 5 * 60 * 1000; //5 min buffer
  }
}
