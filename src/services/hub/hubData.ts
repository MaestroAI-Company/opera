import type { CloudMergeTouched } from '../CloudSyncService';
import { BackupCryptoImpl } from '../crypto/backupCrypto';
import { Conversation, DB, Message } from '../db/DatabaseService';
import { OperaHub, PairedHub, SyncRecord } from './OperaHubService';

const BLOB_REF = 'opera-blob:';
//each push stays well under the hub frame limit
const BATCH_BYTES = 1024 * 1024;
const PUSH_MARK = 'push_mark';
//cloud merges older than the push mark
const PENDING = 'pending';
//blobs first so messages can resolve their images
const PULL_ORDER = ['blobs', 'conversations', 'messages'] as const;

type DataCollection = (typeof PULL_ORDER)[number];

async function pushBatched(hub: PairedHub, collection: DataCollection, records: SyncRecord[]): Promise<void> {
  let batch: SyncRecord[] = [];
  let size = 0;
  for (const record of records) {
    const bytes = record.payload?.length ?? 0;
    if (batch.length > 0 && size + bytes > BATCH_BYTES) {
      await OperaHub.push(hub, collection, batch);
      batch = [];
      size = 0;
    }
    batch.push(record);
    size += bytes;
  }
  if (batch.length > 0) await OperaHub.push(hub, collection, batch);
}

//inline images become shared blob refs
async function packImages(images: string[] | undefined, blobs: Map<string, string>): Promise<string[] | undefined> {
  if (!images?.length) return images;
  const packed: string[] = [];
  for (const uri of images) {
    if (!uri.startsWith('data:')) {
      packed.push(uri);
      continue;
    }
    const id = await BackupCryptoImpl.sha256B64(uri);
    blobs.set(id, uri);
    packed.push(BLOB_REF + id);
  }
  return packed;
}

//a ref whose blob never arrived stays as is
async function unpackImages(images: string[] | undefined): Promise<string[] | undefined> {
  if (!images?.length) return images;
  const unpacked: string[] = [];
  for (const uri of images) {
    unpacked.push(uri.startsWith(BLOB_REF) ? ((await DB.getHubBlob(uri.slice(BLOB_REF.length))) ?? uri) : uri);
  }
  return unpacked;
}

async function readPending(): Promise<CloudMergeTouched> {
  const raw = await DB.getHubState(PENDING);
  return raw ? JSON.parse(raw) : { conversations: [], messages: [] };
}

//queued until the next push
export async function queueCloudMerge(touched: CloudMergeTouched): Promise<void> {
  const pending = await readPending();
  const merged: CloudMergeTouched = {
    conversations: [...new Set([...pending.conversations, ...touched.conversations])],
    messages: [...new Set([...pending.messages, ...touched.messages])],
  };
  await DB.setHubState(PENDING, JSON.stringify(merged));
}

//whole conversations, or tombstones once deleted
async function pendingRecords(pending: CloudMergeTouched, blobs: Map<string, string>) {
  const conversations: SyncRecord[] = [];
  const messages: SyncRecord[] = [];
  if (pending.conversations.length === 0 && pending.messages.length === 0) return { conversations, messages };
  const tombstones = new Map((await DB.getTombstones()).map((t) => [`${t.kind}:${t.id}`, t]));
  const existing = new Map((await DB.getConversations()).map((c) => [c.id, c]));
  for (const id of pending.conversations) {
    const conv = existing.get(id);
    if (!conv) {
      const tomb = tombstones.get(`conversation:${id}`);
      if (tomb) conversations.push({ id, updatedAt: tomb.deletedAt, deleted: true, payload: null });
      continue;
    }
    conversations.push({ id, updatedAt: conv.updatedAt, deleted: false, payload: JSON.stringify(conv) });
    for (const message of await DB.getMessages(id)) messages.push(await messageRecord(message, blobs));
  }
  for (const id of pending.messages) {
    const tomb = tombstones.get(`message:${id}`);
    if (tomb) messages.push({ id, updatedAt: tomb.deletedAt, deleted: true, payload: null });
  }
  return { conversations, messages };
}

