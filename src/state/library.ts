/**
 * Saved documents: the original PDF plus everything placed on it, kept in this
 * browser's IndexedDB so work survives reloads and can be reopened, edited,
 * downloaded or printed later.
 *
 * Metadata and file bytes live in separate stores so listing documents never
 * loads the PDFs themselves. Nothing here leaves the device.
 */
import type { Content } from './editor';

export interface SavedDocMeta {
  id: string;
  name: string;
  pages: number;
  createdAt: number;
  updatedAt: number;
  /** Number of things placed on the document; 0 means opened but not filled. */
  filled: number;
  signed: boolean;
  /** Small JPEG data URL of the first page, for the document gallery. */
  thumb?: string;
}

export interface SavedDoc extends SavedDocMeta {
  bytes: Uint8Array;
  content: Content;
}

const DB = 'suitup';
const META = 'docs';
const DATA = 'docData';

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(META, { keyPath: 'id' });
      req.result.createObjectStore(DATA);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Asks the browser not to clear saved documents when disk space runs low. Best effort. */
export function requestPersistence(): void {
  navigator.storage?.persist?.().catch(() => undefined);
}

/** Newest first. Returns an empty list if storage is unavailable. */
export async function listDocs(): Promise<SavedDocMeta[]> {
  try {
    const tx = (await db()).transaction(META);
    const all = await request(tx.objectStore(META).getAll() as IDBRequest<SavedDocMeta[]>);
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function loadDoc(id: string): Promise<SavedDoc | null> {
  const tx = (await db()).transaction([META, DATA]);
  const [meta, data] = await Promise.all([
    request(tx.objectStore(META).get(id) as IDBRequest<SavedDocMeta | undefined>),
    request(tx.objectStore(DATA).get(id) as IDBRequest<{ bytes: Uint8Array; content: Content } | undefined>),
  ]);
  return meta && data ? { ...meta, ...data } : null;
}

/** Stores a newly opened PDF. The bytes are written once; later saves only touch the content. */
export async function createDoc(name: string, bytes: Uint8Array, pages: number, thumb?: string): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const tx = (await db()).transaction([META, DATA], 'readwrite');
  tx.objectStore(META).put({ id, name, pages, createdAt: now, updatedAt: now, filled: 0, signed: false, thumb } satisfies SavedDocMeta);
  tx.objectStore(DATA).put({ bytes, content: { items: [], formValues: {} } }, id);
  await done(tx);
  return id;
}

export async function saveContent(id: string, content: Content): Promise<void> {
  const database = await db();
  const read = database.transaction([META, DATA]);
  const [meta, data] = await Promise.all([
    request(read.objectStore(META).get(id) as IDBRequest<SavedDocMeta | undefined>),
    request(read.objectStore(DATA).get(id) as IDBRequest<{ bytes: Uint8Array } | undefined>),
  ]);
  if (!meta || !data) return;
  const tx = database.transaction([META, DATA], 'readwrite');
  tx.objectStore(META).put({
    ...meta,
    updatedAt: Date.now(),
    filled: content.items.length + Object.values(content.formValues).filter(Boolean).length,
    signed: content.items.some((it) => it.type === 'image'),
  } satisfies SavedDocMeta);
  tx.objectStore(DATA).put({ bytes: data.bytes, content }, id);
  await done(tx);
}

/** Adds a preview to a document saved before previews existed. Does not touch its modified time. */
export async function setThumb(id: string, thumb: string): Promise<void> {
  const database = await db();
  const meta = await request(database.transaction(META).objectStore(META).get(id) as IDBRequest<SavedDocMeta | undefined>);
  if (!meta) return;
  const tx = database.transaction(META, 'readwrite');
  tx.objectStore(META).put({ ...meta, thumb });
  await done(tx);
}

export async function renameDoc(id: string, name: string): Promise<void> {
  const database = await db();
  const meta = await request(database.transaction(META).objectStore(META).get(id) as IDBRequest<SavedDocMeta | undefined>);
  if (!meta) return;
  const tx = database.transaction(META, 'readwrite');
  tx.objectStore(META).put({ ...meta, name });
  await done(tx);
}

export async function deleteDoc(id: string): Promise<void> {
  const tx = (await db()).transaction([META, DATA], 'readwrite');
  tx.objectStore(META).delete(id);
  tx.objectStore(DATA).delete(id);
  await done(tx);
}
