//writes the updater manifest
import { readFileSync, writeFileSync } from 'node:fs';

const [, , dir, tag, repo, notesFile] = process.argv;

//platform key to bundle file
const bundles = {
  'windows-x86_64': 'opera-windows-x86_64-setup.exe',
  'windows-aarch64': 'opera-windows-aarch64-setup.exe',
  'darwin-aarch64': 'opera-macos-aarch64.app.tar.gz',
  'linux-x86_64': 'opera-linux-x86_64.AppImage',
  'linux-aarch64': 'opera-linux-aarch64.AppImage',
};

const platforms = {};
for (const [platform, file] of Object.entries(bundles)) {
  let signature;
  try {
    signature = readFileSync(`${dir}/${file}.sig`, 'utf8').trim();
  } catch {
    //failed platform must not block others
    console.warn(`no signature for ${file}, skipped`);
    continue;
  }
  platforms[platform] = {
    signature,
    url: `https://github.com/${repo}/releases/download/${tag}/${file}`,
  };
}
if (!Object.keys(platforms).length) throw new Error('no signed bundle found');

writeFileSync(
  `${dir}/latest.json`,
  JSON.stringify(
    {
      version: tag.replace(/^v/, ''),
      notes: readFileSync(notesFile, 'utf8').trim(),
      pub_date: new Date().toISOString(),
      platforms,
    },
    null,
    2,
  ),
);
