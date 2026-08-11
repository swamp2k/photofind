import { useEffect, useMemo, useState } from 'react'
import { formatCapture, formatLocation } from './formatters'
import { hasLocation } from './filters'
import { LocalPhotoImage } from './LocalPhotoImage'
import { LocalThumbnail } from './LocalThumbnail'
import { reviewStateOf } from './review'
import { useReviewSettings } from './ReviewSettings'
import { SourcePath } from './SourcePathView'
import type { LiteMediaRecord, LiteReviewState } from './types'

interface ReviewSessionProps {
  title: string
  items: LiteMediaRecord[]
  sessionFiles: Map<string, File>
  onReview(items: LiteMediaRecord[], state: LiteReviewState): void
  onExit(): void
}

export function ReviewSession({ title, items, sessionFiles, onReview, onExit }: ReviewSessionProps): JSX.Element {
  const { settings, bindings } = useReviewSettings()
  const [sessionItems, setSessionItems] = useState<LiteMediaRecord[]>(() => items)
  const firstUnreviewed = Math.max(0, sessionItems.findIndex((item) => reviewStateOf(item) === 'unreviewed'))
  const [index, setIndex] = useState(firstUnreviewed)
  const item = sessionItems[Math.min(index, Math.max(0, sessionItems.length - 1))]
  const reviewed = useMemo(() => sessionItems.filter((candidate) => reviewStateOf(candidate) !== 'unreviewed').length, [sessionItems])
  const progress = sessionItems.length > 0 ? ((index + 1) / sessionItems.length) * 100 : 0

  useEffect(() => {
    setSessionItems((current) => current.map((candidate) => items.find((updated) => updated.id === candidate.id) ?? candidate))
  }, [items])

  useEffect(() => {
    if (index >= sessionItems.length && sessionItems.length > 0) setIndex(sessionItems.length - 1)
  }, [index, sessionItems.length])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onExit()
      if (event.key === 'ArrowLeft') setIndex((value) => Math.max(0, value - 1))
      if (event.key === 'ArrowRight') setIndex((value) => Math.min(sessionItems.length - 1, value + 1))
      if (!item) return
      const key = event.key.toLowerCase()
      if (key === bindings.keep) decide('keep')
      if (key === bindings.maybe) decide('maybe')
      if (key === bindings.reject) decide('reject')
      if (key === bindings.reset) decide('unreviewed', false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function decide(state: LiteReviewState, advance = settings.autoAdvance): void {
    if (!item) return
    setSessionItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, reviewState: state, reviewUpdatedAt: Date.now() } : candidate))
    onReview([item], state)
    if (advance && index < sessionItems.length - 1) setIndex(index + 1)
  }

  if (sessionItems.length === 0 || !item) {
    return <section className="focus-empty"><h2>No photos in this review session</h2><p>Change the current filters or return to the library.</p><button type="button" onClick={onExit}>Back to library</button></section>
  }

  const nearbyStart = Math.max(0, Math.min(index - 2, sessionItems.length - 5))
  const nearby = sessionItems.slice(nearbyStart, nearbyStart + 5)

  return (
    <section className="review-session">
      <header className="focus-header">
        <button type="button" className="quiet-button" onClick={onExit}>← Exit review</button>
        <div className="focus-title"><strong>{title}</strong><span>{sessionItems.length.toLocaleString()} photos · {reviewed.toLocaleString()} decided</span></div>
        <div className="focus-progress"><strong>{index + 1} / {sessionItems.length}</strong><div><i style={{ width: `${progress}%` }} /></div></div>
      </header>

      <div className="review-layout">
        <div className="review-photo-column">
          <div className="review-photo-stage">
            <button type="button" className="focus-nav previous" disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label="Previous photo">‹</button>
            <LocalPhotoImage item={item} sessionFile={sessionFiles.get(item.id)} className="review-main-image" eager />
            <button type="button" className="focus-nav next" disabled={index >= sessionItems.length - 1} onClick={() => setIndex(index + 1)} aria-label="Next photo">›</button>
          </div>

          <div className="review-decision-bar">
            <button type="button" className="decision reject" onClick={() => decide('reject')}><span>×</span><strong>Reject</strong><kbd>{bindings.reject.toUpperCase()}</kbd></button>
            <button type="button" className="decision maybe" onClick={() => decide('maybe')}><span>?</span><strong>Maybe</strong><kbd>{bindings.maybe.toUpperCase()}</kbd></button>
            <button type="button" className="decision keep" onClick={() => decide('keep')}><span>✓</span><strong>Keep</strong><kbd>{bindings.keep.toUpperCase()}</kbd></button>
          </div>

          <div className="review-nearby" aria-label="Nearby photos">
            {nearby.map((candidate, offset) => {
              const candidateIndex = nearbyStart + offset
              return <button type="button" className={candidate.id === item.id ? 'active' : ''} key={candidate.id} onClick={() => setIndex(candidateIndex)}><LocalThumbnail item={candidate} sessionFile={sessionFiles.get(candidate.id)} /><span>{reviewStateOf(candidate)}</span></button>
            })}
          </div>
        </div>

        <aside className="review-info">
          <section><span className="inspector-label">Source</span><SourcePath item={item} /></section>
          <section><span className="inspector-label">Photo</span><strong>{item.name}</strong><span>{formatCapture(item)}</span><span>{hasLocation(item) ? formatLocation(item) : 'No location data'}</span>{item.width && item.height && <span>{item.width} × {item.height}</span>}</section>
          {item.faces && item.faces.length > 0 && <section><span className="inspector-label">People</span><span>{item.faces.length} detected face{item.faces.length === 1 ? '' : 's'}</span></section>}
          {typeof item.qualityScore === 'number' && <section><div className="quality-inspector-head"><span className="inspector-label">Technical quality</span><strong>{item.qualityScore}/100</strong></div><ReviewMetric label="Sharpness" value={item.sharpnessScore} /><ReviewMetric label="Exposure" value={item.exposureScore} /><ReviewMetric label="Resolution" value={item.resolutionScore} />{(item.qualityReasons ?? []).slice(0, 3).map((reason) => <small key={reason}>{reason}</small>)}</section>}
          <section><span className="inspector-label">Current decision</span><strong className={`review-state-text ${reviewStateOf(item)}`}>{reviewStateOf(item)}</strong><button type="button" className="quiet-button" onClick={() => decide('unreviewed', false)}>Reset to unreviewed</button></section>
          <section className="shortcut-help"><span className="inspector-label">Keyboard</span><span>← → navigate</span><span>{bindings.keep.toUpperCase()} keep · {bindings.maybe.toUpperCase()} maybe · {bindings.reject.toUpperCase()} reject</span><span>U reset · Esc exit</span><span>Auto-advance: {settings.autoAdvance ? 'on' : 'off'}</span></section>
        </aside>
      </div>
    </section>
  )
}

function ReviewMetric({ label, value }: { label: string; value?: number }): JSX.Element {
  return <div className="review-metric"><span>{label}</span><div><i style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} /></div><strong>{value ?? '–'}</strong></div>
}
