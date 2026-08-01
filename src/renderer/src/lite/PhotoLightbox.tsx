import { useEffect, useState } from 'react'
import { formatCapture, formatLocation } from './formatters'
import { hasLocation } from './filters'
import { ReviewControls } from './ReviewControls'
import type { LiteMediaRecord, LiteReviewState } from './types'

interface PhotoLightboxProps {
  items: LiteMediaRecord[]
  index: number
  sessionFiles: Map<string, File>
  onIndex(index: number): void
  onClose(): void
  onReview?(item: LiteMediaRecord, state: LiteReviewState): void
}

export function PhotoLightbox({ items, index, sessionFiles, onIndex, onClose, onReview }: PhotoLightboxProps): JSX.Element | null {
  const item = items[index]

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft' && index > 0) onIndex(index - 1)
      if (event.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1)
      if (!item || !onReview) return
      if (event.key.toLowerCase() === 'k') onReview(item, 'keep')
      if (event.key.toLowerCase() === 'm') onReview(item, 'maybe')
      if (event.key.toLowerCase() === 'r') onReview(item, 'reject')
      if (event.key.toLowerCase() === 'u') onReview(item, 'unreviewed')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [index, item, items.length, onClose, onIndex, onReview])

  if (!item) return null
  return (
    <div className="lightbox-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="lightbox" role="dialog" aria-modal="true" aria-label={item.name} onMouseDown={(event) => event.stopPropagation()}>
        <div className="lightbox-toolbar">
          <div>
            <strong>{item.name}</strong>
            <span>{index + 1} / {items.length}</span>
          </div>
          <div className="lightbox-actions">
            {onReview && <ReviewControls item={item} onReview={onReview} />}
            <button type="button" onClick={onClose} aria-label="Close viewer">×</button>
          </div>
        </div>
        <div className="lightbox-stage">
          <button type="button" className="lightbox-nav" disabled={index === 0} onClick={() => onIndex(index - 1)} aria-label="Previous photo">‹</button>
          <FullLocalImage item={item} sessionFile={sessionFiles.get(item.id)} />
          <button type="button" className="lightbox-nav" disabled={index >= items.length - 1} onClick={() => onIndex(index + 1)} aria-label="Next photo">›</button>
        </div>
        <div className="lightbox-meta">
          <span>{formatCapture(item)}</span>
          <span>{hasLocation(item) ? formatLocation(item) : 'No location'}</span>
          {item.width && item.height && <span>{item.width} × {item.height}</span>}
          {(item.cameraMake || item.cameraModel) && <span>{[item.cameraMake, item.cameraModel].filter(Boolean).join(' ')}</span>}
          {item.similarityStatus === 'ready' && <span>{item.perceptualHash ? 'Visual fingerprint ready' : 'Exact hash only'}</span>}
          {typeof item.qualityScore === 'number' && <span>Technical {item.qualityScore}/100 · sharp {item.sharpnessScore ?? '–'} · exposure {item.exposureScore ?? '–'} · resolution {item.resolutionScore ?? '–'}</span>}
          {item.qualityReasons?.map((reason) => <span key={reason}>{reason}</span>)}
          {onReview && <span>Shortcuts: K keep · M maybe · R reject · U reset</span>}
        </div>
      </div>
    </div>
  )
}

function FullLocalImage({ item, sessionFile }: { item: LiteMediaRecord; sessionFile?: File }): JSX.Element {
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
      if (disposed) return
      objectUrl = URL.createObjectURL(file)
      setUrl(objectUrl)
    })().catch((cause) => {
      if (!disposed) setError(cause instanceof Error ? cause.message : 'Unable to open local photo.')
    })

    return () => {
      disposed = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [item, sessionFile])

  if (error) return <div className="lightbox-error">{error}</div>
  if (!url) return <div className="lightbox-loading">Loading local photo…</div>
  return <img className="lightbox-image" src={url} alt={item.name} onError={() => setError('This browser cannot decode the selected photo.')} />
}
