export interface ThumbnailDiskCacheStats {
  count: number
  bytes: number
  originUsage?: number
  originQuota?: number
  persistent?: boolean
}

interface ThumbnailDiskRecord {
  key: string
  itemId: string
  libraryId: string
  blob: Blob
  sizeBytes: number
  createdAt: number
}

const DB_NAME = 'photofind-thumbnails'
const DB_VERSION = 1
const THUMBNAILS_STORE = 'thumbnails'
let persistenceRequested = false
let databasePromise: Promise<IDBDatabase> | null = null

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Thumbnail cache request failed.'))
  })
}

function openDb(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => {
      databasePromise = null
      reject(request.error ?? new Error('Thumbnail cache could not be opened.'))
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(THUMBNAILS_STORE)) {
        const store = db.createObjectStore(THUMBNAILS_STORE, { keyPath: 'key' })
        store.createIndex('itemId', 'itemId', { unique: false })
        store.createIndex('libraryId', 'libraryId', { unique: false })
      }
    }
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        databasePromise = null
      }
      resolve(db)
    }
  })
  return databasePromise
}

export async function loadThumbnailFromDisk(key: string): Promise<Blob | null> {
  const db = await openDb()
  const transaction = db.transaction(THUMBNAILS_STORE, 'readonly')
  const row = await requestResult(transaction.objectStore(THUMBNAILS_STORE).get(key)) as ThumbnailDiskRecord | undefined
  return row?.blob instanceof Blob ? row.blob : null
}

export async function saveThumbnailToDisk(input: {
  key: string
  itemId: string
  libraryId: string
  blob: Blob
}): Promise<void> {
  void requestPersistentStorageBestEffort()
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(THUMBNAILS_STORE, 'readwrite')
    const store = transaction.objectStore(THUMBNAILS_STORE)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Thumbnail could not be cached.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Thumbnail cache write was aborted.'))

    // A source file can change while keeping the same PhotoFind item id. Keep only the
    // current generated representation so old versions do not accumulate forever.
    const cursorRequest = store.index('itemId').openCursor(IDBKeyRange.only(input.itemId))
    cursorRequest.onerror = () => transaction.abort()
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (cursor) {
        if (cursor.primaryKey !== input.key) cursor.delete()
        cursor.continue()
        return
      }
      const row: ThumbnailDiskRecord = {
        key: input.key,
        itemId: input.itemId,
        libraryId: input.libraryId,
        blob: input.blob,
        sizeBytes: input.blob.size,
        createdAt: Date.now()
      }
      store.put(row)
    }
  })
}

export async function clearThumbnailDiskCache(): Promise<void> {
  const db = await openDb()
  await requestResult(db.transaction(THUMBNAILS_STORE, 'readwrite').objectStore(THUMBNAILS_STORE).clear())
}

export async function clearThumbnailDiskCacheForLibrary(libraryId: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(THUMBNAILS_STORE, 'readwrite')
    const request = transaction.objectStore(THUMBNAILS_STORE).index('libraryId').openCursor(IDBKeyRange.only(libraryId))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Thumbnail cache cleanup failed.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Thumbnail cache cleanup was aborted.'))
    request.onerror = () => transaction.abort()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      cursor.delete()
      cursor.continue()
    }
  })
}

export async function thumbnailDiskCacheStats(): Promise<ThumbnailDiskCacheStats> {
  const db = await openDb()
  let count = 0
  let bytes = 0
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(THUMBNAILS_STORE, 'readonly')
    const request = transaction.objectStore(THUMBNAILS_STORE).openCursor()
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Thumbnail cache could not be measured.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Thumbnail cache measurement was aborted.'))
    request.onerror = () => transaction.abort()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      const row = cursor.value as ThumbnailDiskRecord
      count += 1
      bytes += Number.isFinite(row.sizeBytes) ? row.sizeBytes : row.blob?.size ?? 0
      cursor.continue()
    }
  })

  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined
  if (!storage) return { count, bytes }
  try {
    const [estimate, persistent] = await Promise.all([
      storage.estimate?.() ?? Promise.resolve({}),
      storage.persisted?.() ?? Promise.resolve(undefined)
    ])
    return {
      count,
      bytes,
      ...(typeof estimate.usage === 'number' ? { originUsage: estimate.usage } : {}),
      ...(typeof estimate.quota === 'number' ? { originQuota: estimate.quota } : {}),
      ...(typeof persistent === 'boolean' ? { persistent } : {})
    }
  } catch {
    return { count, bytes }
  }
}

async function requestPersistentStorageBestEffort(): Promise<void> {
  if (persistenceRequested) return
  persistenceRequested = true
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return
  try {
    await navigator.storage.persist()
  } catch {
    // Cache persistence is an optimization. Browsers may deny it and normal IndexedDB
    // storage still works, subject to the browser's storage-pressure policy.
  }
}
