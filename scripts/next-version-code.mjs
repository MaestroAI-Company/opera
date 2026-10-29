//next versionCode above every play upload

import { createSign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const appJsonPath = join(root, 'app.json');
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/ai.maestro.opera';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const account = JSON.parse(process.env.PLAY_SERVICE_ACCOUNT_JSON);

//jwt grant for a play token
async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: TOKEN_URL,
    iat: now,
    exp: now + 600,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key).toString('base64url');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });
  if (!res.ok) throw new Error(`play token request failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

const token = await accessToken();

async function call(method, path) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: method === 'POST' ? '{}' : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status} ${await res.text()}`);
  return method === 'DELETE' ? null : res.json();
}

//play reads only through an edit
const { id } = await call('POST', '/edits');
let codes;
try {
  const { bundles = [] } = await call('GET', `/edits/${id}/bundles`);
  const { apks = [] } = await call('GET', `/edits/${id}/apks`);
  const { tracks = [] } = await call('GET', `/edits/${id}/tracks`);
  codes = [
    ...bundles.map(b => b.versionCode),
    ...apks.map(a => a.versionCode),
    ...tracks.flatMap(t => (t.releases ?? []).flatMap(r => r.versionCodes ?? [])),
  ].map(Number);
} finally {
  await call('DELETE', `/edits/${id}`);
}

//a manual app.json bump still wins
const appJson = readFileSync(appJsonPath, 'utf8');
const current = JSON.parse(appJson).expo.android.versionCode ?? 1;
const next = Math.max(current, ...codes.map(code => code + 1));

//regex keeps the app.json formatting
writeFileSync(appJsonPath, appJson.replace(/("versionCode":\s*)\d+/, `$1${next}`));
console.log(`versionCode ${next}, play has up to ${Math.max(0, ...codes)}`);
