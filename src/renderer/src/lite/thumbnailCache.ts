import { displayBlobForPhoto } from './imageDecode'
import type { LiteMediaRecord } from './types'

const MAX_CACHED_THUMBNAILS = 480
const cache = new Map<string, Promise<Blob>>()

export function thumbnailBlobForPhoto(file: File, item: LiteMediaRecord, maxDimension: number): Promise<Blob> {
  const key = `${item.id}|${item.sizeBytes}|${item.lastModified}|${maxDimension}`
  const existing = cache.get(key)
  if (existing) {
    cache.delete(key)
    cache.set(key, existing)
    return existing
  }

  const pending = displayBlobForPhoto(file, item, maxDimension).catch((error) => {
    if (cache.get(key) === pending) cache.delete(key)
    throw error
  })
  cache.set(key, pending)
  trimCache()
  return pending
}

export function clearThumbnailCache(): void {
  cache.clear()
}

function trimCache(): void {
  while (cache.size > MAX_CACHED_THUMBNAILS) {
    const oldest = cache.keys().next().value as string | undefined
    if (!oldest) return
    cache.delete(oldest)
  }
}
