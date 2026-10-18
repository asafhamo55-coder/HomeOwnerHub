// BL-028 inspection mode: where queued homes (and their photo bytes) live
// until they upload. IndexedDB, because it stores Blobs; localStorage
// cannot hold photos. One database per org, so switching HOAs on a shared
// phone never sends one HOA's queue under another's session.
//
// Every IndexedDB call is wrapped: private windows, blocked site data and
// old browsers either lack it or throw. Then the store falls back to memory
// and says so (`durable: false`), and the page tells the person to keep it
// open until uploads finish. Client-only.

import type { QueueItem } from './queue'

export interface QueueStore {
  /** False when the queue lives only in this tab's memory. */
  durable: boolean
  list(): Promise<QueueItem[]>
  save(item: QueueItem): Promise<void>
  remove(id: string): Promise<void>
}

const STORE = 'items'

export function memoryQueueStore(): QueueStore {
  const items = new Map<string, QueueItem>()
  return {
    durable: false,
    list: async () => [...items.values()],
    save: async (item) => {
      items.set(item.id, item)
    },
    remove: async (id) => {
      items.delete(id)
    },
  }
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

function openDb(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = factory.open(name, 1)
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
    open.onblocked = () => reject(new Error('blocked'))
  })
}

/**
 * The org's durable queue, or an in-memory one when IndexedDB is missing
 * or refuses. Never throws.
 */
export async function openQueueStore(
  orgId: string,
  factory: IDBFactory | null | undefined = typeof indexedDB === 'undefined' ? null : indexedDB,
): Promise<QueueStore> {
  if (!factory) return memoryQueueStore()
  let db: IDBDatabase
  try {
    db = await openDb(factory, `hh-inspect-${orgId}`)
  } catch {
    return memoryQueueStore()
  }
  const tx = (mode: IDBTransactionMode) => db.transaction(STORE, mode).objectStore(STORE)
  return {
    durable: true,
    list: async () => ((await req(tx('readonly').getAll())) as QueueItem[]) ?? [],
    save: async (item) => {
      await req(tx('readwrite').put(item))
    },
    remove: async (id) => {
      await req(tx('readwrite').delete(id))
    },
  }
}
