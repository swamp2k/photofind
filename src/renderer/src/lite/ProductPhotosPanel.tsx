import { useEffect, useMemo, useState } from 'react'
import { putMediaRecords } from './libraryDb'
import { PhotoResults } from './PhotoResults'
import { DEFAULT_SMART_CATEGORY_SETTINGS, findLikelyProductPhotos, normalizeSmartCategorySettings, productPhotoThreshold, setProductPhotoOverride } from './smartCategories'
import type { LiteMediaRecord, LiteProductPhotoSettings, LiteReviewState, LiteSimilarityGroup, LiteSmartCategorySensitivity } from './types'

type MatchFilter = 'all' | 'strong' | 'manual' | 'excluded'

interface ProductPhotosPanelProps {
  items: LiteMediaRecord[]
  groups: LiteSimilarityGroup[]
  sessionFiles: Map<string, File>
  onReview(item: LiteMediaRecord, state: LiteReviewState): void
}

const BATCH_SIZE = 250
const STORAGE_PREFIX = 'photofind-smart-categories:'
const SENSITIVITY_OPTIONS: Array<{ value: LiteSmartCategorySensitivity; label: string; description: string }> = [
  { value: 'conservative', label: 'Conservative', description: 'Only show the clearest matches.' },
  { value: 'balanced', label: 'Balanced', description: 'A practical default for mixed family libraries.' },
  { value: 'broad', label: 'Broad', description: 'Include weaker candidates for manual review.' }
]

