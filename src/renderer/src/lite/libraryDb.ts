import { startGlobalProcess } from './globalProcesses'
import { clearThumbnailDiskCacheForLibrary } from './thumbnailDb'
import type { LiteEventOverride, LiteKnownDateRecord, LiteLibraryRecord, LiteMediaRecord, LitePersonRecord, LiteSmartCategorySettings } from './types'

const DB_NAME = 'photofind-lite'
const DB_VERSION = 4
const LIBRARIES_STORE = 'libraries'
const MEDIA_STORE = 'media'
const PEOPLE_STORE = 'people'
const EVENT_OVERRIDES_STORE = 'eventOverrides'
const GLOBAL_KNOWN_DATES_STORE = 'globalKnownDates'
const SHORT_PROCESS_DELAY = 220

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
      if (!db.objectStoreNames.contains(PEOPLE_STORE)) {
        const store = db.createObjectStore(PEOPLE_STORE, { keyPath: 'id' })
        store.createIndex('libraryId', 'libraryId', { unique: false })
      }
      if (!db.objectStoreNames.contains(EVENT_OVERRIDES_STORE)) {
        const store = db.createObjectStore(EVENT_OVERRIDES_STORE, { keyPath: 'id' })
        store.createIndex('libraryId', 'libraryId', { unique: false })
      }
      if (!db.objectStoreNames.contains(GLOBAL_KNOWN_DATES_STORE)) {
        db.createObjectStore(GLOBAL_KNOWN_DATES_STORE, { keyPath: 'id' })
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
  const process = startGlobalProcess('Loading photo index', { detail: 'Reading local photo records…' }, { delayMs: SHORT_PROCESS_DELAY })
  const db = await openDb()
  try {
    const transaction = db.transaction(MEDIA_STORE, 'readonly')
    const rows = await requestResult(transaction.objectStore(MEDIA_STORE).index('libraryId').getAll(libraryId)) as LiteMediaRecord[]
    process.update({ detail: `Sorting ${rows.length.toLocaleString()} local records…` })
    return rows.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  } finally {
    db.close()
    process.finish()
  }
}

export async function loadPeople(libraryId: string): Promise<LitePersonRecord[]> {
  const db = await openDb()
  try {
    const transaction = db.transaction(PEOPLE_STORE, 'readonly')
    const rows = await requestResult(transaction.objectStore(PEOPLE_STORE).index('libraryId').getAll(libraryId)) as LitePersonRecord[]
    return rows.sort((a, b) => b.faceRefs.length - a.faceRefs.length || (a.name ?? '').localeCompare(b.name ?? '') || a.id.localeCompare(b.id))
  } finally {
    db.close()
  }
}

export async function loadEventOverrides(libraryId: string): Promise<LiteEventOverride[]> {
  const db = await openDb()
  try {
    const transaction = db.transaction(EVENT_OVERRIDES_STORE, 'readonly')
    const rows = await requestResult(transaction.objectStore(EVENT_OVERRIDES_STORE).index('libraryId').getAll(libraryId)) as LiteEventOverride[]
    return rows.sort((a, b) => b.updatedAt - a.updatedAt)
  } finally {
    db.close()
  }
}

export async function loadGlobalKnownDates(): Promise<LiteKnownDateRecord[]> {
  const db = await openDb()
  try {
    const transaction = db.transaction(GLOBAL_KNOWN_DATES_STORE, 'readonly')
    const rows = await requestResult(transaction.objectStore(GLOBAL_KNOWN_DATES_STORE).getAll()) as LiteKnownDateRecord[]
    return rows.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title))
  } finally {
    db.close()
  }
}

export async function saveEventOverride(override: LiteEventOverride): Promise<void> {
  const process = startGlobalProcess('Saving event changes', { detail: override.title || 'Updating event…' }, { delayMs: SHORT_PROCESS_DELAY })
  const db = await openDb()
  try {
    await requestResult(db.transaction(EVENT_OVERRIDES_STORE, 'readwrite').objectStore(EVENT_OVERRIDES_STORE).put(override))
  } finally {
    db.close()
    process.finish()
  }
}

