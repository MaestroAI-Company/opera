import * as FileSystem from 'expo-file-system/legacy';

const STYLESHEET_NAME = 'katex.css';

//lazy require keeps katex off startup
function loadAssets(): { KATEX_CSS: string; KATEX_VERSION: string } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./katexAssets');
}

export function getKatexCss(): string {
  return loadAssets().KATEX_CSS;
}

let resolvedDirectory: string | null = null;
let pendingWrite: Promise<string | null> | null = null;

//disk stylesheet spares the bridge
export function ensureKatexStylesheet(): Promise<string | null> {
  if (resolvedDirectory) return Promise.resolve(resolvedDirectory);

  if (!pendingWrite) {
    pendingWrite = (async () => {
      try {
        const { KATEX_CSS, KATEX_VERSION } = loadAssets();
        //versioned path avoids stale cache
        const directory = `${FileSystem.cacheDirectory}katex-${KATEX_VERSION}/`;
        const stylesheet = `${directory}${STYLESHEET_NAME}`;

        const existing = await FileSystem.getInfoAsync(stylesheet);
        if (!existing.exists) {
          await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
          await FileSystem.writeAsStringAsync(stylesheet, KATEX_CSS);
        }

        resolvedDirectory = directory;
        return directory;
      } catch (e) {
        //caller inlines css as fallback
        console.warn('Could not cache the katex stylesheet:', e);
        return null;
      }
    })();
  }

  return pendingWrite;
}

export const KATEX_STYLESHEET_NAME = STYLESHEET_NAME;
