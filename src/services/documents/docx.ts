import { unzipSync, strFromU8 } from 'fflate';

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&(amp|lt|gt|quot|apos);/g, m => XML_ENTITIES[m]);
}

//body text lives in word/document.xml
export function extractDocxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: f => f.name === 'word/document.xml' });
  const entry = files['word/document.xml'];
  if (!entry) throw new Error('not a Word document');

  return decodeEntities(
    strFromU8(entry)
      //keep paragraph and row ends only
      .replace(/<w:(p|tr)\b[^>]*\/>/g, '\n')
      .replace(/<\/w:(p|tr)>/g, '\n')
      .replace(/<w:tab\b[^>]*\/?>/g, '\t')
      .replace(/<w:br\b[^>]*\/?>/g, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
