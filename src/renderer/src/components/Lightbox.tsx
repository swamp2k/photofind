import { useEffect, useState } from 'react'
import type { PhotoAnalysis, Verdict } from '../../../shared/types'

interface LightboxProps {
  photo: PhotoAnalysis
  fallbackThumbnailUrl: string | null
  effectiveVerdict: Verdict
  hasOverride: boolean
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onSetVerdict: (verdict: Verdict) => void
  onClearOverride: () => void
}

export function Lightbox(props: LightboxProps): JSX.Element {
  const { photo } = props
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setPreviewUrl(null)
    setLoadError(null)
    window.api
      .getPreview(photo.media.path)
      .then((preview) => {
        if (cancelled) return
        if (preview.status === 'ready' && preview.thumbnailUrl) {
          setPreviewUrl(preview.thumbnailUrl)
        } else {
          setLoadError(preview.reason ?? 'preview unavailable')
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [photo.media.path])

  const shownUrl = previewUrl ?? props.fallbackThumbnailUrl

  return (
    <div className="modal-backdrop lightbox-backdrop" role="presentation" onClick={props.onClose}>
      <div className="lightbox" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="lightbox-stage">
          <button className="lightbox-nav" aria-label="Previous photo" onClick={props.onPrev}>
            ‹
          </button>
          <div className="lightbox-image">
            {shownUrl ? (
              <img src={shownUrl} alt={photo.media.name} />
            ) : (
              <span className="muted">{loadError ?? 'Loading preview…'}</span>
            )}
            {!previewUrl && !loadError && shownUrl && <span className="lightbox-loading">loading full preview…</span>}
            {loadError && shownUrl && <span className="lightbox-loading lightbox-error">preview failed: {loadError}</span>}
          </div>
          <button className="lightbox-nav" aria-label="Next photo" onClick={props.onNext}>
            ›
          </button>
        </div>
        <div className="lightbox-info">
          <div>
            <div className="lightbox-name">{photo.media.name}</div>
            <div className="muted">
              {photo.reasons.join(', ')}
              {props.hasOverride && ' · your call'}
            </div>
          </div>
          <div className="lightbox-actions">
            <button
              className={props.effectiveVerdict === 'keep' ? 'verdict-button verdict-button-keep active' : 'verdict-button verdict-button-keep'}
              onClick={() => props.onSetVerdict('keep')}
            >
              Keep (K)
            </button>
            <button
              className={props.effectiveVerdict === 'maybe' ? 'verdict-button verdict-button-maybe active' : 'verdict-button verdict-button-maybe'}
              onClick={() => props.onSetVerdict('maybe')}
            >
              Maybe (M)
            </button>
            <button
              className={
                props.effectiveVerdict === 'discard' ? 'verdict-button verdict-button-discard active' : 'verdict-button verdict-button-discard'
              }
              onClick={() => props.onSetVerdict('discard')}
            >
              Discard (D)
            </button>
            {props.hasOverride && (
              <button className="verdict-button" onClick={props.onClearOverride}>
                Undo (U)
              </button>
            )}
            <button onClick={props.onClose}>Close (Esc)</button>
          </div>
        </div>
      </div>
    </div>
  )
}
