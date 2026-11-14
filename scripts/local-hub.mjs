//runs opera on the local Sampler-Hub checkout

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const hubDir = resolve(process.env.SAMPLER_HUB_DIR ?? join(root, '..', 'Sampler-Hub'));
const HUB_GIT = 'https://github.com/MaestroAI-Company/sampler-hub';

const [target, ...args] = process.argv.slice(2);
if (!existsSync(join(hubDir, 'Cargo.toml'))) {
  console.error(`no Sampler-Hub repo at ${hubDir}, set SAMPLER_HUB_DIR`);
  process.exit(1);
}
//child handles ctrl+c then cleanup runs
process.on('SIGINT', () => {});

if (target === 'android') {
  const env = { ...process.env, SAMPLER_HUB_LOCAL: '1', SAMPLER_HUB_DIR: hubDir };
  const result = spawnSync('npm', ['run', 'android', '--', ...args], { cwd: root, env, stdio: 'inherit', shell: true });
  process.exit(result.status ?? 1);
}

//restore the pinned lock after patching
const lockPath = join(root, 'src-tauri', 'Cargo.lock');
const lock = readFileSync(lockPath);
const patches = ['sampler-hub', 'sampler-hub-client'].flatMap((crate) => [
  '--config',
  `patch.'${HUB_GIT}'.${crate}.path='${join(hubDir, 'crates', crate).replaceAll('\\', '/')}'`,
]);
const tauri = join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
const result = spawnSync(process.execPath, [tauri, 'dev', ...args, '--', ...patches], { cwd: root, stdio: 'inherit' });
writeFileSync(lockPath, lock);
process.exit(result.status ?? 1);
