//gradle runs it before each android build, npm before web, the podfile before ios

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
//read by native/ios/SamplerHubClient.podspec
const iosDir = join(root, 'native', 'ios', 'vendor');
const IOS_TARGETS = ['aarch64-apple-ios', 'aarch64-apple-ios-sim', 'x86_64-apple-ios'];
const RELEASES = 'https://github.com/MaestroAI-Company/Sampler-Hub/releases/download';
//ring needs clang for wasm
const WINDOWS_CLANG = 'C:\\Program Files\\LLVM\\bin';

const target = process.argv[2] ?? 'android';
const works = (command, args) => spawnSync(command, args, { stdio: 'ignore' }).status === 0;
const hasHub = existsSync(join(hubDir, 'Cargo.toml'));

if (target === 'web') {
  if (hasHub && works('wasm-bindgen', ['--version']) && hasClang()) {
    buildWebFromSource();
  } else {
    await downloadPinned([
      ['sampler-hub-client-web.js', join(webDir, 'sampler-hub-client-web.js')],
      ['sampler-hub-client-web.wasm', join(webDir, 'sampler-hub-client-web.wasm')],
    ]);
  }
} else if (target === 'ios') {
  if (hasHub && works('xcodebuild', ['-version']) && hasIosTargets()) {
    buildIosFromSource();
  } else {
    const zip = join(iosDir, 'sampler-hub-client-ios.xcframework.zip');
    const pinned = await downloadPinned([
      ['sampler-hub-client-ios.xcframework.zip', zip],
      ['sampler_hub_client.swift', join(iosDir, 'sampler_hub_client.swift')],
      ['sampler_hub_clientFFI.h', join(iosDir, 'sampler_hub_clientFFI.h')],
    ]);
    if (pinned) {
      rmSync(join(iosDir, 'SamplerHubClient.xcframework'), { recursive: true, force: true });
      execFileSync('ditto', ['-x', '-k', zip, iosDir], { stdio: 'inherit' });
    }
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

function hasIosTargets() {
  const installed = spawnSync('rustup', ['target', 'list', '--installed'], { encoding: 'utf8' }).stdout ?? '';
  return IOS_TARGETS.every((triple) => installed.includes(triple));
}

function buildIosFromSource() {
  //matches the app deployment target
  const env = { ...process.env, IPHONEOS_DEPLOYMENT_TARGET: '17.0' };
  for (const triple of IOS_TARGETS) {
    cargo(['build', '--release', '--target', triple, '-p', 'sampler-hub-client'], env);
  }

  //stripped lib so read host metadata
  cargo(['build', '-p', 'sampler-hub-client']);
  const bindings = join(hubDir, 'target', 'swift-bindings');
  rmSync(bindings, { recursive: true, force: true });
  cargo([
    'run', '-q', '-p', 'uniffi-bindgen', '--',
    'generate', '--library', join(hubDir, 'target', 'debug', 'libsampler_hub_client.dylib'),
    '--language', 'swift', '--out-dir', bindings,
  ]);

  const lib = (triple) => join(hubDir, 'target', triple, 'release', 'libsampler_hub_client.a');
  //one simulator slice holds both archs
  const simLib = join(hubDir, 'target', 'ios-sim', 'libsampler_hub_client.a');
  mkdirSync(dirname(simLib), { recursive: true });
  execFileSync('lipo', ['-create', lib('aarch64-apple-ios-sim'), lib('x86_64-apple-ios'), '-output', simLib], { stdio: 'inherit' });

  rmSync(iosDir, { recursive: true, force: true });
  mkdirSync(iosDir, { recursive: true });
  execFileSync(
    'xcodebuild',
    ['-create-xcframework', '-library', lib('aarch64-apple-ios'), '-library', simLib, '-output', join(iosDir, 'SamplerHubClient.xcframework')],
    { stdio: 'inherit' },
  );
  copyFileSync(join(bindings, 'sampler_hub_client.swift'), join(iosDir, 'sampler_hub_client.swift'));
  copyFileSync(join(bindings, 'sampler_hub_clientFFI.h'), join(iosDir, 'sampler_hub_clientFFI.h'));
  console.log(`sampler hub ios client built from ${hubDir}`);
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
    return false;
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
  return true;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
