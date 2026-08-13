import { File } from 'expo-file-system';
import { extractDocxText } from './docx';
import { parsePdf } from './pdfExtraction';

//reject oversized documents before parsing
const MAX_FILE_BYTES = 20 * 1024 * 1024;
//cap document to protect context window
const MAX_CHARS = 40000;
const MAX_PDF_PAGES = 40;
//scanned page images cost many tokens
const MAX_PDF_IMAGES = 4;

const TEXT_EXTENSIONS = [
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'yml', 'yaml', 'log', 'rtf',
  'html', 'htm', 'css', 'js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java',
  'kt', 'swift', 'c', 'h', 'cpp', 'cs', 'php', 'sh', 'sql', 'ini', 'toml', 'env',
];

export type DocumentKind = 'pdf' | 'docx' | 'text';

export type PickedDocument = {
  uri: string;
  name: string;
  mimeType?: string | null;
};

export type ExtractedDocument = {
  name: string;
  text: string;
  //scanned page renders as images
  images: string[];
  //user-facing warning like truncation
  note?: string;
};

//mime filter for the document picker
export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/*',
  'application/json',
  'application/xml',
];

function extensionOf(name: string): string {
  return name.toLowerCase().split('.').pop() ?? '';
}

//null for unreadable files
export function classifyDocument(name: string, mimeType?: string | null): DocumentKind | null {
  const extension = extensionOf(name);
  if (mimeType === 'application/pdf' || extension === 'pdf') return 'pdf';
  if (extension === 'docx' || mimeType?.includes('wordprocessingml')) return 'docx';
  if (TEXT_EXTENSIONS.includes(extension)) return 'text';
  if (mimeType?.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/xml') return 'text';
  return null;
}

//blob uris unreadable by expo-file-system
async function readBytes(uri: string): Promise<Uint8Array> {
  try {
    return await new File(uri).bytes();
  } catch {
    const response = await fetch(uri);
    return new Uint8Array(await response.arrayBuffer());
  }
}

async function readText(uri: string): Promise<string> {
  try {
    return await new File(uri).text();
  } catch {
    const response = await fetch(uri);
    return await response.text();
  }
}

async function readBase64(uri: string): Promise<string> {
  try {
    return await new File(uri).base64();
  } catch {
    const response = await fetch(uri);
    const blob = await response.blob();
    const dataUri: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('failed to read file'));
      reader.readAsDataURL(blob);
    });
    return dataUri.slice(dataUri.indexOf(',') + 1);
  }
}

function truncate(text: string): { text: string; note?: string } {
  if (text.length <= MAX_CHARS) return { text };
  return {
    text: text.slice(0, MAX_CHARS),
    note: `truncated to the first ${MAX_CHARS} characters`,
  };
}

async function extractPdf(uri: string): Promise<{ text: string; images: string[]; note?: string }> {
  const base64 = await readBase64(uri);
  const result = await parsePdf(base64, MAX_PDF_PAGES, MAX_PDF_IMAGES);

  const images: string[] = [];
  const parts: string[] = [];
  for (const page of result.pages) {
    if (page.image) {
      images.push(page.image);
      parts.push(`[page ${page.index}: scanned, attached as an image]`);
    } else if (page.text) {
      parts.push(`[page ${page.index}]\n${page.text}`);
    }
  }

  if (parts.length === 0) throw new Error('no readable content in this PDF');

  const notes: string[] = [];
  if (result.truncated) notes.push(`only the first ${MAX_PDF_PAGES} of ${result.pageCount} pages were read`);
  const { text, note } = truncate(parts.join('\n\n'));
  if (note) notes.push(note);

  return { text, images, note: notes.length > 0 ? notes.join(', ') : undefined };
}

//extract picked document to text
export async function extractDocument(doc: PickedDocument): Promise<ExtractedDocument> {
  const kind = classifyDocument(doc.name, doc.mimeType);
  if (!kind) throw new Error('unsupported document format');

  //blob uris hide size until read
  try {
    const size = new File(doc.uri).size;
    if (size > MAX_FILE_BYTES) throw new Error(`file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`);
  } catch (e: any) {
    if (e?.message?.startsWith('file is larger')) throw e;
  }

  if (kind === 'pdf') {
    const { text, images, note } = await extractPdf(doc.uri);
    return { name: doc.name, text, images, note };
  }

  const raw = kind === 'docx'
    ? extractDocxText(await readBytes(doc.uri))
    : await readText(doc.uri);

  if (!raw.trim()) throw new Error('this document is empty');

  const { text, note } = truncate(raw);
  return { name: doc.name, text, images: [], note };
}

const DOCUMENT_BLOCK = /<document name="([^"]*)">\n[\s\S]*?\n<\/document>\n*/g;

//recover names for message chips
export function splitDocumentBlocks(content: string): { names: string[]; text: string } {
  const names: string[] = [];
  const text = content.replace(DOCUMENT_BLOCK, (_, name) => {
    names.push(name);
    return '';
  });
  return { names, text };
}

//prefix message with document contents
export function formatDocumentsForPrompt(docs: ExtractedDocument[]): string {
  if (docs.length === 0) return '';
  return docs
    .map(d => {
      const header = (d.note ? `${d.name} (${d.note})` : d.name).replace(/"/g, "'");
      //escaped tag keeps block intact
      return `<document name="${header}">\n${d.text.replace(/<\/document>/g, '</ document>')}\n</document>`;
    })
    .join('\n\n') + '\n\n';
}
