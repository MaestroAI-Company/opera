import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { arrayBufferToBase64 } from '../ai/utils/base64';
import { universalFetch } from '../ai/utils/universalFetch';
import { utf8Decode } from '../crypto/encoding';
import { CloudDownload, CloudProvider, CloudUpload, CloudUserInfo } from './CloudProvider';

const SERVER_URL_KEY = 'nextcloud_server_url';
const USERNAME_KEY = 'nextcloud_username';
const PASSWORD_KEY = 'nextcloud_app_password';

//sync files live in their own folder
const REMOTE_FOLDER = 'Opera';

//names the app password created on the server
const APP_NAME = 'Opera';
const POLL_INTERVAL_MS = 3000;
const LOGIN_TIMEOUT_MS = 3 * 60 * 1000;

export type NextcloudConfig = {
  serverUrl: string;
  username: string;
  password: string;
};

async function setStorageItem(key: string, value: string | null) {
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

async function getStorageItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key) || null;
  }
  return await SecureStore.getItemAsync(key);
}

//defaults to https and drops the trailing slash
function normalizeServerUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export async function loadNextcloudConfig(): Promise<NextcloudConfig | null> {
  const serverUrl = await getStorageItem(SERVER_URL_KEY);
  const username = await getStorageItem(USERNAME_KEY);
  const password = await getStorageItem(PASSWORD_KEY);
  if (!serverUrl || !username || !password) return null;
  return { serverUrl, username, password };
}

async function saveNextcloudConfig(config: NextcloudConfig | null): Promise<void> {
  await setStorageItem(SERVER_URL_KEY, config ? normalizeServerUrl(config.serverUrl) : null);
  await setStorageItem(USERNAME_KEY, config?.username.trim() || null);
  await setStorageItem(PASSWORD_KEY, config?.password || null);
}

type LoginFlowPoll = { token: string; endpoint: string };

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function openLoginPage(url: string): Promise<void> {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  if (isTauri) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
    return;
  }
  //resolves only once the user closes the browser, so polling must not wait on it
  WebBrowser.openBrowserAsync(url).catch(e => console.warn('Could not open the login page:', e));
}

//leaves the login page once the app password lands, never fails the login
async function returnToApp(): Promise<void> {
  try {
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    if (isTauri) {
      //login happened in the system browser, raise our window back over it
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setFocus();
    } else if (Platform.OS === 'ios') {
      await WebBrowser.dismissBrowser();
    } else if (Platform.OS === 'android') {
      //custom tabs cannot be closed, our own deep link pulls the app back to front
      await Linking.openURL(Linking.createURL('/'));
    }
  } catch (e) {
    console.warn('Could not bring the app back to the front:', e);
  }
}

async function pollForCredentials(poll: LoginFlowPoll, isCancelled: () => boolean): Promise<NextcloudConfig | null> {
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (isCancelled()) return null;
    await delay(POLL_INTERVAL_MS);

    const response = await universalFetch(poll.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `token=${encodeURIComponent(poll.token)}`,
    });

    //404 until the login is confirmed in the browser
    if (response.status === 404) continue;
    if (!response.ok) return null;

    const data = await response.json();
    if (!data?.server || !data?.loginName || !data?.appPassword) return null;
    return { serverUrl: data.server, username: data.loginName, password: data.appPassword };
  }
  return null;
}

//login flow v2, grants an app password without the user creating one
export async function runNextcloudLoginFlow(
  serverUrl: string,
  isCancelled: () => boolean = () => false
): Promise<boolean> {
  const server = normalizeServerUrl(serverUrl);
  if (!server) return false;

  //a real browser puts user-agent in the preflight, which the server would have to allow
  const isBrowser = Platform.OS === 'web' && !('__TAURI_INTERNALS__' in window);

  try {
    const response = await universalFetch(`${server}/index.php/login/v2`, {
      method: 'POST',
      ...(isBrowser ? {} : { headers: { 'User-Agent': APP_NAME } }),
    });
    if (!response.ok) return false;

    const init = await response.json();
    if (!init?.poll?.token || !init?.poll?.endpoint || !init?.login) return false;

    await openLoginPage(init.login);

    const credentials = await pollForCredentials(init.poll, isCancelled);
    if (!credentials) return false;

    await saveNextcloudConfig(credentials);
    await returnToApp();
    return true;
  } catch (e) {
    console.error('Nextcloud login flow failed:', e);
    return false;
  }
}

export class NextcloudProvider implements CloudProvider {
  private config: NextcloudConfig | null = null;

  getId(): string {
    return 'nextcloud';
  }

  async isConfigured(): Promise<boolean> {
    return (await loadNextcloudConfig()) !== null;
  }

  async authenticate(): Promise<boolean> {
    const config = await loadNextcloudConfig();
    if (!config) return false;
    this.config = config;
    //reading the account validates credentials and reachability
    return (await this.getUserInfo()) !== null;
  }