export function ProductPhotosPanel({ items, groups, sessionFiles, onReview }: ProductPhotosPanelProps): JSX.Element {
  const libraryId = items[0]?.libraryId ?? ''
  const [settings, setSettings] = useState<LiteProductPhotoSettings>(DEFAULT_SMART_CATEGORY_SETTINGS.productPhotos)
  const [filter, setFilter] = useState<MatchFilter>('all')
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE)
  const [localOverrides, setLocalOverrides] = useState<Map<string, boolean | null>>(new Map())
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    setSettings(loadProductSettings(libraryId))
    setLocalOverrides(new Map())
    setFilter('all')
    setVisibleCount(BATCH_SIZE)
    setSaveError(null)
  }, [libraryId])

  const effectiveItems = useMemo(() => items.map((item) => {
    if (!localOverrides.has(item.id)) return item
    const override = localOverrides.get(item.id)
    return { ...item, productPhotoOverride: override === null ? undefined : override }
  }), [items, localOverrides])
  const matches = useMemo(() => findLikelyProductPhotos(effectiveItems, groups, settings), [effectiveItems, groups, settings])
  const threshold = productPhotoThreshold(settings.sensitivity)
  const strongThreshold = Math.max(0.78, threshold + 0.14)
  const strongCount = matches.filter((match) => match.score >= strongThreshold).length
  const manualCount = matches.filter((match) => match.manuallyIncluded).length
  const excludedItems = effectiveItems.filter((item) => item.kind === 'image' && item.productPhotoOverride === false)
  const similarityAnalyzed = items.filter((item) => item.kind === 'image' && item.similarityStatus === 'ready').length
  const peopleAnalyzed = items.filter((item) => item.kind === 'image' && item.faceAnalysisStatus === 'ready').length
  const visibleItems = useMemo(() => {
    if (filter === 'excluded') return excludedItems
    if (filter === 'strong') return matches.filter((match) => match.score >= strongThreshold).map((match) => match.item)
    if (filter === 'manual') return matches.filter((match) => match.manuallyIncluded).map((match) => match.item)
    return matches.map((match) => match.item)
  }, [excludedItems, filter, matches, strongThreshold])

  useEffect(() => { setVisibleCount(BATCH_SIZE) }, [filter, settings.sensitivity, settings.recognizeSeries, settings.preferNoPeople])

  function updateSettings(next: LiteProductPhotoSettings): void {
    setSettings(next)
    if (!libraryId) return
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${libraryId}`, JSON.stringify({ productPhotos: next }))
    } catch {
      setSaveError('These detection settings could not be saved in this browser.')
    }
  }

  async function updateOverride(item: LiteMediaRecord, override: boolean | null): Promise<void> {
    setSaveError(null)
    const result = setProductPhotoOverride(effectiveItems, item.id, override)
    if (!result.changed) return
    setLocalOverrides((current) => new Map(current).set(item.id, override))
    try {
      await putMediaRecords([result.changed])
    } catch (cause) {
      setLocalOverrides((current) => {
        const next = new Map(current)
        next.delete(item.id)
        return next
      })
      setSaveError(`The correction could not be saved: ${messageOf(cause)}`)
    }
  }

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
              onClick={() => updateSettings({ ...settings, sensitivity: option.value })}
            >
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </button>
          ))}
        </div>

        <div className="smart-category-toggles">
          <label>
            <input type="checkbox" checked={settings.recognizeSeries} onChange={(event) => updateSettings({ ...settings, recognizeSeries: event.target.checked })} />
            <span><strong>Recognize photo series</strong><small>Boost visually related shots taken close together.</small></span>
          </label>
          <label>
            <input type="checkbox" checked={settings.preferNoPeople} onChange={(event) => updateSettings({ ...settings, preferNoPeople: event.target.checked })} />
            <span><strong>Prefer photos without people</strong><small>Use local People analysis as an extra signal when available.</small></span>
          </label>
        </div>

        <details className="smart-category-details">
          <summary><span>Fine tune & explain</span><strong>{Math.round(threshold * 100)}% match threshold</strong></summary>
          <div className="smart-category-detail-grid">
            <div><strong>Series signal</strong><span>{similarityAnalyzed.toLocaleString()} of {items.length.toLocaleString()} photos have visual similarity data. Time-based short series also work without it.</span></div>
            <div><strong>People signal</strong><span>{peopleAnalyzed.toLocaleString()} of {items.length.toLocaleString()} photos have local face-analysis data.</span></div>
            <div><strong>Manual corrections</strong><span>{manualCount.toLocaleString()} included · {excludedItems.length.toLocaleString()} excluded. Corrections persist in the local PhotoFind index.</span></div>
            <div><strong>Semantic matching</strong><span>Prompt-based object understanding is intentionally not enabled yet. When added, it will use a local same-origin model rather than uploading photos.</span></div>
          </div>
        </details>
      </div>

      {saveError && <div className="notice error inline-notice">{saveError}</div>}

      <div className="smart-result-toolbar">
        <div><strong>{matches.length.toLocaleString()} likely product photos</strong><span className="muted">Review the category; it does not change Keep / Maybe / Reject by itself.</span></div>
        <div className="smart-result-filters" role="group" aria-label="Product photo result filter">
          <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All {matches.length.toLocaleString()}</button>
          <button type="button" className={filter === 'strong' ? 'active' : ''} onClick={() => setFilter('strong')}>Strong {strongCount.toLocaleString()}</button>
          <button type="button" className={filter === 'manual' ? 'active' : ''} onClick={() => setFilter('manual')}>Added by you {manualCount.toLocaleString()}</button>
          <button type="button" className={filter === 'excluded' ? 'active' : ''} onClick={() => setFilter('excluded')}>Excluded {excludedItems.length.toLocaleString()}</button>
        </div>
      </div>

      {matches.length === 0 && filter !== 'excluded' && (
        <div className="compact-empty-state">
          <strong>No likely product photos yet.</strong>
          <span>Try Broad sensitivity, or run Duplicates to add visual-series information. People analysis can improve the “without people” signal.</span>
        </div>
      )}

      {visibleItems.length === 0 && (matches.length > 0 || filter === 'excluded') && <p className="muted">No photos match this result filter.</p>}
      {visibleItems.length > 0 && (
        <PhotoResults
          items={visibleItems}
          visibleCount={visibleCount}
          batchSize={BATCH_SIZE}
          flowLoading
          selectedId={null}
          sessionFiles={sessionFiles}
          itemActionLabel={filter === 'excluded' ? 'Use automatic detection' : 'Not product photo'}
          onItemAction={(item) => void updateOverride(item, filter === 'excluded' ? null : false)}
          onShowMore={() => setVisibleCount((count) => count + BATCH_SIZE)}
          onReview={onReview}
        />
      )}
    </section>
  )
}

function loadProductSettings(libraryId: string): LiteProductPhotoSettings {
  if (!libraryId) return DEFAULT_SMART_CATEGORY_SETTINGS.productPhotos
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${libraryId}`)
    if (!raw) return DEFAULT_SMART_CATEGORY_SETTINGS.productPhotos
    return normalizeSmartCategorySettings(JSON.parse(raw) as { productPhotos?: LiteProductPhotoSettings } as never).productPhotos
  } catch {
    return DEFAULT_SMART_CATEGORY_SETTINGS.productPhotos
  }
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Something went wrong.'
}