async function messageRecord(message: Message, blobs: Map<string, string>): Promise<SyncRecord> {
  const payload: Message = { ...message, images: await packImages(message.images, blobs) };
  return {
    id: message.id,
    updatedAt: message.updatedAt ?? message.createdAt,
    deleted: false,
    payload: JSON.stringify(payload),
  };
}

//one record per id, the newest wins
function dedupe(records: SyncRecord[]): SyncRecord[] {
  const byId = new Map<string, SyncRecord>();
  for (const record of records) {
    const known = byId.get(record.id);
    if (!known || record.updatedAt > known.updatedAt) byId.set(record.id, record);
  }
  return [...byId.values()];
}

export async function pushLocalChanges(hub: PairedHub): Promise<void> {
  const mark = Number((await DB.getHubState(PUSH_MARK)) ?? 0);
  //a write during the push lands in the next one
  const startedAt = Date.now() - 1;

  const conversations: SyncRecord[] = (await DB.getConversationsChangedSince(mark)).map((conv: Conversation) => ({
    id: conv.id,
    updatedAt: conv.updatedAt,
    deleted: false,
    payload: JSON.stringify(conv),
  }));
  const blobs = new Map<string, string>();
  const messages: SyncRecord[] = [];
  for (const message of await DB.getMessagesChangedSince(mark)) messages.push(await messageRecord(message, blobs));
  for (const tombstone of await DB.getTombstonesSince(mark)) {
    const target = tombstone.kind === 'conversation' ? conversations : messages;
    target.push({ id: tombstone.id, updatedAt: tombstone.deletedAt, deleted: true, payload: null });
  }

  const pending = await readPending();
  const fromCloud = await pendingRecords(pending, blobs);
  conversations.push(...fromCloud.conversations);
  messages.push(...fromCloud.messages);

  //content addressed so each image goes up once
  const fresh: SyncRecord[] = [];
  for (const [id, uri] of blobs) {
    //a full push owes the new hub every image
    if (mark === 0 || !(await DB.getHubBlob(id))) fresh.push({ id, updatedAt: 1, deleted: false, payload: uri });
  }
  await pushBatched(hub, 'blobs', fresh);
  for (const blob of fresh) await DB.putHubBlob(blob.id, blob.payload!);
  await pushBatched(hub, 'conversations', dedupe(conversations));
  await pushBatched(hub, 'messages', dedupe(messages));
  await DB.setHubState(PUSH_MARK, String(startedAt));
  //merges queued meanwhile stay for the next push
  const left = await readPending();
  await DB.setHubState(
    PENDING,
    JSON.stringify({
      conversations: left.conversations.filter((id) => !pending.conversations.includes(id)),
      messages: left.messages.filter((id) => !pending.messages.includes(id)),
    }),
  );
}

//true when anything was written locally
export async function pullRemoteChanges(hub: PairedHub): Promise<boolean> {
  let changed = false;
  for (const collection of PULL_ORDER) {
    let cursor = Number((await DB.getHubState(`cursor_${collection}`)) ?? 0);
    let more = true;
    while (more) {
      const page = await OperaHub.pull(hub, collection, cursor);
      for (const record of page.records) await applyRecord(collection, record);
      changed = changed || page.records.length > 0;
      cursor = page.cursor;
      more = page.more;
      await DB.setHubState(`cursor_${collection}`, String(cursor));
    }
  }
  return changed;
}

async function applyRecord(collection: DataCollection, record: SyncRecord): Promise<void> {
  if (collection === 'blobs') {
    if (record.payload) await DB.putHubBlob(record.id, record.payload);
    return;
  }
  const kind = collection === 'conversations' ? 'conversation' : 'message';
  if (record.deleted || !record.payload) {
    await DB.applySyncedDeletion(kind, record.id, record.updatedAt);
    return;
  }
  if (collection === 'conversations') {
    await DB.applySyncedConversation(JSON.parse(record.payload) as Conversation);
    return;
  }
  const message = JSON.parse(record.payload) as Message;
  await DB.applySyncedMessage({ ...message, images: await unpackImages(message.images) });
}

//a new hub starts from scratch
export async function resetDataSync(): Promise<void> {
  await DB.setHubState(PUSH_MARK, '0');
  await DB.setHubState(PENDING, '');
  for (const collection of PULL_ORDER) await DB.setHubState(`cursor_${collection}`, '0');
}