  async logout(): Promise<void> {
    this.config = null;
    await saveNextcloudConfig(null);
  }

  async getUserInfo(): Promise<CloudUserInfo | null> {
    const config = await this.getConfig();
    if (!config) return null;

    try {
      const response = await universalFetch(`${config.serverUrl}/ocs/v2.php/cloud/user?format=json`, {
        method: 'GET',
        headers: {
          ...this.authHeader(config),
          'OCS-APIRequest': 'true',
          Accept: 'application/json',
        },
      });
      if (!response.ok) return null;

      const data = await response.json();
      const user = data?.ocs?.data;
      if (!user) return null;
      return {
        email: user.email || config.username,
        name: user['display-name'] || user.displayname || config.username,
        picture: await this.fetchAvatar(config),
      };
    } catch (e) {
      console.error('Failed to get Nextcloud user info:', e);
      return null;
    }
  }

  //image loaders can't send basic auth, so inline the avatar
  private async fetchAvatar(config: NextcloudConfig): Promise<string | undefined> {
    try {
      const response = await universalFetch(`${config.serverUrl}/avatar/${encodeURIComponent(config.username)}/128`, {
        method: 'GET',
        headers: this.authHeader(config),
      });
      if (!response.ok) return undefined;

      const contentType = response.headers.get('content-type') || 'image/png';
      //servers without an avatar answer with json
      if (!contentType.startsWith('image/')) return undefined;

      const bytes = await response.arrayBuffer();
      return `data:${contentType};base64,${arrayBufferToBase64(bytes)}`;
    } catch (e) {
      console.warn('Could not load the Nextcloud avatar:', e);
      return undefined;
    }
  }

  async uploadFile(filename: string, content: string): Promise<CloudUpload> {
    const config = await this.getConfig();
    if (!config) return { ok: false, tag: null };

    try {
      let response = await this.dav(config, 'PUT', this.fileUrl(config, filename), content);
      //missing parent folder, create it and retry
      if (response.status === 404 || response.status === 409) {
        await this.createFolder(config);
        response = await this.dav(config, 'PUT', this.fileUrl(config, filename), content);
      }
      if (!response.ok) return { ok: false, tag: null };
      return { ok: true, tag: response.headers.get('etag') };
    } catch (e) {
      console.error('Failed to upload file:', e);
      return { ok: false, tag: null };
    }
  }

  async downloadFile(filename: string, knownTag?: string | null): Promise<CloudDownload> {
    const config = await this.getConfig();
    if (!config) return { status: 'error' };

    try {
      const response = await this.dav(
        config,
        'GET',
        this.fileUrl(config, filename),
        undefined,
        knownTag ? { 'If-None-Match': knownTag } : undefined
      );
      if (response.status === 304) return { status: 'unchanged' };
      if (response.status === 404) return { status: 'missing' };
      if (!response.ok) return { status: 'error' };
      return { status: 'ok', content: utf8Decode(new Uint8Array(await response.arrayBuffer())), tag: response.headers.get('etag') };
    } catch (e) {
      console.error('Failed to download file:', e);
      return { status: 'error' };
    }
  }

  async deleteFile(filename: string): Promise<boolean> {
    const config = await this.getConfig();
    if (!config) return false;

    try {
      const response = await this.dav(config, 'DELETE', this.fileUrl(config, filename));
      if (response.status === 404) return true; //already deleted
      return response.ok;
    } catch (e) {
      console.error('Failed to delete file:', e);
      return false;
    }
  }

  private async getConfig(): Promise<NextcloudConfig | null> {
    if (!this.config) {
      this.config = await loadNextcloudConfig();
    }
    return this.config;
  }

  private authHeader(config: NextcloudConfig): Record<string, string> {
    const credentials = new TextEncoder().encode(`${config.username}:${config.password}`);
    return { Authorization: `Basic ${arrayBufferToBase64(credentials.buffer as ArrayBuffer)}` };
  }

  private folderUrl(config: NextcloudConfig): string {
    return `${config.serverUrl}/remote.php/dav/files/${encodeURIComponent(config.username)}/${REMOTE_FOLDER}`;
  }

  private fileUrl(config: NextcloudConfig, filename: string): string {
    return `${this.folderUrl(config)}/${encodeURIComponent(filename)}`;
  }

  private dav(
    config: NextcloudConfig,
    method: string,
    url: string,
    body?: string,
    extraHeaders?: Record<string, string>
  ): Promise<Response> {
    return universalFetch(url, {
      method,
      headers: {
        ...this.authHeader(config),
        ...(body !== undefined ? { 'Content-Type': 'text/plain' } : {}),
        ...extraHeaders,
      },
      ...(body !== undefined ? { body } : {}),
    });
  }

  private async createFolder(config: NextcloudConfig): Promise<void> {
    //405 means the folder is already there
    await this.dav(config, 'MKCOL', this.folderUrl(config));
  }
}
