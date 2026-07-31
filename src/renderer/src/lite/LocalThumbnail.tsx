import { useEffect, useState } from 'react'
import type { LiteMediaRecord } from './types'

export function LocalThumbnail({ item }: { item: LiteMediaRecord }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let disposed = false
    let objectUrl: string | null = null

    item.fileHandle
      .getFile()
      .then((file) => {
        if (disposed) return
        objectUrl = URL.createObjectURL(file)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (!disposed) setFailed(true)
      })

    return () => {
      disposed = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [item])

  if (failed) return <div className="thumb-fallback">Preview unavailable</div>
  if (!url) return <div className="thumb-loading">Loading…</div>

  return <img src={url} alt={item.name} loading="lazy" onError={() => setFailed(true)} />
}
