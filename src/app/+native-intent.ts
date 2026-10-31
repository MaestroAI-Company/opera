import { getShareExtensionKey } from "expo-share-intent";

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: string;
}) {
  try {
    //route share extension link to home
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) {
      return "/";
    }
    return path;
  } catch {
    return "/";
  }
}

