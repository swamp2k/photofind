import type { LiteLibraryRecord, LiteMediaRecord } from './types'

const DB_NAME = 'photofind-lite'
const DB_VERSION = 1
const LIBRARIES_STORE = 'libraries'
const MEDIA_STORE = 'media'

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error('Failed to open PhotoFind index'))
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(LIBRARIES_STORE)) {
        db.createObjectStore(LIBRARIES_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        const store = db.createObjectStore(MEDIA_STORE, { keyPath: 'id' })
        store.createIndex('libraryId', 'libraryId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

export async function listLibraries(): Promise<LiteLibraryRecord[]> {
  const db = await openDb()
  try {
    const transaction = db.transaction(LIBRARIES_STORE, 'readonly')
    const rows = await requestResult(transaction.objectStore(LIBRARIES_STORE).getAll()) as LiteLibraryRecord[]
    return rows.sort((a, b) => b.updatedAt - a.updatedAt)
  } finally {
    db.close()
  }
}

export async function loadMedia(libraryId: string): Promise<LiteMediaRecord[]> {
  const db = await openDb()
  try {
    const transaction = db.transaction(MEDIA_STORE, 'readonly')
    const rows = await requestResult(transaction.objectStore(MEDIA_STORE).index('libraryId').getAll(libraryId)) as LiteMediaRecord[]
    return rows.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  } finally {
    db.close()
  }
}

export async function replaceLibrary(library: LiteLibraryRecord, media: LiteMediaRecord[]): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([LIBRARIES_STORE, MEDIA_STORE], 'readwrite')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Failed to save PhotoFind index'))
      transaction.onabort = () => reject(transaction.error ?? new Error('PhotoFind index transaction was aborted'))

      transaction.objectStore(LIBRARIES_STORE).put(library)
      const mediaStore = transaction.objectStore(MEDIA_STORE)
      const cursorRequest = mediaStore.index('libraryId').openCursor(IDBKeyRange.only(library.id))
      cursorRequest.onerror = () => transaction.abort()
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (cursor) {
          cursor.delete()
          cursor.continue()
          return
        }
        for (const item of media) mediaStore.put(item)
      }
    })
  } finally {
    db.close()
  }
}

export async function deleteLibrary(libraryId: string): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([LIBRARIES_STORE, MEDIA_STORE], 'readwrite')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Failed to remove PhotoFind index'))
      transaction.onabort = () => reject(transaction.error ?? new Error('PhotoFind removal transaction was aborted'))

      transaction.objectStore(LIBRARIES_STORE).delete(libraryId)
      const cursorRequest = transaction.objectStore(MEDIA_STORE).index('libraryId').openCursor(IDBKeyRange.only(libraryId))
      cursorRequest.onerror = () => transaction.abort()
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (!cursor) return
        cursor.delete()
        cursor.continue()
      }
    })
  } finally {
    db.close()
  }
}
