import { BackupCryptoImpl } from '../crypto/backupCrypto';
import { Conversation, DB, Message } from '../db/DatabaseService';
import { OperaHub, PairedHub, SyncRecord } from './OperaHubService';

const BLOB_REF = 'opera-blob:';
//each push stays well under the hub frame limit
const BATCH_BYTES = 6 * 1024 * 1024;
const PUSH_MARK = 'push_mark';
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
  for (const message of await DB.getMessagesChangedSince(mark)) {
    const payload: Message = { ...message, images: await packImages(message.images, blobs) };
    messages.push({
      id: message.id,
      updatedAt: message.updatedAt ?? message.createdAt,
      deleted: false,
      payload: JSON.stringify(payload),
    });
  }
  for (const tombstone of await DB.getTombstonesSince(mark)) {
    const target = tombstone.kind === 'conversation' ? conversations : messages;
    target.push({ id: tombstone.id, updatedAt: tombstone.deletedAt, deleted: true, payload: null });
  }

  //content addressed so each image goes up once
  const fresh: SyncRecord[] = [];
  for (const [id, uri] of blobs) {
    if (!(await DB.getHubBlob(id))) fresh.push({ id, updatedAt: 1, deleted: false, payload: uri });
  }
  await pushBatched(hub, 'blobs', fresh);
  for (const blob of fresh) await DB.putHubBlob(blob.id, blob.payload!);
  await pushBatched(hub, 'conversations', conversations);
  await pushBatched(hub, 'messages', messages);
  await DB.setHubState(PUSH_MARK, String(startedAt));
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
  for (const collection of PULL_ORDER) await DB.setHubState(`cursor_${collection}`, '0');
}
