//pins the hub client release for android and web

import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ASSETS = [
  'opera-hub-client-arm64-v8a.so',
  'opera_hub_client.kt',
  'opera-hub-client-web.js',
  'opera-hub-client-web.wasm',
];

const version = process.argv[2];
if (!/^v\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('usage: node scripts/pin-hub-client.mjs v0.2.0');
  process.exit(1);
}

const url = `https://github.com/MaestroAI-Company/opera-hub/releases/download/${version}/SHA256SUMS`;
const response = await fetch(url);
if (!response.ok) throw new Error(`cannot download ${url}: ${response.status}`);

//sha256sum lines are hash then file
const sums = Object.fromEntries(
  (await response.text())
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+\*?/).reverse()),
);
const sha256 = Object.fromEntries(ASSETS.map((asset) => [asset, sums[asset]]));
const missing = ASSETS.filter((asset) => !sha256[asset]);
if (missing.length) throw new Error(`${version} has no ${missing.join(', ')}`);

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
writeFileSync(join(root, 'opera-hub-client.json'), JSON.stringify({ version, sha256 }, null, 2) + '\n');
console.log(`pinned opera hub client ${version}`);
