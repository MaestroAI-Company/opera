//gradle runs it before each android build

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const hubDir = resolve(process.env.OPERA_HUB_DIR ?? join(root, '..', 'opera-hub'));
const mainDir = join(root, 'android', 'app', 'src', 'main');
const libPath = join(mainDir, 'jniLibs', 'arm64-v8a', 'libopera_hub_client.so');
const bindingsDir = join(mainDir, 'java', 'uniffi', 'opera_hub_client');
const RELEASES = 'https://github.com/MaestroAI-Company/opera-hub/releases/download';

const hasSource =
  existsSync(join(hubDir, 'Cargo.toml')) &&
  spawnSync('cargo', ['ndk', '--version'], { stdio: 'ignore' }).status === 0;

if (hasSource) {
  buildFromSource();
} else {
  await downloadPinned();
}

function buildFromSource() {
  const cargo = (args) => execFileSync('cargo', args, { cwd: hubDir, stdio: 'inherit' });

  //arm64 only like the apk
  cargo(['ndk', '-t', 'arm64-v8a', 'build', '--release', '-p', 'opera-hub-client']);

  //stripped lib so read host metadata
  cargo(['build', '-p', 'opera-hub-client']);
  const hostLib = {
    win32: 'opera_hub_client.dll',
    darwin: 'libopera_hub_client.dylib',
  }[process.platform] ?? 'libopera_hub_client.so';

  rmSync(bindingsDir, { recursive: true, force: true });
  cargo([
    'run', '-q', '-p', 'uniffi-bindgen', '--',
    'generate', '--library', join(hubDir, 'target', 'debug', hostLib),
    '--language', 'kotlin', '--no-format',
    '--out-dir', join(mainDir, 'java'),
  ]);

  mkdirSync(dirname(libPath), { recursive: true });
  copyFileSync(join(hubDir, 'target', 'aarch64-linux-android', 'release', 'libopera_hub_client.so'), libPath);
  console.log(`opera hub client built from ${hubDir}`);
}

async function downloadPinned() {
  const pin = JSON.parse(readFileSync(join(root, 'opera-hub-client.json'), 'utf8'));
  const assets = [
    ['opera-hub-client-arm64-v8a.so', libPath],
    ['opera_hub_client.kt', join(bindingsDir, 'opera_hub_client.kt')],
  ];
  for (const [asset, dest] of assets) {
    const expected = pin.sha256[asset];
    //cached while it matches the pin
    if (existsSync(dest) && sha256(readFileSync(dest)) === expected) continue;
    const url = `${RELEASES}/${pin.version}/${asset}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`cannot download ${url}: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (sha256(bytes) !== expected) throw new Error(`checksum mismatch for ${asset} ${pin.version}`);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, bytes);
  }
  console.log(`opera hub client ${pin.version} from the release`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
