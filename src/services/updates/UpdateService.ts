import Constants from 'expo-constants';
import { invoke } from '@tauri-apps/api/core';
import { universalFetch } from '../ai/utils/universalFetch';
import { Settings } from '../settings/SettingsService';
import { isTauri } from '../platform';

const LATEST_RELEASE_URL = 'https://api.github.com/repos/MaestroAI-Company/opera/releases/latest';
const RELEASE_TAG_URL = 'https://api.github.com/repos/MaestroAI-Company/opera/releases/tags/';
const RELEASES_URL = 'https://api.github.com/repos/MaestroAI-Company/opera/releases';
//local so each device shows it once
const SEEN_VERSION_KEY = 'seenReleaseNotes';
//beta notes seen, release notes still due
const BETA_PREFIX = 'beta:';

//desktop opt-in kept per computer
const BETA_CHANNEL_KEY = 'betaChannel';

//one network check per app session window
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type AppRelease = {
  version: string;
  url: string;
};

export type ReleaseNotes = AppRelease & {
  notes: string;
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

//semver prerelease ids empty for stable
function prereleaseIds(version: string): string[] {
  const pre = version.trim().match(/^v?\d+(?:\.\d+)*[a-z]?-([0-9a-z.-]+)/i)?.[1];
  return pre ? pre.toLowerCase().split('.') : [];
}

function comparePrerelease(a: string[], b: string[]): number {
  //stable sorts after its prereleases
  if (!a.length || !b.length) return b.length - a.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) continue;
    const na = /^\d+$/.test(a[i]);
    const nb = /^\d+$/.test(b[i]);
    if (na && nb) return parseInt(a[i], 10) - parseInt(b[i], 10);
    if (na !== nb) return na ? -1 : 1;
    return a[i] < b[i] ? -1 : 1;
  }
  return a.length - b.length;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const a = versionParts(candidate);
  const b = versionParts(current);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return comparePrerelease(prereleaseIds(candidate), prereleaseIds(current)) > 0;
}

function isBetaVersion(version: string): boolean {
  return /-beta/i.test(version);
}

//ci injects tag with beta suffix
function getBuildVersion(): string {
  const version = Constants.expoConfig?.version ?? '0.0.0';
  const tag = process.env.EXPO_PUBLIC_RELEASE_TAG?.trim().replace(/^v/i, '');
  return tag && tag.startsWith(`${version}-beta`) ? tag : version;
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

//newest stable or beta release
async function fetchNewestRelease(): Promise<AppRelease | null> {
  const res = await universalFetch(RELEASES_URL, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) return null;

  const releases: any[] = await res.json();
  let newest: AppRelease | null = null;
  for (const r of releases) {
    const tag: string | undefined = r?.tag_name;
    if (!tag || r.draft || (r.prerelease && !isBetaVersion(tag))) continue;
    const version = tag.replace(/^v/i, '');
    if (!newest || isNewerVersion(version, newest.version)) {
      newest = { version, url: r.html_url ?? LATEST_RELEASE_URL };
    }
  }
  return newest;
}

export async function getBetaChannel(): Promise<boolean> {
  return isTauri && (await Settings.getLocal(BETA_CHANNEL_KEY)) === 'true';
}

export async function setBetaChannel(enabled: boolean): Promise<void> {
  await Settings.setLocal(BETA_CHANNEL_KEY, String(enabled));
  //next check uses new channel
  cachedAt = 0;
}

//latest release when newer than build
export async function getAvailableUpdate(): Promise<AppRelease | null> {
  const current = getBuildVersion();

  if (Date.now() - cachedAt > CHECK_INTERVAL_MS) {
    try {
      const beta = isBetaVersion(current) || (await getBetaChannel());
      cachedRelease = beta ? await fetchNewestRelease() : await fetchLatestRelease();
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

//false when nothing is newer
export async function installDesktopUpdate(release: AppRelease): Promise<boolean> {
  return invoke<boolean>('app_update_install', { tag: `v${release.version}` });
}

async function fetchRelease(tag: string): Promise<any | null> {
  const res = await universalFetch(`${RELEASE_TAG_URL}${tag}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (res.status === 404) return null;
  //offline or rate limited retries next launch
  if (!res.ok) throw new Error(`release ${tag} check failed: ${res.status}`);
  return res.json();
}

//newest beta prerelease of this version
async function fetchBetaRelease(version: string): Promise<any | null> {
  const res = await universalFetch(RELEASES_URL, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`beta release check failed: ${res.status}`);
  const releases: any[] = await res.json();
  return releases.find(r => r?.prerelease && r.tag_name?.startsWith(`v${version}-beta`)) ?? null;
}

//github notes of this build, once after an update
export async function takeReleaseNotes(firstRun: boolean): Promise<ReleaseNotes | null> {
  const current = Constants.expoConfig?.version ?? '0.0.0';
  const seenBeta = `${BETA_PREFIX}${current}`;
  const seen = await Settings.getLocal(SEEN_VERSION_KEY);
  if (seen === current) return null;

  //fresh installs and downgrades skip the notes
  const seenVersion = seen?.replace(BETA_PREFIX, '');
  if (firstRun || (seenVersion && seen !== seenBeta && !isNewerVersion(current, seenVersion))) {
    await Settings.setLocal(SEEN_VERSION_KEY, current);
    return null;
  }

  let data = await fetchRelease(`v${current}`);
  let mark = current;
  if (!data) {
    //beta testers already saw the beta notes
    if (seen === seenBeta) return null;
    data = await fetchBetaRelease(current);
    mark = data ? seenBeta : current;
  }
  await Settings.setLocal(SEEN_VERSION_KEY, mark);

  const notes = typeof data?.body === 'string' ? data.body.trim() : '';
  if (!notes) return null;
  return { version: current, url: data.html_url ?? LATEST_RELEASE_URL, notes };
}
