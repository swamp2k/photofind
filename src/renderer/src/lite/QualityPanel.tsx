import { useMemo, useState } from 'react'
import { LocalThumbnail } from './LocalThumbnail'
import { PhotoLightbox } from './PhotoLightbox'
import { qualityTierLabel } from './quality'
import { filterMinimumQuality, sortByTechnicalQuality, type LiteQualitySort } from './qualityRanking'
import { ReviewControls } from './ReviewControls'
import type { LiteMediaRecord, LiteQualityProgress, LiteReviewState } from './types'

interface QualityPanelProps {
  items: LiteMediaRecord[]
  sessionFiles: Map<string, File>
  progress: LiteQualityProgress | null
  busy: boolean
  reconnectRequired: boolean
  onAnalyze(): void
  onReview(item: LiteMediaRecord, state: LiteReviewState): void
}

const MAX_VISIBLE = 240

export function QualityPanel({ items, sessionFiles, progress, busy, reconnectRequired, onAnalyze, onReview }: QualityPanelProps): JSX.Element {
  const [minimumScore, setMinimumScore] = useState(0)
  const [sort, setSort] = useState<LiteQualitySort>('overall')
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const photos = items.filter((item) => item.kind === 'image')
  const analyzed = photos.filter((item) => item.qualityStatus === 'ready')
  const failed = photos.filter((item) => item.qualityStatus === 'failed').length
  const great = analyzed.filter((item) => item.qualityTier === 'great').length
  const good = analyzed.filter((item) => item.qualityTier === 'good').length
  const weak = analyzed.filter((item) => item.qualityTier === 'weak').length
  const average = analyzed.length > 0 ? Math.round(analyzed.reduce((sum, item) => sum + (item.qualityScore ?? 0), 0) / analyzed.length) : null

  const ranked = useMemo(() => {
    const filtered = minimumScore > 0 ? filterMinimumQuality(items, minimumScore) : items.filter((item) => item.qualityStatus === 'ready')
    return sortByTechnicalQuality(filtered, sort)
  }, [items, minimumScore, sort])
  const visible = ranked.slice(0, MAX_VISIBLE)

  return (
    <section className="quality-section">
      <div className="quality-hero">
        <div>
          <div className="eyebrow">Lite 4 · technical quality</div>
          <h2>Find the technically strongest frames</h2>
          <p className="muted">PhotoFind measures sharpness, exposure, resolution and directional blur risk locally. This score says nothing about how important a memory is.</p>
        </div>
        <button className="primary" type="button" disabled={busy || reconnectRequired || photos.length === 0} onClick={onAnalyze}>
          {busy ? 'Analyzing…' : analyzed.length > 0 ? 'Refresh quality analysis' : 'Analyze quality'}
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
            <label>Minimum quality
              <select value={minimumScore} onChange={(event) => { setMinimumScore(Number(event.target.value)); setOpenIndex(null) }}>
                <option value={0}>All analyzed</option>
                <option value={48}>Okay or better</option>
                <option value={67}>Good or better</option>
                <option value={82}>Great only</option>
              </select>
            </label>
            <label>Rank by
              <select value={sort} onChange={(event) => { setSort(event.target.value as LiteQualitySort); setOpenIndex(null) }}>
                <option value="overall">Overall technical quality</option>
                <option value="sharpness">Sharpness / detail</option>
                <option value="exposure">Exposure</option>
                <option value="resolution">Resolution</option>
              </select>
            </label>
            <span className="muted">{ranked.length.toLocaleString()} matching analyzed photos</span>
          </div>

          {ranked.length === 0 ? <p className="muted">No analyzed photos meet that quality threshold.</p> : (
            <div className="quality-grid">
              {visible.map((item, index) => (
                <article className="quality-card" key={item.id}>
                  <button className="quality-open-button" type="button" onClick={() => setOpenIndex(index)}>
                    <div className="quality-image"><LocalThumbnail item={item} sessionFile={sessionFiles.get(item.id)} /></div>
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
          {ranked.length > MAX_VISIBLE && <p className="muted quality-limit">Showing the top {MAX_VISIBLE.toLocaleString()} matching photos. Tighten the quality filter to narrow the set.</p>}
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
