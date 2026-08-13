import { useEffect, useState, type CSSProperties } from 'react'
import { displayBlobForPhoto } from './imageDecode'
import type { LiteMediaRecord } from './types'

interface LocalPhotoImageProps {
  item: LiteMediaRecord
  sessionFile?: File
  className?: string
  style?: CSSProperties
  eager?: boolean
  draggable?: boolean
  onLoad?(): void
}

const VIEWER_MAX_DIMENSION = 4096

export function LocalPhotoImage({ item, sessionFile, className, style, eager = false, draggable = false, onLoad }: LocalPhotoImageProps): JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    let objectUrl: string | null = null
    setUrl(null)
    setError(null)

    void (async () => {
      const file = sessionFile ?? (item.fileHandle ? await item.fileHandle.getFile() : null)
      if (!file) throw new Error('Reconnect the source folder to view this photo.')
      const displayBlob = await displayBlobForPhoto(file, item, VIEWER_MAX_DIMENSION)
      if (disposed) return
      objectUrl = URL.createObjectURL(displayBlob)
      setUrl(objectUrl)
    })().catch((cause) => {
      if (!disposed) setError(cause instanceof Error ? cause.message : 'Unable to open local photo.')
    })

    return () => {
      disposed = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [item, sessionFile])

  if (error) return <div className="local-photo-error">{error}</div>
  if (!url) return <div className="local-photo-loading">Loading local photo…</div>
  return <img data-photofind-photo-id={item.id} className={className} style={style} src={url} alt={item.name} loading={eager ? 'eager' : 'lazy'} draggable={draggable} onLoad={onLoad} onError={() => setError('This photo could not be decoded locally.')} />
}
