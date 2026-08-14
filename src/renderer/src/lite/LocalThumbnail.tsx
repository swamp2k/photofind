import { useEffect, useState } from 'react'
import { thumbnailBlobForPhoto } from './thumbnailCache'
import type { LiteMediaRecord } from './types'

const THUMBNAIL_MAX_DIMENSION = 640

export function LocalThumbnail({ item, sessionFile }: { item: LiteMediaRecord; sessionFile?: File }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let disposed = false
    let objectUrl: string | null = null
    setFailed(false)
    setUrl(null)

    const load = async (): Promise<void> => {
      const file = sessionFile ?? (item.fileHandle ? await item.fileHandle.getFile() : null)
      if (!file) {
        if (!disposed) setFailed(true)
        return
      }
      const displayBlob = await thumbnailBlobForPhoto(file, item, THUMBNAIL_MAX_DIMENSION)
      if (disposed) return
      objectUrl = URL.createObjectURL(displayBlob)
      setUrl(objectUrl)
    }

    void load().catch(() => {
      if (!disposed) setFailed(true)
    })

    return () => {
      disposed = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [item, sessionFile])

  if (failed) return <div className="thumb-fallback">Preview unavailable</div>
  if (!url) return <div className="thumb-loading">Loading…</div>

  return <img data-photofind-photo-id={item.id} src={url} alt={item.name} loading="lazy" decoding="async" onError={() => setFailed(true)} />
}
