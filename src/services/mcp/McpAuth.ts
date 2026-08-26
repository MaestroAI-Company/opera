import * as AuthSession from 'expo-auth-session';
import { Platform } from 'react-native';
import { universalFetch } from '../ai/utils/universalFetch';
import { getSecret, setSecret } from './mcpStorage';

const CLIENT_NAME = 'Opera';
//distinct from the drive loopback port so both flows can be armed
const OAUTH_LOOPBACK_PORT = 46358;
const REDIRECT_PATH = 'oauth2redirect/mcp';
const PENDING_KEY = 'mcp_pending_auth';

//authorization server endpoints resolved once and cached per server
export interface AuthServerMeta {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
  scope?: string;
}

interface PendingAuth {
  serverId: string;
  verifier: string;
  state: string;
  clientId: string;
  redirectUri: string;
  resource: string;
  meta: AuthServerMeta;
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

//token endpoints reject urls with a fragment or query
export function canonicalResource(url: string): string {
  const u = new URL(url);
  u.hash = '';
  u.search = '';
  return u.toString().replace(/\/$/, '');
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

//manual pkce for the paths that cannot use expo's AuthRequest
async function createPkce(): Promise<{ verifier: string; challenge: string }> {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const verifier = base64url(random);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await universalFetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

//rfc 9728 puts the well-known segment before the resource path
function protectedResourceUrls(serverUrl: string): string[] {
  const u = new URL(serverUrl);
  const path = u.pathname.replace(/\/$/, '');
  const urls = [`${u.origin}/.well-known/oauth-protected-resource${path}`];
  if (path) urls.push(`${u.origin}/.well-known/oauth-protected-resource`);
  return urls;
}

//try the path-aware forms first, then the plain issuer forms
function authServerMetadataUrls(issuer: string): string[] {
  const u = new URL(issuer);
  const path = u.pathname.replace(/\/$/, '');
  const urls: string[] = [];
  if (path) {
    urls.push(`${u.origin}/.well-known/oauth-authorization-server${path}`);
    urls.push(`${u.origin}/.well-known/openid-configuration${path}`);
    urls.push(`${u.origin}${path}/.well-known/openid-configuration`);
  }
  urls.push(`${u.origin}/.well-known/oauth-authorization-server`);
  urls.push(`${u.origin}/.well-known/openid-configuration`);
  return urls;
}

//pull resource_metadata out of a 401 challenge
export function parseResourceMetadataUrl(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/resource_metadata\s*=\s*"([^"]+)"/i);
  return match ? match[1] : null;
}

class McpAuthService {
  //resolve where to authorize, from the 401 challenge or the well-known fallback
  async discover(serverUrl: string, challenge: string | null): Promise<AuthServerMeta> {
    const candidates = [
      ...(parseResourceMetadataUrl(challenge) ? [parseResourceMetadataUrl(challenge)!] : []),
      ...protectedResourceUrls(serverUrl),
    ];

    let issuer: string | null = null;
    let scope: string | undefined;
    for (const url of candidates) {
      const doc = await fetchJson(url);
      const found = doc?.authorization_servers?.[0];
      if (typeof found === 'string') {
        issuer = found;
        scope = Array.isArray(doc.scopes_supported) ? doc.scopes_supported.join(' ') : undefined;
        break;
      }
    }

    //some servers skip the resource metadata and host the auth server themselves
    if (!issuer) issuer = new URL(serverUrl).origin;

    for (const url of authServerMetadataUrls(issuer)) {
      const doc = await fetchJson(url);
      if (!doc?.authorization_endpoint || !doc?.token_endpoint) continue;
      const methods: string[] = doc.code_challenge_methods_supported ?? [];
      //the spec forbids proceeding without proven s256 support
      if (!methods.includes('S256')) {
        throw new Error('This server\'s authorization server does not advertise PKCE (S256).');
      }
      return {
        authorizationEndpoint: doc.authorization_endpoint,
        tokenEndpoint: doc.token_endpoint,
        registrationEndpoint: doc.registration_endpoint,
        scope,
      };
    }

    throw new Error('No OAuth authorization server found for this MCP server.');
  }

