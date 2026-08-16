import { useEffect, useMemo, useState } from 'react'
import { PhotoResults } from './PhotoResults'
import { findLikelyProductPhotos, productPhotoThreshold } from './smartCategories'
import type { LiteMediaRecord, LiteProductPhotoSettings, LiteReviewState, LiteSimilarityGroup, LiteSmartCategorySensitivity } from './types'

type MatchFilter = 'all' | 'strong' | 'manual'

interface ProductPhotosPanelProps {
  items: LiteMediaRecord[]
  groups: LiteSimilarityGroup[]
  settings: LiteProductPhotoSettings
  sessionFiles: Map<string, File>
  batchSize: number
  flowLoading: boolean
  onSettings(settings: LiteProductPhotoSettings): void
  onReview(item: LiteMediaRecord, state: LiteReviewState): void
}

const SENSITIVITY_OPTIONS: Array<{ value: LiteSmartCategorySensitivity; label: string; description: string }> = [
  { value: 'conservative', label: 'Conservative', description: 'Only show the clearest matches.' },
  { value: 'balanced', label: 'Balanced', description: 'A practical default for mixed family libraries.' },
  { value: 'broad', label: 'Broad', description: 'Include weaker candidates for manual review.' }
]

export function ProductPhotosPanel({ items, groups, settings, sessionFiles, batchSize, flowLoading, onSettings, onReview }: ProductPhotosPanelProps): JSX.Element {
  const [filter, setFilter] = useState<MatchFilter>('all')
  const [visibleCount, setVisibleCount] = useState(batchSize)
  const matches = useMemo(() => findLikelyProductPhotos(items, groups, settings), [groups, items, settings])
  const threshold = productPhotoThreshold(settings.sensitivity)
  const strongThreshold = Math.max(0.78, threshold + 0.14)
  const strongCount = matches.filter((match) => match.score >= strongThreshold).length
  const manualCount = matches.filter((match) => match.manuallyIncluded).length
  const excludedCount = items.filter((item) => item.kind === 'image' && item.productPhotoOverride === false).length
  const similarityAnalyzed = items.filter((item) => item.kind === 'image' && item.similarityStatus === 'ready').length
  const peopleAnalyzed = items.filter((item) => item.kind === 'image' && item.faceAnalysisStatus === 'ready').length
  const filteredMatches = useMemo(() => {
    if (filter === 'strong') return matches.filter((match) => match.score >= strongThreshold)
    if (filter === 'manual') return matches.filter((match) => match.manuallyIncluded)
    return matches
  }, [filter, matches, strongThreshold])
  const visibleItems = useMemo(() => filteredMatches.map((match) => match.item), [filteredMatches])

  useEffect(() => { setVisibleCount(batchSize) }, [batchSize, filter, settings.sensitivity, settings.recognizeSeries, settings.preferNoPeople])

  return (
    <section className="product-photos-section compact-mode-section">
      <div className="smart-category-settings">
        <div className="smart-category-settings-copy">
          <span className="inspector-label">Product photo detection</span>
          <h3>Keep sale photos together, not mixed into family moments</h3>
          <p>PhotoFind combines short photo series, visual similarity and optional people information. Nothing is deleted or rejected automatically.</p>
        </div>

        <div className="smart-sensitivity" role="radiogroup" aria-label="Product photo detection sensitivity">
          {SENSITIVITY_OPTIONS.map((option) => (
            <button
              type="button"
              role="radio"
              aria-checked={settings.sensitivity === option.value}
              className={settings.sensitivity === option.value ? 'smart-sensitivity-option active' : 'smart-sensitivity-option'}
              key={option.value}
              onClick={() => onSettings({ ...settings, sensitivity: option.value })}
            >
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </button>
          ))}
        </div>

        <div className="smart-category-toggles">
          <label>
            <input type="checkbox" checked={settings.recognizeSeries} onChange={(event) => onSettings({ ...settings, recognizeSeries: event.target.checked })} />
            <span><strong>Recognize photo series</strong><small>Boost visually related shots taken close together.</small></span>
          </label>
          <label>
            <input type="checkbox" checked={settings.preferNoPeople} onChange={(event) => onSettings({ ...settings, preferNoPeople: event.target.checked })} />
            <span><strong>Prefer photos without people</strong><small>Use local People analysis as an extra signal when available.</small></span>
          </label>
        </div>

        <details className="smart-category-details">
          <summary><span>Fine tune & explain</span><strong>{Math.round(threshold * 100)}% match threshold</strong></summary>
          <div className="smart-category-detail-grid">
            <div><strong>Series signal</strong><span>{similarityAnalyzed.toLocaleString()} of {items.length.toLocaleString()} photos have visual similarity data. Time-based short series also work without it.</span></div>
            <div><strong>People signal</strong><span>{peopleAnalyzed.toLocaleString()} of {items.length.toLocaleString()} photos have local face-analysis data.</span></div>
            <div><strong>Manual corrections</strong><span>{manualCount.toLocaleString()} included · {excludedCount.toLocaleString()} excluded. Right-click any photo to correct detection or return it to automatic.</span></div>
            <div><strong>Semantic matching</strong><span>Prompt-based object understanding is intentionally not enabled yet. When added, it will use a local same-origin model rather than uploading photos.</span></div>
          </div>
        </details>
      </div>

      <div className="smart-result-toolbar">
        <div><strong>{matches.length.toLocaleString()} likely product photos</strong><span className="muted">Review the category; it does not change Keep / Maybe / Reject by itself.</span></div>
        <div className="smart-result-filters" role="group" aria-label="Product photo result filter">
          <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All {matches.length.toLocaleString()}</button>
          <button type="button" className={filter === 'strong' ? 'active' : ''} onClick={() => setFilter('strong')}>Strong {strongCount.toLocaleString()}</button>
          <button type="button" className={filter === 'manual' ? 'active' : ''} onClick={() => setFilter('manual')}>Added by you {manualCount.toLocaleString()}</button>
        </div>
      </div>

      {matches.length === 0 && (
        <div className="compact-empty-state">
          <strong>No likely product photos yet.</strong>
          <span>Try Broad sensitivity, or run Duplicates to add visual-series information. People analysis can improve the “without people” signal.</span>
        </div>
      )}

      {matches.length > 0 && filteredMatches.length === 0 && <p className="muted">No product photos match this result filter.</p>}
      {filteredMatches.length > 0 && (
        <PhotoResults
          items={visibleItems}
          visibleCount={visibleCount}
          batchSize={batchSize}
          flowLoading={flowLoading}
          selectedId={null}
          sessionFiles={sessionFiles}
          onShowMore={() => setVisibleCount((count) => count + batchSize)}
          onReview={onReview}
        />
      )}
    </section>
  )
}
