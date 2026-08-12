import { useEffect, useMemo, useState } from 'react'
import { LocalThumbnail } from './LocalThumbnail'
import { PhotoLightbox } from './PhotoLightbox'
import { PhotoSelectionBar, useExplorerPhotoSelection } from './PhotoSelection'
import { qualityTierLabel } from './quality'
import { filterQuality, sortByTechnicalQuality, type LiteQualityFilter, type LiteQualitySort } from './qualityRanking'
import { ReviewControls } from './ReviewControls'
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

const PAGE_SIZE = 240

export function QualityPanel({ items, sessionFiles, progress, busy, reconnectRequired, onAnalyze, onAbort, onReview }: QualityPanelProps): JSX.Element {
  const [qualityFilter, setQualityFilter] = useState<LiteQualityFilter>('all')
  const [sort, setSort] = useState<LiteQualitySort>('overall')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const photos = items.filter((item) => item.kind === 'image')
  const analyzed = photos.filter((item) => item.qualityStatus === 'ready')
  const failed = photos.filter((item) => item.qualityStatus === 'failed').length
  const great = analyzed.filter((item) => item.qualityTier === 'great').length
  const good = analyzed.filter((item) => item.qualityTier === 'good').length
  const okay = analyzed.filter((item) => item.qualityTier === 'okay').length
  const weak = analyzed.filter((item) => item.qualityTier === 'weak').length
  const average = analyzed.length > 0 ? Math.round(analyzed.reduce((sum, item) => sum + (item.qualityScore ?? 0), 0) / analyzed.length) : null

  const ranked = useMemo(() => sortByTechnicalQuality(filterQuality(items, qualityFilter), sort), [items, qualityFilter, sort])
  const visible = ranked.slice(0, visibleCount)
  const selection = useExplorerPhotoSelection(ranked)

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
    setOpenIndex(null)
    selection.clear()
  }, [qualityFilter, sort])

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
            <span className="muted">{ranked.length.toLocaleString()} matching analyzed photos</span>
          </div>

          <PhotoSelectionBar items={selection.selectedItems} onReview={(targets, state) => targets.forEach((item) => onReview(item, state))} onClear={selection.clear} />

          {ranked.length === 0 ? <p className="muted">No analyzed photos match that quality tier.</p> : (
            <div className="quality-grid">
              {visible.map((item, index) => (
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
              ))}
            </div>
          )}

          {visibleCount < ranked.length && (
            <div className="progressive-results-actions">
              <button type="button" onClick={() => setVisibleCount((count) => Math.min(ranked.length, count + PAGE_SIZE))}>Show next {Math.min(PAGE_SIZE, ranked.length - visibleCount).toLocaleString()}</button>
              <button type="button" className="quiet-button" onClick={() => setVisibleCount(ranked.length)}>Show all {ranked.length.toLocaleString()}</button>
              <span>Showing {visible.length.toLocaleString()} of {ranked.length.toLocaleString()} — progressively loaded to avoid decoding thousands of thumbnails at once.</span>
            </div>
          )}
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
