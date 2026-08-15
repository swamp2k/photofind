import { useEffect, useMemo, useState } from 'react'
import { cachedThumbnailUrl, thumbnailCacheKey, thumbnailUrlForPhoto } from './thumbnailCache'
import type { LiteMediaRecord } from './types'

const THUMBNAIL_MAX_DIMENSION = 640

export function LocalThumbnail({ item, sessionFile }: { item: LiteMediaRecord; sessionFile?: File }): JSX.Element {
  const cacheKey = useMemo(() => thumbnailCacheKey(item, THUMBNAIL_MAX_DIMENSION), [item.id, item.sizeBytes, item.lastModified])
  const [url, setUrl] = useState<string | null>(() => cachedThumbnailUrl(item, THUMBNAIL_MAX_DIMENSION))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let disposed = false
    const hot = cachedThumbnailUrl(item, THUMBNAIL_MAX_DIMENSION)
    setFailed(false)
    if (hot) {
      setUrl(hot)
      return () => { disposed = true }
    }
    setUrl(null)

    const resolveFile = async (): Promise<File | null> => {
      if (sessionFile) return sessionFile
      return item.fileHandle ? await item.fileHandle.getFile() : null
    }

    void thumbnailUrlForPhoto(item, THUMBNAIL_MAX_DIMENSION, resolveFile).then((nextUrl) => {
      if (!disposed) setUrl(nextUrl)
    }).catch(() => {
      if (!disposed) setFailed(true)
    })

    return () => { disposed = true }
  }, [cacheKey, item.fileHandle, sessionFile])

  if (failed) return <div className="thumb-fallback">Preview unavailable</div>
  if (!url) return <div className="thumb-loading">Loading…</div>

  return <img data-photofind-photo-id={item.id} src={url} alt={item.name} loading="lazy" decoding="async" onError={() => setFailed(true)} />
}
