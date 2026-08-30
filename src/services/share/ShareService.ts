import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { Platform } from 'react-native';
import { arrayBufferToBase64 } from '../ai/utils/base64';
import type { Conversation, Message } from '../db/DatabaseService';
import { Settings } from '../settings/SettingsService';
import { base58Decode, base58Encode, base64ToBytes, base64UrlDecode, base64UrlEncode } from './encoding';
import { PasteCryptoImpl } from './pasteCrypto';
import { createPaste, readPaste, type Adata } from './privateBin';
import { SHARE_QUERY_PARAM } from './shareLink';
import type { SharedMessage, SharedPayload } from './types';

const SHARE_BASE_URL = 'https://chat.maestroai.company/';
const DEFAULT_PASTE_HOST = 'https://privatebin.net/';
const PASTE_EXPIRE = '3day';

//a bare domain is still a usable instance
function normalizePasteHost(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return DEFAULT_PASTE_HOST;
  const hasScheme = trimmed.startsWith('http://') || trimmed.startsWith('https://');
  const withScheme = hasScheme ? trimmed : `https://${trimmed}`;
  return withScheme.endsWith('/') ? withScheme : `${withScheme}/`;
}

export function resolvePasteHost(): string {
  return normalizePasteHost(Settings.getCached().shareInstanceUrl);
}

export function usesDefaultPasteHost(): boolean {
  return resolvePasteHost() === DEFAULT_PASTE_HOST;
}

const KEY_BYTES = 32;
const IV_BYTES = 16;
const SALT_BYTES = 8;
const PBKDF2_ITERATIONS = 100000;
const KEY_BITS = 256;
const TAG_BITS = 128;

//an attacker-authored link could ask for absurd values, both bound the cost of opening it
const MAX_PBKDF2_ITERATIONS = 1_000_000;
const MAX_DECOMPRESSED_BYTES = 32 * 1024 * 1024;
//keep the ui and the model prompt responsive on a hostile payload
const MAX_SHARED_MESSAGES = 2000;

const toBase64 = (bytes: Uint8Array) =>
  arrayBufferToBase64(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);

type ShareSecret = { k: string; h?: string };

function encodeSecret(keyBytes: Uint8Array, host: string): string {
  const secret: ShareSecret = { k: base58Encode(keyBytes) };
  //default host stays implicit so links stay short
  if (host !== DEFAULT_PASTE_HOST) secret.h = host;
  return base64UrlEncode(JSON.stringify(secret));
}

function decodeSecret(fragment: string): { keyBytes: Uint8Array; host: string } {
  const secret: ShareSecret = JSON.parse(base64UrlDecode(fragment));
  if (!secret?.k) throw new Error('This share link is missing its key');
  return { keyBytes: base58Decode(secret.k), host: secret.h || DEFAULT_PASTE_HOST };
}

function shareableImages(images?: string[]): string[] | undefined {
  const kept = images?.filter((uri) => uri.startsWith('data:'));
  return kept && kept.length > 0 ? kept : undefined;
}

function buildPayload(conversation: Conversation, messages: Message[]): SharedPayload {
  return {
    v: 1,
    name: conversation.name,
    model: conversation.model,
    createdAt: conversation.createdAt,
    messages: messages.map<SharedMessage>((message) => ({
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      images: shareableImages(message.images),
      sources: message.sources,
    })),
  };
}

async function deriveKey(keyBytes: Uint8Array, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  return PasteCryptoImpl.pbkdf2Sha256(keyBytes, salt, iterations, KEY_BYTES);
}

export async function shareConversation(
  conversation: Conversation,
  messages: Message[],
  host: string = resolvePasteHost(),
): Promise<string> {
  const keyBytes = await PasteCryptoImpl.randomBytes(KEY_BYTES);
  const iv = await PasteCryptoImpl.randomBytes(IV_BYTES);
  const salt = await PasteCryptoImpl.randomBytes(SALT_BYTES);

  const adata: Adata = [
    [toBase64(iv), toBase64(salt), PBKDF2_ITERATIONS, KEY_BITS, TAG_BITS, 'aes', 'gcm', 'zlib'],
    'plaintext',
    0,
    0,
  ];

  const key = await deriveKey(keyBytes, salt, PBKDF2_ITERATIONS);
  const compressed = deflateSync(strToU8(JSON.stringify({ paste: JSON.stringify(buildPayload(conversation, messages)) })));
  const sealed = await PasteCryptoImpl.aesGcmEncrypt(key, iv, strToU8(JSON.stringify(adata)), compressed);

  const id = await createPaste(host, { v: 2, adata, ct: toBase64(sealed), meta: { expire: PASTE_EXPIRE } });
  return `${SHARE_BASE_URL}?${SHARE_QUERY_PARAM}=${encodeURIComponent(id)}#${encodeSecret(keyBytes, host)}`;
}

//a receiver-owned data uri is safe to render, anything else can phone home on open
function sanitizeSharedImage(uri: unknown): string | null {
  return typeof uri === 'string' && uri.startsWith('data:') ? uri : null;
}