export async function saveEventOverrideBatch(overrides: LiteEventOverride[], deleteIds: string[] = []): Promise<void> {
  if (overrides.length === 0 && deleteIds.length === 0) return
  const process = startGlobalProcess('Saving event changes', { detail: `${overrides.length + deleteIds.length} event change${overrides.length + deleteIds.length === 1 ? '' : 's'}…` }, { delayMs: SHORT_PROCESS_DELAY })
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(EVENT_OVERRIDES_STORE, 'readwrite')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Event changes could not be saved.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Event changes were aborted.'))
      const store = transaction.objectStore(EVENT_OVERRIDES_STORE)
      for (const id of new Set(deleteIds)) store.delete(id)
      for (const override of overrides) store.put(override)
    })
  } finally {
    db.close()
    process.finish()
  }
}

export async function deleteEventOverride(id: string): Promise<void> {
  const process = startGlobalProcess('Saving event changes', { detail: 'Removing event override…' }, { delayMs: SHORT_PROCESS_DELAY })
  const db = await openDb()
  try {
    await requestResult(db.transaction(EVENT_OVERRIDES_STORE, 'readwrite').objectStore(EVENT_OVERRIDES_STORE).delete(id))
  } finally {
    db.close()
    process.finish()
  }
}

export async function saveLibraryKnownDates(libraryId: string, knownDates: LiteKnownDateRecord[]): Promise<LiteLibraryRecord> {
  const process = startGlobalProcess('Saving Known dates', { detail: `${knownDates.length.toLocaleString()} date records…` }, { delayMs: SHORT_PROCESS_DELAY })
  const db = await openDb()
  try {
    return await new Promise<LiteLibraryRecord>((resolve, reject) => {
      const transaction = db.transaction(LIBRARIES_STORE, 'readwrite')
      const store = transaction.objectStore(LIBRARIES_STORE)
      let next: LiteLibraryRecord | null = null

      transaction.oncomplete = () => {
        if (next) resolve(next)
        else reject(new Error('The local PhotoFind library no longer exists.'))
      }
      transaction.onerror = () => reject(transaction.error ?? new Error('Known dates could not be saved.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Known-date update was aborted.'))

      const request = store.get(libraryId)
      request.onerror = () => transaction.abort()
      request.onsuccess = () => {
        const current = request.result as LiteLibraryRecord | undefined
        if (!current) {
          transaction.abort()
          return
        }
        next = { ...current, knownDates }
        store.put(next)
      }
    })
  } finally {
    db.close()
    process.finish()
  }
}

export async function saveLibrarySmartCategories(libraryId: string, smartCategories: LiteSmartCategorySettings): Promise<LiteLibraryRecord> {
  const process = startGlobalProcess('Saving AI filter settings', {}, { delayMs: SHORT_PROCESS_DELAY })
  const db = await openDb()
  try {
    return await new Promise<LiteLibraryRecord>((resolve, reject) => {
      const transaction = db.transaction(LIBRARIES_STORE, 'readwrite')
      const store = transaction.objectStore(LIBRARIES_STORE)
      let next: LiteLibraryRecord | null = null

      transaction.oncomplete = () => {
        if (next) resolve(next)
        else reject(new Error('The local PhotoFind library no longer exists.'))
      }
      transaction.onerror = () => reject(transaction.error ?? new Error('Smart category settings could not be saved.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Smart category update was aborted.'))

      const request = store.get(libraryId)
      request.onerror = () => transaction.abort()
      request.onsuccess = () => {
        const current = request.result as LiteLibraryRecord | undefined
        if (!current) {
          transaction.abort()
          return
        }
        next = { ...current, smartCategories }
        store.put(next)
      }
    })
  } finally {
    db.close()
    process.finish()
  }
}

export async function saveKnownDateState(
  libraryId: string,
  localKnownDates: LiteKnownDateRecord[],
  globalKnownDates: LiteKnownDateRecord[]
): Promise<LiteLibraryRecord> {
  const process = startGlobalProcess('Saving Known dates', { detail: 'Updating local and global dates…' }, { delayMs: SHORT_PROCESS_DELAY })
  const db = await openDb()
  try {
    return await new Promise<LiteLibraryRecord>((resolve, reject) => {
      const transaction = db.transaction([LIBRARIES_STORE, GLOBAL_KNOWN_DATES_STORE], 'readwrite')
      const libraryStore = transaction.objectStore(LIBRARIES_STORE)
      const globalStore = transaction.objectStore(GLOBAL_KNOWN_DATES_STORE)
      let next: LiteLibraryRecord | null = null

      transaction.oncomplete = () => {
        if (next) resolve(next)
        else reject(new Error('The local PhotoFind library no longer exists.'))
      }
      transaction.onerror = () => reject(transaction.error ?? new Error('Known dates could not be saved.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Known-date update was aborted.'))

      const request = libraryStore.get(libraryId)
      request.onerror = () => transaction.abort()
      request.onsuccess = () => {
        const current = request.result as LiteLibraryRecord | undefined
        if (!current) {
          transaction.abort()
          return
        }
        next = { ...current, knownDates: localKnownDates }
        libraryStore.put(next)
        globalStore.clear()
        for (const record of globalKnownDates) globalStore.put({ ...record, scope: 'global' })
      }
    })
  } finally {
    db.close()
    process.finish()
  }
}

