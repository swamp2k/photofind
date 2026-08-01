import { useEffect, useRef, useState } from 'react'
import { formatCapture, formatLocation } from './formatters'
import { hasLocation } from './filters'
import { LocalPhotoImage } from './LocalPhotoImage'
import { LocalThumbnail } from './LocalThumbnail'
import { ReviewControls } from './ReviewControls'
import { SourcePath } from './SourcePath'
import type { LiteMediaRecord, LiteReviewState } from './types'

interface PhotoLightboxProps {
  items: LiteMediaRecord[]
  index: number
  sessionFiles: Map<string, File>
  onIndex(index: number): void
  onClose(): void
  onReview?(item: LiteMediaRecord, state: LiteReviewState): void
}

const ZOOM_LEVELS = [1, 2, 4]

export function PhotoLightbox({ items, index, sessionFiles, onIndex, onClose, onReview }: PhotoLightboxProps): JSX.Element | null {
  const item = items[index]
  const [zoomIndex, setZoomIndex] = useState(0)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const drag = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null)
  const zoom = ZOOM_LEVELS[zoomIndex]

  useEffect(() => {
    setZoomIndex(0)
    setPan({ x: 0, y: 0 })
  }, [item?.id])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft' && index > 0) onIndex(index - 1)
      if (event.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1)
      if (event.key.toLowerCase() === 'z') cycleZoom()
      if (event.key === '+' || event.key === '=') setZoomIndex((value) => Math.min(ZOOM_LEVELS.length - 1, value + 1))
      if (event.key === '-') setZoomIndex((value) => Math.max(0, value - 1))
      if (!item || !onReview) return
      if (event.key.toLowerCase() === 'k') onReview(item, 'keep')
      if (event.key.toLowerCase() === 'm') onReview(item, 'maybe')
      if (event.key.toLowerCase() === 'r') onReview(item, 'reject')
      if (event.key.toLowerCase() === 'u') onReview(item, 'unreviewed')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  if (!item) return null

  function cycleZoom(): void {
    setZoomIndex((value) => (value + 1) % ZOOM_LEVELS.length)
    setPan({ x: 0, y: 0 })
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (zoom === 1) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: pan.x, originY: pan.y }
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return
    setPan({ x: drag.current.originX + event.clientX - drag.current.x, y: drag.current.originY + event.clientY - drag.current.y })
  }

  function stopDrag(event: React.PointerEvent<HTMLDivElement>): void {
    if (drag.current?.pointerId === event.pointerId) drag.current = null
  }

  const filmstripStart = Math.max(0, Math.min(index - 4, items.length - 9))
  const filmstrip = items.slice(filmstripStart, filmstripStart + 9)

  return (
    <div className="lightbox-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="lightbox lightbox-polished" role="dialog" aria-modal="true" aria-label={item.name} onMouseDown={(event) => event.stopPropagation()}>
        <div className="lightbox-toolbar">
          <div className="lightbox-title">
            <strong>{item.name}</strong>
            <span>{index + 1} of {items.length}</span>
          </div>
          <div className="lightbox-actions">
            <button type="button" className="zoom-button" onClick={cycleZoom} aria-label={`Zoom ${zoom === 1 ? 'in' : zoom === 2 ? 'further' : 'reset'}`}>{zoom}×</button>
            {onReview && <ReviewControls item={item} onReview={onReview} />}
            <button type="button" className="close-button" onClick={onClose} aria-label="Close viewer">×</button>
          </div>
        </div>

        <div className="lightbox-content">
          <div
            className={zoom > 1 ? 'lightbox-stage zoomed' : 'lightbox-stage'}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
            onDoubleClick={cycleZoom}
          >
            <button type="button" className="lightbox-nav previous" disabled={index === 0} onClick={() => onIndex(index - 1)} aria-label="Previous photo">‹</button>
            <div className="lightbox-canvas">
              <LocalPhotoImage
                item={item}
                sessionFile={sessionFiles.get(item.id)}
                className="lightbox-image"
                eager
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
              />
            </div>
            <button type="button" className="lightbox-nav next" disabled={index >= items.length - 1} onClick={() => onIndex(index + 1)} aria-label="Next photo">›</button>
          </div>

          <aside className="lightbox-inspector">
            <div className="inspector-section source-inspector">
              <span className="inspector-label">Source</span>
              <SourcePath item={item} />
            </div>
            <div className="inspector-section">
              <span className="inspector-label">Captured</span>
              <strong>{formatCapture(item)}</strong>
              <span>{hasLocation(item) ? formatLocation(item) : 'No location metadata'}</span>
            </div>
            {(item.width || item.cameraModel || item.cameraMake) && <div className="inspector-section">
              <span className="inspector-label">File details</span>
              {item.width && item.height && <span>{item.width} × {item.height}</span>}
              {(item.cameraMake || item.cameraModel) && <span>{[item.cameraMake, item.cameraModel].filter(Boolean).join(' ')}</span>}
            </div>}
            {item.faces && item.faces.length > 0 && <div className="inspector-section"><span className="inspector-label">People analysis</span><span>{item.faces.length} detected face{item.faces.length === 1 ? '' : 's'}</span></div>}
            {typeof item.qualityScore === 'number' && <div className="inspector-section">
              <div className="quality-inspector-head"><span className="inspector-label">Technical quality</span><strong>{item.qualityScore}/100</strong></div>
              <QualityBar label="Sharpness" value={item.sharpnessScore} />
              <QualityBar label="Exposure" value={item.exposureScore} />
              <QualityBar label="Resolution" value={item.resolutionScore} />
              {(item.qualityReasons ?? []).slice(0, 3).map((reason) => <small key={reason}>{reason}</small>)}
            </div>}
            <div className="inspector-section shortcut-help">
              <span className="inspector-label">Shortcuts</span>
              <span>← → navigate · Z zoom</span>
              {onReview && <span>K keep · M maybe · R reject · U reset</span>}
            </div>
          </aside>
        </div>

        <div className="lightbox-filmstrip" aria-label="Nearby photos">
          {filmstrip.map((candidate, offset) => {
            const candidateIndex = filmstripStart + offset
            return (
              <button type="button" className={candidateIndex === index ? 'active' : ''} key={candidate.id} onClick={() => onIndex(candidateIndex)} aria-label={`Open ${candidate.name}`}>
                <LocalThumbnail item={candidate} sessionFile={sessionFiles.get(candidate.id)} />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function QualityBar({ label, value }: { label: string; value?: number }): JSX.Element {
  return <div className="inspector-quality-row"><span>{label}</span><div><i style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} /></div><strong>{value ?? '–'}</strong></div>
}
