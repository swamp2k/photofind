import { displayBlobForPhoto } from './imageDecode'
import { clearThumbnailDiskCache, loadThumbnailFromDisk, saveThumbnailToDisk, thumbnailDiskCacheStats, type ThumbnailDiskCacheStats } from './thumbnailDb'
import type { LiteMediaRecord } from './types'

const THUMBNAIL_CACHE_VERSION = 1
const MAX_HOT_OBJECT_URLS = 2500
const GENERATION_CONCURRENCY = 6

const hotUrls = new Map<string, string>()
const pendingUrls = new Map<string, Promise<string>>()
const generationQueue: Array<() => void> = []
let activeGenerationJobs = 0

export function thumbnailCacheKey(item: Pick<LiteMediaRecord, 'id' | 'sizeBytes' | 'lastModified'>, maxDimension: number): string {
  return `v${THUMBNAIL_CACHE_VERSION}|${item.id}|${item.sizeBytes}|${item.lastModified}|${maxDimension}`
}

export function cachedThumbnailUrl(item: Pick<LiteMediaRecord, 'id' | 'sizeBytes' | 'lastModified'>, maxDimension: number): string | null {
  const key = thumbnailCacheKey(item, maxDimension)
  const existing = hotUrls.get(key)
  if (!existing) return null
  touchHotUrl(key, existing)
  return existing
}

export function thumbnailUrlForPhoto(
  item: LiteMediaRecord,
  maxDimension: number,
  resolveFile: () => Promise<File | null>
): Promise<string> {
  const key = thumbnailCacheKey(item, maxDimension)
  const hot = hotUrls.get(key)
  if (hot) {
    touchHotUrl(key, hot)
    return Promise.resolve(hot)
  }

  const existing = pendingUrls.get(key)
  if (existing) return existing

  const pending = (async () => {
    const cachedBlob = await loadThumbnailFromDisk(key).catch(() => null)
    if (cachedBlob) return rememberHotUrl(key, cachedBlob)

    const file = await resolveFile()
    if (!file) throw new Error('Reconnect the source folder to generate this thumbnail.')

    const blob = await scheduleGeneration(() => displayBlobForPhoto(file, item, maxDimension))
    const url = rememberHotUrl(key, blob)

    // Disk persistence is intentionally off the critical display path. The hot object URL
    // can render immediately while IndexedDB stores the generated thumbnail in the background.
    void saveThumbnailToDisk({
      key,
      itemId: item.id,
      libraryId: item.libraryId,
      blob
    }).catch(() => {
      // A full/evicted browser cache must never prevent the source photo from displaying.
    })

    return url
  })().finally(() => {
    if (pendingUrls.get(key) === pending) pendingUrls.delete(key)
  })

  pendingUrls.set(key, pending)
  return pending
}

export async function clearThumbnailCache(): Promise<void> {
  // Clear the durable cache. Hot URLs are deliberately retained for the current session so
  // clicking Clear does not blank images already mounted behind the Settings drawer. They are
  // bounded by MAX_HOT_OBJECT_URLS and disappear on reload or normal LRU eviction.
  await clearThumbnailDiskCache()
}

export function clearThumbnailMemoryCache(): void {
  for (const url of hotUrls.values()) URL.revokeObjectURL(url)
  hotUrls.clear()
}

export function thumbnailCacheStats(): Promise<ThumbnailDiskCacheStats> {
  return thumbnailDiskCacheStats()
}

function rememberHotUrl(key: string, blob: Blob): string {
  const existing = hotUrls.get(key)
  if (existing) {
    touchHotUrl(key, existing)
    return existing
  }
  const url = URL.createObjectURL(blob)
  hotUrls.set(key, url)
  trimHotUrls()
  return url
}

function touchHotUrl(key: string, url: string): void {
  hotUrls.delete(key)
  hotUrls.set(key, url)
}

function trimHotUrls(): void {
  while (hotUrls.size > MAX_HOT_OBJECT_URLS) {
    const oldest = hotUrls.entries().next().value as [string, string] | undefined
    if (!oldest) return
    hotUrls.delete(oldest[0])
    URL.revokeObjectURL(oldest[1])
  }
}

function scheduleGeneration<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    generationQueue.push(() => {
      activeGenerationJobs += 1
      void task().then(resolve, reject).finally(() => {
        activeGenerationJobs = Math.max(0, activeGenerationJobs - 1)
        pumpGenerationQueue()
      })
    })
    pumpGenerationQueue()
  })
}

function pumpGenerationQueue(): void {
  while (activeGenerationJobs < GENERATION_CONCURRENCY && generationQueue.length > 0) {
    generationQueue.shift()?.()
  }
}