export async function replaceLibrary(library: LiteLibraryRecord, media: LiteMediaRecord[]): Promise<void> {
  const process = startGlobalProcess('Saving photo index', { detail: `${media.length.toLocaleString()} local records…` }, { delayMs: SHORT_PROCESS_DELAY })
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
    process.finish()
  }
}

export async function putMediaRecords(media: LiteMediaRecord[]): Promise<void> {
  if (media.length === 0) return
  const process = startGlobalProcess('Saving photo changes', { detail: `${media.length.toLocaleString()} photo${media.length === 1 ? '' : 's'}…` }, { delayMs: SHORT_PROCESS_DELAY })
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(MEDIA_STORE, 'readwrite')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Failed to save PhotoFind analysis'))
      transaction.onabort = () => reject(transaction.error ?? new Error('PhotoFind analysis transaction was aborted'))
      const store = transaction.objectStore(MEDIA_STORE)
      for (const item of media) store.put(item)
    })
  } finally {
    db.close()
    process.finish()
  }
}

export async function savePeopleState(libraryId: string, people: LitePersonRecord[], media: LiteMediaRecord[]): Promise<void> {
  const process = startGlobalProcess('Saving people data', { detail: `${people.length.toLocaleString()} people · ${media.length.toLocaleString()} photo changes` }, { delayMs: SHORT_PROCESS_DELAY })
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([PEOPLE_STORE, MEDIA_STORE], 'readwrite')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Failed to save local people analysis'))
      transaction.onabort = () => reject(transaction.error ?? new Error('People analysis transaction was aborted'))

      const mediaStore = transaction.objectStore(MEDIA_STORE)
      for (const item of media) mediaStore.put(item)

      const peopleStore = transaction.objectStore(PEOPLE_STORE)
      const cursorRequest = peopleStore.index('libraryId').openCursor(IDBKeyRange.only(libraryId))
      cursorRequest.onerror = () => transaction.abort()
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (cursor) {
          cursor.delete()
          cursor.continue()
          return
        }
        for (const person of people) peopleStore.put(person)
      }
    })
  } finally {
    db.close()
    process.finish()
  }
}

export async function deleteLibrary(libraryId: string): Promise<void> {
  const process = startGlobalProcess('Removing photo index', {}, { delayMs: SHORT_PROCESS_DELAY })
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([LIBRARIES_STORE, MEDIA_STORE, PEOPLE_STORE, EVENT_OVERRIDES_STORE], 'readwrite')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Failed to remove PhotoFind index'))
      transaction.onabort = () => reject(transaction.error ?? new Error('PhotoFind removal transaction was aborted'))

      transaction.objectStore(LIBRARIES_STORE).delete(libraryId)
      deleteRowsForLibrary(transaction.objectStore(MEDIA_STORE), libraryId, transaction)
      deleteRowsForLibrary(transaction.objectStore(PEOPLE_STORE), libraryId, transaction)
      deleteRowsForLibrary(transaction.objectStore(EVENT_OVERRIDES_STORE), libraryId, transaction)
    })
  } finally {
    db.close()
    process.finish()
  }

  try {
    await clearThumbnailDiskCacheForLibrary(libraryId)
  } catch {
    // The index is already safely removed. A non-critical cache cleanup failure should not
    // make PhotoFind report that source/index deletion failed.
  }
}

function deleteRowsForLibrary(store: IDBObjectStore, libraryId: string, transaction: IDBTransaction): void {
  const cursorRequest = store.index('libraryId').openCursor(IDBKeyRange.only(libraryId))
  cursorRequest.onerror = () => transaction.abort()
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result
    if (!cursor) return
    cursor.delete()
    cursor.continue()
  }
}
