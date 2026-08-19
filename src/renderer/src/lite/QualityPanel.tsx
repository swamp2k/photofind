import { useEffect, useMemo, useRef, useState } from 'react'
import { classifyLikelyNonPhoto } from './contentClassification'
import { loadKnownEventPhotoIds } from './knownEventMembership'
import { LocalThumbnail } from './LocalThumbnail'
import { PhotoLightbox } from './PhotoLightbox'
import { PhotoSelectionBar, useExplorerPhotoSelection } from './PhotoSelection'
import { qualityTierLabel } from './quality'
import { filterQuality, sortByTechnicalQuality, type LiteQualityFilter, type LiteQualitySort } from './qualityRanking'
import { ReviewControls } from './ReviewControls'
import { useReviewSettings } from './ReviewSettings'
import type { LiteMediaRecord, LiteQualityProgress, LiteReviewState } from './types'

interface QualityPanelProps {
  items: LiteMediaRecord[]
  sessionFiles: Map<string, File>
  progress: LiteQualityProgress | null
  busy: boolean
  reconnectRequired: boolean
  onAnalyze(): void
  onAbort(): void
  onReview(item: LiteMediaRecord, state: LiteReviewState): void
}

const EMPTY_IDS = new Set<string>()

export function QualityPanel({ items, sessionFiles, progress, busy, reconnectRequired, onAnalyze, onAbort, onReview }: QualityPanelProps): JSX.Element {
  const { settings } = useReviewSettings()
  const pageSize = settings.photoBatchSize
  const [qualityFilter, setQualityFilter] = useState<LiteQualityFilter>('all')
  const [sort, setSort] = useState<LiteQualitySort>('overall')
  const [showNonPhotos, setShowNonPhotos] = useState(false)
  const [hideKnownEvents, setHideKnownEvents] = useState(false)
  const [knownEventIds, setKnownEventIds] = useState<ReadonlySet<string>>(EMPTY_IDS)
  const [knownEventsReady, setKnownEventsReady] = useState(false)
  const [visibleCount, setVisibleCount] = useState(pageSize)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const flowSentinelRef = useRef<HTMLDivElement | null>(null)
  const libraryId = items[0]?.libraryId ?? ''
  const photos = useMemo(() => items.filter((item) => item.kind === 'image'), [items])
  const analyzed = useMemo(() => photos.filter((item) => item.qualityStatus === 'ready'), [photos])
  const failed = useMemo(() => photos.filter((item) => item.qualityStatus === 'failed').length, [photos])
  const great = useMemo(() => analyzed.filter((item) => item.qualityTier === 'great').length, [analyzed])
  const good = useMemo(() => analyzed.filter((item) => item.qualityTier === 'good').length, [analyzed])
  const okay = useMemo(() => analyzed.filter((item) => item.qualityTier === 'okay').length, [analyzed])
  const weak = useMemo(() => analyzed.filter((item) => item.qualityTier === 'weak').length, [analyzed])
  const average = useMemo(() => analyzed.length > 0 ? Math.round(analyzed.reduce((sum, item) => sum + (item.qualityScore ?? 0), 0) / analyzed.length) : null, [analyzed])
  const contentById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof classifyLikelyNonPhoto>>()
    for (const item of analyzed) {
      const classification = classifyLikelyNonPhoto(item)
      if (classification) map.set(item.id, classification)
    }
    return map
  }, [analyzed])
  const nonPhotoCount = contentById.size
  const knownEventCount = useMemo(() => analyzed.reduce((count, item) => count + (knownEventIds.has(item.id) ? 1 : 0), 0), [analyzed, knownEventIds])

  useEffect(() => {
    let cancelled = false
    setKnownEventIds(EMPTY_IDS)
    setKnownEventsReady(false)
    if (!libraryId) return () => { cancelled = true }
    void loadKnownEventPhotoIds(libraryId)
      .then((ids) => {
        if (cancelled) return
        setKnownEventIds(ids)
        setKnownEventsReady(true)
      })
      .catch(() => {
        if (cancelled) return
        setKnownEventIds(EMPTY_IDS)
        setKnownEventsReady(true)
      })
    return () => { cancelled = true }
  }, [libraryId])

  const ranked = useMemo(() => {
    const filtered = filterQuality(items, qualityFilter)
    const contentFiltered = showNonPhotos ? filtered.filter((item) => contentById.has(item.id)) : filtered
    const eventFiltered = hideKnownEvents && knownEventsReady ? contentFiltered.filter((item) => !knownEventIds.has(item.id)) : contentFiltered
    return sortByTechnicalQuality(eventFiltered, sort)
  }, [contentById, hideKnownEvents, items, knownEventIds, knownEventsReady, qualityFilter, showNonPhotos, sort])
  const visible = ranked.slice(0, visibleCount)
  const selection = useExplorerPhotoSelection(ranked)
  const automaticFlow = settings.flowLoading && typeof IntersectionObserver !== 'undefined'
  const hasMore = visibleCount < ranked.length

  useEffect(() => {
    setVisibleCount(pageSize)
    setOpenIndex(null)
    selection.clear()
  }, [hideKnownEvents, pageSize, qualityFilter, showNonPhotos, sort])

  useEffect(() => {
    if (!automaticFlow || !hasMore) return
    const target = flowSentinelRef.current
    if (!target) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisibleCount((count) => Math.min(ranked.length, count + pageSize))
      }
    }, { rootMargin: '600px 0px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [automaticFlow, hasMore, pageSize, ranked.length, visibleCount])

  return (
    <section className="quality-section">
      <div className="quality-hero">
        <div>
          <div className="eyebrow">Lite 4 · technical quality</div>
          <h2>Find the technically strongest frames</h2>
          <p className="muted">PhotoFind measures sharpness, exposure, resolution and directional blur risk locally. This score says nothing about how important a memory is.</p>
        </div>
        <button className={busy ? 'danger-outline' : 'primary'} type="button" disabled={reconnectRequired || photos.length === 0} onClick={busy ? onAbort : onAnalyze}>
          {busy ? 'Stop quality analysis' : analyzed.length > 0 ? 'Refresh quality analysis' : 'Analyze quality'}
        </button>
      </div>

      {reconnectRequired && <div className="notice warning inline-notice">Reconnect the source folder before running quality analysis.</div>}
      {progress && (
        <div className="analysis-progress">
          <div><strong>{progress.complete.toLocaleString()} / {progress.total.toLocaleString()}</strong><span>{progress.reused.toLocaleString()} unchanged reused</span></div>
          <progress max={Math.max(1, progress.total)} value={progress.complete} />
          <span className="muted" title={progress.currentPath}>{progress.currentPath}</span>
        </div>
      )}

      <div className="quality-stats">
        <Summary label="Analyzed" value={analyzed.length} detail={`of ${photos.length.toLocaleString()} photos`} />
        <Summary label="Great" value={great} />
        <Summary label="Good" value={good} />
        <Summary label="Okay" value={okay} />
        <Summary label="Average score" value={average} suffix="/100" />
        <Summary label="Weak" value={weak} warn={weak > 0} />
        <Summary label="Failures" value={failed} warn={failed > 0} />
      </div>

      {analyzed.length === 0 ? (
        <div className="quality-empty">
          <h3>Measure before ranking</h3>
          <p>Run quality analysis once. The derived scores stay in your local browser index and unchanged photos are reused later.</p>
        </div>
      ) : (
        <>
          <div className="quality-controls">
            <label>Quality tier
              <select value={qualityFilter} onChange={(event) => setQualityFilter(event.target.value as LiteQualityFilter)}>
                <option value="all">All analyzed</option>
                <option value="great">Great only</option>
                <option value="good">Good only</option>
                <option value="okay">Okay only</option>
                <option value="weak">Weak only</option>
                <option value="good-or-better">Good or better</option>
                <option value="okay-or-better">Okay or better</option>
              </select>
            </label>
            <label>Rank by
              <select value={sort} onChange={(event) => setSort(event.target.value as LiteQualitySort)}>
                <option value="overall">Overall technical quality</option>
                <option value="sharpness">Sharpness / detail</option>
                <option value="exposure">Exposure</option>
                <option value="resolution">Resolution</option>
              </select>
            </label>
            <button
              type="button"
              className={showNonPhotos ? 'quality-content-toggle active' : 'quality-content-toggle'}
              aria-pressed={showNonPhotos}
              title="Likely screenshots, receipts and document-like images. This is a conservative local heuristic, not an automatic reject decision."
              onClick={() => setShowNonPhotos((value) => !value)}
            >
              <span aria-hidden="true">{showNonPhotos ? '☑' : '☐'}</span> Screenshots / docs <b>{nonPhotoCount.toLocaleString()}</b>
            </button>
            <button
              type="button"
              className={hideKnownEvents ? 'quality-content-toggle active' : 'quality-content-toggle'}
              aria-pressed={hideKnownEvents}
              disabled={!knownEventsReady}
              title="Hide photos that are already included in one or more Known events."
              onClick={() => setHideKnownEvents((value) => !value)}
            >
              <span aria-hidden="true">{hideKnownEvents ? '☑' : '☐'}</span> Hide known events {knownEventsReady ? <b>{knownEventCount.toLocaleString()}</b> : <b>…</b>}
            </button>
            <span className="muted">{ranked.length.toLocaleString()} matching analyzed photos{automaticFlow ? ' · Flow on' : ''}</span>
          </div>

          <PhotoSelectionBar items={selection.selectedItems} onReview={(targets, state) => targets.forEach((item) => onReview(item, state))} onClear={selection.clear} />

          {ranked.length === 0 ? <p className="muted">{showNonPhotos ? 'No likely screenshots or documents match the current filters.' : hideKnownEvents ? 'No analyzed photos outside Known events match the current quality tier.' : 'No analyzed photos match that quality tier.'}</p> : (
            <div className="quality-grid">
              {visible.map((item, index) => {
                const content = contentById.get(item.id)
                return (
                  <article className={selection.isSelected(item.id) ? 'quality-card explorer-selected' : 'quality-card'} key={item.id}>
                    <button
                      className="quality-open-button"
                      type="button"
                      aria-pressed={selection.isSelected(item.id)}
                      onClick={(event) => selection.handlePhotoClick(event, item.id, () => setOpenIndex(index))}
                    >
                      <div className="quality-image">
                        <LocalThumbnail item={item} sessionFile={sessionFiles.get(item.id)} />
                        {selection.isSelected(item.id) && <span className="selection-check">✓</span>}
                        {content && <span className={`quality-content-badge ${content.kind}`} title={content.reasons.join(' · ')}>{content.kind === 'screenshot' ? 'Screenshot' : 'Document'}</span>}
                      </div>
                      <div className="quality-card-head">
                        <span className={`quality-badge ${item.qualityTier ?? 'okay'}`}>{item.qualityScore ?? '–'}</span>
                        <div><strong>{qualityTierLabel(item.qualityTier ?? 'okay')}</strong><span title={item.relativePath}>{item.name}</span></div>
                      </div>
                      <div className="quality-metrics">
                        <Metric label="Sharp" value={item.sharpnessScore} />
                        <Metric label="Exposure" value={item.exposureScore} />
                        <Metric label="Resolution" value={item.resolutionScore} />
                        <Metric label="Blur risk" value={item.motionBlurRisk} invert />
                      </div>
                      <div className="quality-reasons">{(item.qualityReasons ?? []).slice(0, 3).map((reason) => <span key={reason}>{reason}</span>)}</div>
                    </button>
                    <ReviewControls item={item} compact onReview={onReview} />
                  </article>
                )
              })}
            </div>
          )}

          {hasMore && !automaticFlow && (
            <div className="progressive-results-actions">
              <button type="button" onClick={() => setVisibleCount((count) => Math.min(ranked.length, count + pageSize))}>Show next {Math.min(pageSize, ranked.length - visibleCount).toLocaleString()}</button>
              <button type="button" className="quiet-button" onClick={() => setVisibleCount(ranked.length)}>Show all {ranked.length.toLocaleString()}</button>
              <span>Showing {visible.length.toLocaleString()} of {ranked.length.toLocaleString()} — progressively loaded to avoid decoding thousands of thumbnails at once.</span>
            </div>
          )}
          {hasMore && automaticFlow && <div ref={flowSentinelRef} className="quality-flow-sentinel" aria-hidden="true" />}
        </>
      )}

      {openIndex !== null && ranked[openIndex] && (
        <PhotoLightbox items={ranked} index={openIndex} sessionFiles={sessionFiles} onIndex={setOpenIndex} onClose={() => setOpenIndex(null)} onReview={onReview} />
      )}
    </section>
  )
}

function Summary({ label, value, detail, suffix = '', warn = false }: { label: string; value: number | null; detail?: string; suffix?: string; warn?: boolean }): JSX.Element {
  return <div className={warn ? 'quality-summary warn' : 'quality-summary'}><span>{label}</span><strong>{value === null ? '–' : `${value.toLocaleString()}${suffix}`}</strong>{detail && <small>{detail}</small>}</div>
}

function Metric({ label, value, invert = false }: { label: string; value?: number; invert?: boolean }): JSX.Element {
  const display = value ?? 0
  return <div><span>{label}</span><strong>{value === undefined ? '–' : display}</strong><div className={invert ? 'metric-bar invert' : 'metric-bar'}><i style={{ width: `${Math.max(0, Math.min(100, display))}%` }} /></div></div>
}
