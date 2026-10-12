//gradle runs it before each android build

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const hubDir = resolve(process.env.OPERA_HUB_DIR ?? join(root, '..', 'opera-hub'));
const mainDir = join(root, 'android', 'app', 'src', 'main');

const cargo = (args) => execFileSync('cargo', args, { cwd: hubDir, stdio: 'inherit' });

//arm64 only like the apk
cargo(['ndk', '-t', 'arm64-v8a', 'build', '--release', '-p', 'opera-hub-client']);

//stripped lib so read host metadata
cargo(['build', '-p', 'opera-hub-client']);
const hostLib = {
  win32: 'opera_hub_client.dll',
  darwin: 'libopera_hub_client.dylib',
}[process.platform] ?? 'libopera_hub_client.so';

rmSync(join(mainDir, 'java', 'uniffi', 'opera_hub_client'), { recursive: true, force: true });
cargo([
  'run', '-q', '-p', 'uniffi-bindgen', '--',
  'generate', '--library', join(hubDir, 'target', 'debug', hostLib),
  '--language', 'kotlin', '--no-format',
  '--out-dir', join(mainDir, 'java'),
]);

mkdirSync(join(mainDir, 'jniLibs', 'arm64-v8a'), { recursive: true });
copyFileSync(
  join(hubDir, 'target', 'aarch64-linux-android', 'release', 'libopera_hub_client.so'),
  join(mainDir, 'jniLibs', 'arm64-v8a', 'libopera_hub_client.so'),
);

console.log('opera hub client up to date');
