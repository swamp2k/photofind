import { useEffect, useState } from 'react'
import type { LiteMediaRecord } from './types'

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
      if (disposed) return
      objectUrl = URL.createObjectURL(file)
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

  if (failed) return <div className="thumb-fallback">Reconnect folder to preview</div>
  if (!url) return <div className="thumb-loading">Loading…</div>

  return <img src={url} alt={item.name} loading="lazy" onError={() => setFailed(true)} />
}