function sanitizeSharedSource(raw: unknown): { url: string; title?: string; favicon?: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const url = typeof source.url === 'string' && /^https?:\/\//i.test(source.url) ? source.url : null;
  if (!url) return null;
  const favicon = typeof source.favicon === 'string' && source.favicon.startsWith('data:') ? source.favicon : undefined;
  const title = typeof source.title === 'string' ? source.title : undefined;
  return { url, title, favicon };
}

function sanitizeSharedMessage(raw: unknown): SharedMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const message = raw as Record<string, unknown>;
  if (message.role !== 'user' && message.role !== 'assistant') return null;
  const images = Array.isArray(message.images)
    ? message.images.map(sanitizeSharedImage).filter((uri): uri is string => !!uri)
    : undefined;
  const sources = Array.isArray(message.sources)
    ? message.sources.map(sanitizeSharedSource).filter((source): source is NonNullable<typeof source> => !!source)
    : undefined;
  return {
    role: message.role,
    content: typeof message.content === 'string' ? message.content : '',
    createdAt: typeof message.createdAt === 'number' ? message.createdAt : Date.now(),
    images: images && images.length > 0 ? images : undefined,
    sources: sources && sources.length > 0 ? sources : undefined,
  };
}

//boundary between the paste server / link author and everything we trust
function sanitizeSharedPayload(raw: unknown): SharedPayload {
  if (!raw || typeof raw !== 'object' || (raw as { v?: unknown }).v !== 1) {
    throw new Error('This shared conversation is not readable');
  }
  const payload = raw as Record<string, unknown>;
  if (!Array.isArray(payload.messages)) throw new Error('This shared conversation is not readable');
  const messages = payload.messages
    .slice(0, MAX_SHARED_MESSAGES)
    .map(sanitizeSharedMessage)
    .filter((message): message is SharedMessage => !!message);
  return {
    v: 1,
    name: typeof payload.name === 'string' ? payload.name : 'Shared conversation',
    model: typeof payload.model === 'string' ? payload.model : 'unknown',
    createdAt: typeof payload.createdAt === 'number' ? payload.createdAt : Date.now(),
    messages,
  };
}

export async function fetchSharedConversation(
  pasteId: string,
  fragment: string,
): Promise<{ conversation: Conversation; messages: Message[] }> {
  const { keyBytes, host } = decodeSecret(fragment);
  const envelope = await readPaste(host, pasteId);
  const [[ivB64, saltB64, iterations, , , algo, mode, compression]] = envelope.adata;
  if (algo !== 'aes' || mode !== 'gcm') throw new Error('This share link uses an unsupported cipher');
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_PBKDF2_ITERATIONS) {
    throw new Error('This share link requests an unreasonable amount of computation');
  }

  const key = await deriveKey(keyBytes, base64ToBytes(saltB64), iterations);
  const plaintext = await PasteCryptoImpl.aesGcmDecrypt(
    key,
    base64ToBytes(ivB64),
    strToU8(JSON.stringify(envelope.adata)),
    base64ToBytes(envelope.ct),
  );

  //a fixed output buffer caps a zip-bomb-style payload instead of growing without bound
  const decoded = compression === 'zlib' ? inflateSync(plaintext, { out: new Uint8Array(MAX_DECOMPRESSED_BYTES) }) : plaintext;
  const rawPayload = JSON.parse(JSON.parse(strFromU8(decoded)).paste);
  const payload = sanitizeSharedPayload(rawPayload);

  const now = Date.now();
  const suffix = Math.random().toString(36).slice(2, 7);
  const conversationId = `conv_${now}_${suffix}`;
  const messages: Message[] = payload.messages.map((message, index) => ({
    id: `msg_${now}_${index}_${suffix}`,
    conversationId,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    images: message.images,
    sources: message.sources,
  }));

  return {
    conversation: {
      id: conversationId,
      name: payload.name,
      model: payload.model,
      createdAt: payload.createdAt,
      updatedAt: messages.length > 0 ? messages[messages.length - 1].createdAt : payload.createdAt,
      pinned: 0,
    },
    messages,
  };
}

//the key has no reason to stay in the address bar
export function clearShareFromUrl(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete(SHARE_QUERY_PARAM);
    url.hash = '';
    window.history.replaceState(null, '', url.pathname + url.search);
  } catch {
    //history is not always writable
  }
}

export function tryOpenSharedInApp(pasteId: string, secret: string): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  if ('__TAURI_INTERNALS__' in window) return;
  if (!/android/i.test(navigator.userAgent)) return;
  const marker = `opera.share.handoff.${pasteId}`;
  try {
    if (window.sessionStorage.getItem(marker)) return;
    window.sessionStorage.setItem(marker, '1');
  } catch {
    return;
  }

  window.location.href = `opera://?${SHARE_QUERY_PARAM}=${encodeURIComponent(pasteId)}#${secret}`;
}
