export type Executorch = typeof import('react-native-executorch');

let runtime: Executorch | null | undefined;

//missing runtime on web and desktop
export function executorch(): Executorch | null {
  if (runtime === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const lib = require('react-native-executorch') as Executorch;
      runtime = lib.isAvailable ? lib : null;
    } catch {
      runtime = null;
    }
  }
  return runtime;
}
