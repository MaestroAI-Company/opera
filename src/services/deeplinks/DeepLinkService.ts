import { Linking, Platform } from "react-native";

export type DeepLinkRoute =
  | { type: "new-chat" }
  | { type: "conversation"; convId: string }
  | { type: "unknown" };

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function parseDeepLink(url: string): DeepLinkRoute {
  try {
    const parsed = new URL(url);
    const target = parsed.hostname || parsed.pathname.replace(/^\/+/, "");
    const convId = parsed.searchParams.get("convId");
    if (target === "new") return { type: "new-chat" };
    if (convId) return { type: "conversation", convId };
    return { type: "unknown" };
  } catch {
    return { type: "unknown" };
  }
}

export async function getInitialDeepLink(): Promise<DeepLinkRoute | null> {
  if (isTauri) {
    try {
      const mod = await import("@tauri-apps/plugin-deep-link");
      const urls = await mod.getCurrent();
      if (urls && urls.length > 0) return parseDeepLink(urls[0]);
    } catch (e) {
      console.warn("Failed to read tauri deep link", e);
    }
    return null;
  }
  if (Platform.OS === "web") return null;
  try {
    const url = await Linking.getInitialURL();
    return url ? parseDeepLink(url) : null;
  } catch (e) {
    console.warn("Failed to read initial deep link", e);
    return null;
  }
}

export function subscribeToDeepLinks(
  handler: (route: DeepLinkRoute) => void
): () => void {
  if (isTauri) {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        const mod = await import("@tauri-apps/plugin-deep-link");
        if (cancelled) return;
        unlisten = await mod.onOpenUrl((urls) => {
          for (const url of urls) handler(parseDeepLink(url));
        });
      } catch (e) {
        console.warn("Failed to listen to tauri deep links", e);
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }
  if (Platform.OS === "web") return () => {};
  const sub = Linking.addEventListener("url", ({ url }) =>
    handler(parseDeepLink(url))
  );
  return () => sub.remove();
}
