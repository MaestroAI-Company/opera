//gradle runs it before each android build, npm before web and desktop

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const hubDir = resolve(process.env.SAMPLER_HUB_DIR ?? join(root, '..', 'Sampler-Hub'));
const mainDir = join(root, 'android', 'app', 'src', 'main');
const libPath = join(mainDir, 'jniLibs', 'arm64-v8a', 'libsampler_hub_client.so');
const bindingsDir = join(mainDir, 'java', 'uniffi', 'sampler_hub_client');
//served as is next to the web bundle
const webDir = join(root, 'public', 'sampler-hub');
//tauri sidecars carry the target triple
const sidecarDir = join(root, 'src-tauri', 'binaries');
const SIDECARS = {
  'win32-x64': ['x86_64-pc-windows-msvc', 'sampler-hubw-windows-x86_64.exe'],
  'darwin-arm64': ['aarch64-apple-darwin', 'sampler-hubw-macos-aarch64'],
  'linux-x64': ['x86_64-unknown-linux-gnu', 'sampler-hubw-linux-x86_64'],
  'linux-arm64': ['aarch64-unknown-linux-gnu', 'sampler-hubw-linux-aarch64'],
};
const RELEASES = 'https://github.com/MaestroAI-Company/Sampler-Hub/releases/download';
//ring needs clang for wasm
const WINDOWS_CLANG = 'C:\\Program Files\\LLVM\\bin';

const target = process.argv[2] ?? 'android';
const works = (command, args) => spawnSync(command, args, { stdio: 'ignore' }).status === 0;
const hasHub = existsSync(join(hubDir, 'Cargo.toml'));

if (target === 'desktop') {
  const sidecar = SIDECARS[`${process.platform}-${process.arch}`];
  if (!sidecar) throw new Error(`no sampler hub build for ${process.platform} ${process.arch}`);
  const [triple, asset] = sidecar;
  const dest = join(sidecarDir, `sampler-hubw-${triple}${process.platform === 'win32' ? '.exe' : ''}`);
  if (hasHub) {
    buildSidecarFromSource(dest);
  } else {
    await downloadPinned([[asset, dest]]);
  }
} else if (target === 'web') {
  if (hasHub && works('wasm-bindgen', ['--version']) && hasClang()) {
    buildWebFromSource();
  } else {
    await downloadPinned([
      ['sampler-hub-client-web.js', join(webDir, 'sampler-hub-client-web.js')],
      ['sampler-hub-client-web.wasm', join(webDir, 'sampler-hub-client-web.wasm')],
    ]);
  }
} else if (hasHub && works('cargo', ['ndk', '--version'])) {
  buildAndroidFromSource();
} else {
  await downloadPinned([
    ['sampler-hub-client-arm64-v8a.so', libPath],
    ['sampler_hub_client.kt', join(bindingsDir, 'sampler_hub_client.kt')],
  ]);
}

function cargo(args, env = process.env) {
  execFileSync('cargo', args, { cwd: hubDir, stdio: 'inherit', env });
}

function hasClang() {
  return works('clang', ['--version']) || existsSync(join(WINDOWS_CLANG, 'clang.exe'));
}

function buildAndroidFromSource() {
  //arm64 only like the apk
  cargo(['ndk', '-t', 'arm64-v8a', 'build', '--release', '-p', 'sampler-hub-client']);

  //stripped lib so read host metadata
  cargo(['build', '-p', 'sampler-hub-client']);
  const hostLib = {
    win32: 'sampler_hub_client.dll',
    darwin: 'libsampler_hub_client.dylib',
  }[process.platform] ?? 'libsampler_hub_client.so';

  rmSync(bindingsDir, { recursive: true, force: true });
  cargo([
    'run', '-q', '-p', 'uniffi-bindgen', '--',
    'generate', '--library', join(hubDir, 'target', 'debug', hostLib),
    '--language', 'kotlin', '--no-format',
    '--out-dir', join(mainDir, 'java'),
  ]);

  mkdirSync(dirname(libPath), { recursive: true });
  copyFileSync(join(hubDir, 'target', 'aarch64-linux-android', 'release', 'libsampler_hub_client.so'), libPath);
  console.log(`sampler hub client built from ${hubDir}`);
}

//its own target dir, a running hub locks target/release
function buildSidecarFromSource(dest) {
  const targetDir = join(hubDir, 'target', 'sidecar');
  cargo(['build', '--release', '-p', 'sampler-hub', '--bin', 'sampler-hubw'], {
    ...process.env,
    CARGO_TARGET_DIR: targetDir,
  });
  const exe = process.platform === 'win32' ? 'sampler-hubw.exe' : 'sampler-hubw';
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(targetDir, 'release', exe), dest);
  console.log(`sampler hub sidecar built from ${hubDir}`);
}

function buildWebFromSource() {
  const env = { ...process.env };
  if (!works('clang', ['--version'])) {
    env.CC_wasm32_unknown_unknown = join(WINDOWS_CLANG, 'clang.exe');
    env.AR_wasm32_unknown_unknown = join(WINDOWS_CLANG, 'llvm-ar.exe');
  }
  cargo(['build', '--release', '--target', 'wasm32-unknown-unknown', '-p', 'sampler-hub-client'], env);

  const out = join(hubDir, 'target', 'wasm-bindgen');
  execFileSync(
    'wasm-bindgen',
    ['--target', 'web', '--out-dir', out, join(hubDir, 'target', 'wasm32-unknown-unknown', 'release', 'sampler_hub_client.wasm')],
    { stdio: 'inherit' },
  );
  mkdirSync(webDir, { recursive: true });
  copyFileSync(join(out, 'sampler_hub_client.js'), join(webDir, 'sampler-hub-client-web.js'));
  copyFileSync(join(out, 'sampler_hub_client_bg.wasm'), join(webDir, 'sampler-hub-client-web.wasm'));
  console.log(`sampler hub web client built from ${hubDir}`);
}

async function downloadPinned(assets) {
  const pin = JSON.parse(readFileSync(join(root, 'sampler-hub-client.json'), 'utf8'));
  //older pins predate the web client
  if (assets.some(([asset]) => !pin.sha256[asset])) {
    console.warn(`sampler hub client ${pin.version} has no ${target} build, skipping`);
    return;
  }
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
  console.log(`sampler hub client ${pin.version} from the release`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