  private redirectUri(): string {
    if (Platform.OS === 'web') {
      return isTauri()
        ? `http://localhost:${OAUTH_LOOPBACK_PORT}/${REDIRECT_PATH}`
        : AuthSession.makeRedirectUri({ preferLocalhost: true, path: REDIRECT_PATH });
    }
    return AuthSession.makeRedirectUri({ scheme: 'opera', path: REDIRECT_PATH });
  }

  //a configured id wins, then a previous registration, then a fresh one
  private async getClientId(
    serverId: string,
    meta: AuthServerMeta,
    redirectUri: string,
    configuredId?: string,
  ): Promise<string> {
    if (configuredId?.trim()) return configuredId.trim();

    const stored = await getSecret(`${serverId}_client`);
    if (stored) return stored;

    if (!meta.registrationEndpoint) {
      throw new Error(
        'This server does not register apps automatically. Under Advanced, add a token header, or enter the client ID of an OAuth app you registered yourself.',
      );
    }

    const res = await universalFetch(meta.registrationEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: CLIENT_NAME,
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        ...(meta.scope ? { scope: meta.scope } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Client registration failed (${res.status}).`);

    const doc = await res.json();
    if (!doc?.client_id) throw new Error('Client registration returned no client_id.');
    await setSecret(`${serverId}_client`, doc.client_id);
    return doc.client_id;
  }

  private buildAuthUrl(meta: AuthServerMeta, params: {
    clientId: string; redirectUri: string; challenge: string; state: string; resource: string;
  }): string {
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: params.clientId,
      redirect_uri: params.redirectUri,
      code_challenge: params.challenge,
      code_challenge_method: 'S256',
      state: params.state,
      resource: params.resource,
    });
    if (meta.scope) query.set('scope', meta.scope);
    return `${meta.authorizationEndpoint}?${query.toString()}`;
  }

  private async exchange(
    serverId: string,
    meta: AuthServerMeta,
    body: Record<string, string>,
  ): Promise<boolean> {
    const res = await universalFetch(meta.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(body).toString(),
    });
    if (!res.ok) return false;

    const doc = await res.json();
    if (!doc?.access_token) return false;

    await setSecret(`${serverId}_access`, doc.access_token);
    await setSecret(`${serverId}_expiry`, String(Date.now() + (doc.expires_in ?? 3600) * 1000));
    if (doc.refresh_token) await setSecret(`${serverId}_refresh`, doc.refresh_token);
    await setSecret(`${serverId}_meta`, JSON.stringify(meta));
    return true;
  }

  //full authorization code + pkce flow, routed per platform
  async authorize(
    serverId: string,
    serverUrl: string,
    challenge: string | null,
    configuredClientId?: string,
  ): Promise<boolean> {
    const meta = await this.discover(serverUrl, challenge);
    const redirectUri = this.redirectUri();
    const clientId = await this.getClientId(serverId, meta, redirectUri, configuredClientId);
    const resource = canonicalResource(serverUrl);

    if (Platform.OS !== 'web') {
      return this.authorizeNative(serverId, meta, clientId, redirectUri, resource);
    }
    if (isTauri()) {
      return this.authorizeLoopback(serverId, meta, clientId, redirectUri, resource);
    }
    return this.authorizeBrowser(serverId, meta, clientId, redirectUri, resource);
  }

  //ios and android: system browser sheet, exchange inline
  private async authorizeNative(
    serverId: string, meta: AuthServerMeta, clientId: string, redirectUri: string, resource: string,
  ): Promise<boolean> {
    const request = new AuthSession.AuthRequest({
      clientId,
      redirectUri,
      scopes: meta.scope ? meta.scope.split(' ') : [],
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: { resource },
    });

    const result = await request.promptAsync({ authorizationEndpoint: meta.authorizationEndpoint });
    if (result.type !== 'success' || !result.params.code) return false;

    return this.exchange(serverId, meta, {
      grant_type: 'authorization_code',
      code: result.params.code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: request.codeVerifier ?? '',
      resource,
    });
  }

  //tauri: popups are blocked, so listen on a loopback port and open the default browser
  private async authorizeLoopback(
    serverId: string, meta: AuthServerMeta, clientId: string, redirectUri: string, resource: string,
  ): Promise<boolean> {
    const oauth = await import('@fabianlars/tauri-plugin-oauth');
    const { openUrl } = await import('@tauri-apps/plugin-opener');

    const { verifier, challenge } = await createPkce();
    const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
    const port = await oauth.start({ ports: [OAUTH_LOOPBACK_PORT] });

    const callbackUrl = await new Promise<string>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        oauth.cancel(port).catch(() => { });
        reject(new Error('OAuth timed out'));
      }, 3 * 60 * 1000);

      oauth.onUrl((url) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        oauth.cancel(port).catch(() => { });
        resolve(url);
      }).catch((e) => {
        clearTimeout(timeout);
        reject(e);
      });

      openUrl(this.buildAuthUrl(meta, { clientId, redirectUri, challenge, state, resource }));
    });

    const params = new URL(callbackUrl).searchParams;
    if (params.get('state') !== state) return false;
    const code = params.get('code');
    if (!code) return false;

    return this.exchange(serverId, meta, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
      resource,
    });
  }

  //browser: full page redirect, the flow resumes in the oauth2redirect route
  private async authorizeBrowser(
    serverId: string, meta: AuthServerMeta, clientId: string, redirectUri: string, resource: string,
  ): Promise<boolean> {
    const { verifier, challenge } = await createPkce();
    const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
    const pending: PendingAuth = { serverId, verifier, state, clientId, redirectUri, resource, meta };
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));

    window.location.href = this.buildAuthUrl(meta, { clientId, redirectUri, challenge, state, resource });
    //navigation is underway, never resolves
    return new Promise<boolean>(() => { });
  }

  //called by the redirect route to finish the browser flow
  async completeBrowserRedirect(query: URLSearchParams): Promise<string | null> {
    const raw = localStorage.getItem(PENDING_KEY);
    localStorage.removeItem(PENDING_KEY);
    if (!raw) return null;

    const pending: PendingAuth = JSON.parse(raw);
    const code = query.get('code');
    if (!code || query.get('state') !== pending.state) return null;

    const ok = await this.exchange(pending.serverId, pending.meta, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: pending.redirectUri,
      client_id: pending.clientId,
      code_verifier: pending.verifier,
      resource: pending.resource,
    });
    return ok ? pending.serverId : null;
  }

  //valid bearer token, refreshed when expired, null when the user must authorize
  async getAccessToken(serverId: string): Promise<string | null> {
    const token = await getSecret(`${serverId}_access`);
    const expiry = parseInt((await getSecret(`${serverId}_expiry`)) ?? '0', 10);
    //renew slightly early so a slow request does not race the expiry
    if (token && Date.now() < expiry - 60_000) return token;

    const refresh = await getSecret(`${serverId}_refresh`);
    const rawMeta = await getSecret(`${serverId}_meta`);
    const clientId = await getSecret(`${serverId}_client`);
    if (!refresh || !rawMeta || !clientId) return token;

    try {
      const meta: AuthServerMeta = JSON.parse(rawMeta);
      const ok = await this.exchange(serverId, meta, {
        grant_type: 'refresh_token',
        refresh_token: refresh,
        client_id: clientId,
      });
      if (ok) return await getSecret(`${serverId}_access`);
    } catch (e) {
      console.warn('[McpAuth] refresh failed:', e);
    }
    return null;
  }

  async hasSession(serverId: string): Promise<boolean> {
    return !!(await getSecret(`${serverId}_access`));
  }

  //drop every secret tied to a server
  async forget(serverId: string): Promise<void> {
    for (const suffix of ['access', 'refresh', 'expiry', 'client', 'meta', 'header']) {
      await setSecret(`${serverId}_${suffix}`, null);
    }
  }
}

export const McpAuth = new McpAuthService();
