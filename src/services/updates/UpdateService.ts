import Constants from 'expo-constants';
import { universalFetch } from '../ai/utils/universalFetch';

const LATEST_RELEASE_URL = 'https://api.github.com/repos/MaestroAI-Company/opera/releases/latest';

//one network check per app session window
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type AppRelease = {
  version: string;
  url: string;
};

let cachedAt = 0;
let cachedRelease: AppRelease | null = null;

//trailing letter sorts after plain version
function versionParts(version: string): number[] {
  const clean = version.trim().replace(/^v/i, '');
  const core = clean.match(/^\d+(\.\d+)*/)?.[0] ?? '0';
  const suffix = clean.slice(core.length).toLowerCase();
  const parts = core.split('.').map(n => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts.push(/^[a-z]/.test(suffix) ? suffix.charCodeAt(0) - 96 : 0);
  return parts;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const a = versionParts(candidate);
  const b = versionParts(current);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

async function fetchLatestRelease(): Promise<AppRelease | null> {
  const res = await universalFetch(LATEST_RELEASE_URL, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) return null;

  const data = await res.json();
  const tag: string | undefined = data?.tag_name;
  if (!tag) return null;
  return { version: tag.replace(/^v/i, ''), url: data.html_url ?? LATEST_RELEASE_URL };
}

//latest release when newer than build
export async function getAvailableUpdate(): Promise<AppRelease | null> {
  const current = Constants.expoConfig?.version ?? '0.0.0';

  if (Date.now() - cachedAt > CHECK_INTERVAL_MS) {
    try {
      cachedRelease = await fetchLatestRelease();
    } catch (e) {
      console.warn('[UpdateService] release check failed:', e);
      cachedRelease = null;
    }
    cachedAt = Date.now();
  }

  const release = cachedRelease;
  if (!release || !isNewerVersion(release.version, current)) return null;
  return release;
}
