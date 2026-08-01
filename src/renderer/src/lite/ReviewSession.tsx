import { useEffect, useMemo, useState } from 'react'
import { formatCapture, formatLocation } from './formatters'
import { hasLocation } from './filters'
import { LocalPhotoImage } from './LocalPhotoImage'
import { LocalThumbnail } from './LocalThumbnail'
import { reviewStateOf } from './review'
import type { LiteMediaRecord, LiteReviewState } from './types'

interface ReviewSessionProps {
  title: string
  items: LiteMediaRecord[]
  sessionFiles: Map<string, File>
  onReview(item: LiteMediaRecord, state: LiteReviewState): void
  onExit(): void
}

export function ReviewSession({ title, items, sessionFiles, onReview, onExit }: ReviewSessionProps): JSX.Element {
  const firstUnreviewed = Math.max(0, items.findIndex((item) => reviewStateOf(item) === 'unreviewed'))
  const [index, setIndex] = useState(firstUnreviewed)
  const item = items[Math.min(index, Math.max(0, items.length - 1))]
  const reviewed = useMemo(() => items.filter((candidate) => reviewStateOf(candidate) !== 'unreviewed').length, [items])
  const progress = items.length > 0 ? ((index + 1) / items.length) * 100 : 0

  useEffect(() => {
    if (index >= items.length && items.length > 0) setIndex(items.length - 1)
  }, [index, items.length])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onExit()
      if (event.key === 'ArrowLeft') setIndex((value) => Math.max(0, value - 1))
      if (event.key === 'ArrowRight') setIndex((value) => Math.min(items.length - 1, value + 1))
      if (!item) return
      if (event.key.toLowerCase() === 'k') decide('keep')
      if (event.key.toLowerCase() === 'm') decide('maybe')
      if (event.key.toLowerCase() === 'r') decide('reject')
      if (event.key.toLowerCase() === 'u') onReview(item, 'unreviewed')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function decide(state: LiteReviewState): void {
    if (!item) return
    onReview(item, state)
    if (index < items.length - 1) setIndex(index + 1)
  }

  if (items.length === 0 || !item) {
    return <section className="focus-empty"><h2>No photos in this review session</h2><p>Change the current filters or return to the library.</p><button type="button" onClick={onExit}>Back to library</button></section>
  }

  const nearbyStart = Math.max(0, Math.min(index - 2, items.length - 5))
  const nearby = items.slice(nearbyStart, nearbyStart + 5)

  return (
    <section className="review-session">
      <header className="focus-header">
        <button type="button" className="quiet-button" onClick={onExit}>← Exit review</button>
        <div className="focus-title"><strong>{title}</strong><span>{items.length.toLocaleString()} photos · {reviewed.toLocaleString()} decided</span></div>
        <div className="focus-progress"><strong>{index + 1} / {items.length}</strong><div><i style={{ width: `${progress}%` }} /></div></div>
      </header>

      <div className="review-layout">
        <div className="review-photo-column">
          <div className="review-photo-stage">
            <button type="button" className="focus-nav previous" disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label="Previous photo">‹</button>
            <LocalPhotoImage item={item} sessionFile={sessionFiles.get(item.id)} className="review-main-image" eager />
            <button type="button" className="focus-nav next" disabled={index >= items.length - 1} onClick={() => setIndex(index + 1)} aria-label="Next photo">›</button>
          </div>

          <div className="review-decision-bar">
            <button type="button" className="decision reject" onClick={() => decide('reject')}><span>×</span><strong>Reject</strong><kbd>R</kbd></button>
            <button type="button" className="decision maybe" onClick={() => decide('maybe')}><span>?</span><strong>Maybe</strong><kbd>M</kbd></button>
            <button type="button" className="decision keep" onClick={() => decide('keep')}><span>✓</span><strong>Keep</strong><kbd>K</kbd></button>
          </div>

          <div className="review-nearby" aria-label="Nearby photos">
            {nearby.map((candidate, offset) => {
              const candidateIndex = nearbyStart + offset
              return <button type="button" className={candidate.id === item.id ? 'active' : ''} key={candidate.id} onClick={() => setIndex(candidateIndex)}><LocalThumbnail item={candidate} sessionFile={sessionFiles.get(candidate.id)} /><span>{reviewStateOf(candidate)}</span></button>
            })}
          </div>
        </div>

        <aside className="review-info">
          <section><span className="inspector-label">Photo</span><strong>{item.name}</strong><span>{formatCapture(item)}</span><span>{hasLocation(item) ? formatLocation(item) : 'No location data'}</span>{item.width && item.height && <span>{item.width} × {item.height}</span>}</section>
          {typeof item.qualityScore === 'number' && <section><div className="quality-inspector-head"><span className="inspector-label">Technical quality</span><strong>{item.qualityScore}/100</strong></div><ReviewMetric label="Sharpness" value={item.sharpnessScore} /><ReviewMetric label="Exposure" value={item.exposureScore} /><ReviewMetric label="Resolution" value={item.resolutionScore} />{(item.qualityReasons ?? []).slice(0, 3).map((reason) => <small key={reason}>{reason}</small>)}</section>}
          <section><span className="inspector-label">Current decision</span><strong className={`review-state-text ${reviewStateOf(item)}`}>{reviewStateOf(item)}</strong><button type="button" className="quiet-button" onClick={() => onReview(item, 'unreviewed')}>Reset to unreviewed</button></section>
          <section className="shortcut-help"><span className="inspector-label">Keyboard</span><span>← → navigate</span><span>K keep · M maybe · R reject</span><span>U reset · Esc exit</span></section>
        </aside>
      </div>
    </section>
  )
}

function ReviewMetric({ label, value }: { label: string; value?: number }): JSX.Element {
  return <div className="review-metric"><span>{label}</span><div><i style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} /></div><strong>{value ?? '–'}</strong></div>
}
