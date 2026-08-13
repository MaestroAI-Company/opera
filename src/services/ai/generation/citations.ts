//regex for model-written citation markers
export const CITE_MARKER_RE = /\[\[cite:\s*(https?:\/\/[^\]\s]+)\s*\]\]/g;

//deduped cited urls in first-appearance order
export function extractCitedUrls(md: string): string[] {
  const urls: string[] = [];
  for (const m of md.matchAll(CITE_MARKER_RE)) {
    if (!urls.includes(m[1])) urls.push(m[1]);
  }
  return urls;
}
