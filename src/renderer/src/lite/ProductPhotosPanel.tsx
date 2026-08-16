import { useEffect, useMemo, useRef, useState } from 'react'
import { loadMedia, putMediaRecords } from './libraryDb'
import { PhotoResults } from './PhotoResults'
import { analyzeProductPhotos, PRODUCT_MODEL_ID, PRODUCT_NEGATIVE_PROMPTS, PRODUCT_POSITIVE_PROMPTS, type LiteProductAnalysisProgress } from './productPhotoAnalysis'
import { DEFAULT_SMART_CATEGORY_SETTINGS, findLikelyProductPhotos, normalizeSmartCategorySettings, productPhotoThreshold, productSemanticFloor, setProductPhotoOverride } from './smartCategories'
import { buildSimilarityGroups } from './similarity'
import type { LiteMediaRecord, LiteProductPhotoSettings, LiteReviewState, LiteSmartCategorySensitivity } from './types'
import { clearUndoHistory, notifyLibraryStateChanged, registerUndo } from './undoHistory'

type MatchFilter = 'all' | 'strong' | 'manual' | 'excluded'

type ProductAnalysisSnapshot = Pick<LiteMediaRecord,
  | 'productAnalysisVersion'
  | 'productAnalysisStatus'
  | 'productAnalysisFingerprint'
  | 'productSemanticScore'
  | 'productSemanticLabel'
  | 'productSemanticNegativeLabel'
  | 'productAnalysisError'
  | 'productAnalyzedAt'
>

interface ProductPhotosPanelProps {
  items: LiteMediaRecord[]
  sessionFiles: Map<string, File>
  onReview(item: LiteMediaRecord, state: LiteReviewState): void
}

const BATCH_SIZE = 250
const STORAGE_PREFIX = 'photofind-smart-categories:'
const SESSION_OVERRIDES = new Map<string, boolean | null>()
const SESSION_ANALYSIS = new Map<string, ProductAnalysisSnapshot>()
const SENSITIVITY_OPTIONS: Array<{ value: LiteSmartCategorySensitivity; label: string; description: string }> = [
  { value: 'conservative', label: 'Conservative', description: 'Only show the clearest matches.' },
  { value: 'balanced', label: 'Balanced', description: 'A practical default for mixed family libraries.' },
  { value: 'broad', label: 'Broad', description: 'Include weaker candidates for manual review.' }
]

export function ProductPhotosPanel({ items, sessionFiles, onReview }: ProductPhotosPanelProps): JSX.Element {
  const libraryId = items[0]?.libraryId ?? ''
  const analysisAbortRef = useRef<AbortController | null>(null)
  const [settings, setSettings] = useState<LiteProductPhotoSettings>(DEFAULT_SMART_CATEGORY_SETTINGS.productPhotos)
  const [filter, setFilter] = useState<MatchFilter>('all')
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE)
  const [localOverrides, setLocalOverrides] = useState<Map<string, boolean | null>>(new Map())
  const [localAnalysis, setLocalAnalysis] = useState<Map<string, ProductAnalysisSnapshot>>(new Map())
  const [analysisBusy, setAnalysisBusy] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState<LiteProductAnalysisProgress | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    setSettings(loadProductSettings(libraryId))
    setLocalOverrides(sessionOverridesForLibrary(libraryId))
    setLocalAnalysis(sessionAnalysisForLibrary(libraryId))
    setFilter('all')
    setVisibleCount(BATCH_SIZE)
    setSaveError(null)
    setAnalysisProgress(null)
    return () => analysisAbortRef.current?.abort()
  }, [libraryId])

  const effectiveItems = useMemo(() => items.map((item) => {
    const analysis = localAnalysis.get(item.id)
    const withAnalysis = analysis ? { ...item, ...analysis } : item
    if (!localOverrides.has(item.id)) return withAnalysis
    const override = localOverrides.get(item.id)
    return { ...withAnalysis, productPhotoOverride: override === null ? undefined : override }
  }), [items, localAnalysis, localOverrides])
  const groups = useMemo(() => buildSimilarityGroups(effectiveItems), [effectiveItems])
  const matches = useMemo(() => findLikelyProductPhotos(effectiveItems, groups, settings), [effectiveItems, groups, settings])
  const threshold = productPhotoThreshold(settings.sensitivity)
  const semanticFloor = productSemanticFloor(settings.sensitivity)
  const strongThreshold = Math.max(0.78, threshold + 0.14)
  const strongCount = matches.filter((match) => match.score >= strongThreshold).length
  const manualCount = matches.filter((match) => match.manuallyIncluded).length
  const excludedItems = effectiveItems.filter((item) => item.kind === 'image' && item.productPhotoOverride === false)
  const similarityAnalyzed = effectiveItems.filter((item) => item.kind === 'image' && item.similarityStatus === 'ready').length
  const peopleAnalyzed = effectiveItems.filter((item) => item.kind === 'image' && item.faceAnalysisStatus === 'ready').length
  const semanticAnalyzed = effectiveItems.filter((item) => item.kind === 'image' && item.productAnalysisStatus === 'ready' && typeof item.productSemanticScore === 'number').length
  const semanticFailed = effectiveItems.filter((item) => item.kind === 'image' && item.productAnalysisStatus === 'failed').length
  const hasLocalFileAccess = effectiveItems.some((item) => item.kind === 'image' && (sessionFiles.has(item.id) || Boolean(item.fileHandle)))
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

  async function runSemanticAnalysis(): Promise<void> {
    if (!libraryId || analysisBusy || !hasLocalFileAccess) return
    clearUndoHistory()
    const controller = new AbortController()
    analysisAbortRef.current = controller
    setSaveError(null)
    setAnalysisBusy(true)
    setAnalysisProgress({ phase: 'model', complete: 0, total: effectiveItems.length, reused: 0, failed: 0, currentPath: 'Loading semantic image model…' })
    try {
      await analyzeProductPhotos(effectiveItems, {
        resolveFile: resolveLocalFile,
        persistBatch: putMediaRecords,
        onProgress: setAnalysisProgress,
        signal: controller.signal
      })
    } catch (cause) {
      if (!isAbort(cause)) setSaveError(`Semantic product analysis stopped: ${messageOf(cause)}`)
    } finally {
      if (analysisAbortRef.current === controller) analysisAbortRef.current = null
      await reloadProductAnalysis()
      notifyLibraryStateChanged()
      setAnalysisBusy(false)
      setAnalysisProgress(null)
    }
  }

  async function reloadProductAnalysis(): Promise<void> {
    if (!libraryId) return
    try {
      const stored = await loadMedia(libraryId)
      const next = new Map<string, ProductAnalysisSnapshot>()
      for (const item of stored) {
        if (item.kind !== 'image' || item.productAnalysisVersion === undefined) continue
        const snapshot = productAnalysisSnapshot(item)
        next.set(item.id, snapshot)
        SESSION_ANALYSIS.set(analysisSessionKey(libraryId, item.id), snapshot)
      }
      setLocalAnalysis(next)
    } catch (cause) {
      setSaveError(`Product analysis was saved, but the local results could not be reloaded: ${messageOf(cause)}`)
    }
  }

  async function resolveLocalFile(item: LiteMediaRecord): Promise<File | null> {
    try {
      const sessionFile = sessionFiles.get(item.id)
      if (sessionFile) return sessionFile
      return item.fileHandle ? await item.fileHandle.getFile() : null
    } catch {
      return null
    }
  }

  async function updateOverride(item: LiteMediaRecord, override: boolean | null): Promise<void> {
    setSaveError(null)
    const priorItem = effectiveItems.find((candidate) => candidate.id === item.id)
    const result = setProductPhotoOverride(effectiveItems, item.id, override)
    if (!result.changed || !priorItem) return
    const sessionKey = overrideSessionKey(libraryId, item.id)
    const hadSessionValue = SESSION_OVERRIDES.has(sessionKey)
    const priorSessionValue = SESSION_OVERRIDES.get(sessionKey)
    SESSION_OVERRIDES.set(sessionKey, override)
    setLocalOverrides((current) => new Map(current).set(item.id, override))
    try {
      await putMediaRecords([result.changed])
      notifyLibraryStateChanged()
      registerUndo(productOverrideUndoLabel(override), async () => {
        await putMediaRecords([priorItem])
        if (hadSessionValue) SESSION_OVERRIDES.set(sessionKey, priorSessionValue ?? null)
        else SESSION_OVERRIDES.delete(sessionKey)
        setLocalOverrides(sessionOverridesForLibrary(libraryId))
      })
    } catch (cause) {
      if (hadSessionValue) SESSION_OVERRIDES.set(sessionKey, priorSessionValue ?? null)
      else SESSION_OVERRIDES.delete(sessionKey)
      setLocalOverrides(sessionOverridesForLibrary(libraryId))
      setSaveError(`The correction could not be saved: ${messageOf(cause)}`)
    }
  }

  return (
    <section className="product-photos-section compact-mode-section">
      {saveError && <div className="notice error inline-notice">{saveError}</div>}

      <div className="product-photos-workspace">
        <div className="product-photos-browser">
          <div className="product-photos-browser-toolbar">
            <div>
              <strong>{visibleItems.length.toLocaleString()} {resultFilterLabel(filter)}</strong>
              <span className="muted">{matches.length.toLocaleString()} likely product photos total · review decisions stay separate from this category.</span>
            </div>
          </div>

          {matches.length === 0 && filter !== 'excluded' && (
            <div className="compact-empty-state">
              <strong>{semanticAnalyzed === 0 ? 'Run semantic product analysis to get reliable matches.' : 'No likely product photos at this sensitivity.'}</strong>
              <span>{semanticAnalyzed === 0 ? 'Similarity and photo-series data deliberately cannot classify ordinary family bursts as product photos anymore.' : 'Try Broad sensitivity to review weaker semantic candidates, or manually mark a known product photo.'}</span>
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
        </div>

        <aside className="product-photo-inspector smart-category-settings">
          <div className="smart-category-settings-copy">
            <span className="inspector-label">Product photo detection</span>
            <h3>Keep sale photos together, not mixed into family moments</h3>
            <p>Semantic image understanding decides whether a photo actually looks like a sale/product photo. Similarity, short series and People analysis only refine that decision. Nothing is deleted or rejected automatically.</p>
            <div className="collection-action-buttons">
              <button
                type="button"
                className={analysisBusy ? 'danger-outline' : 'primary'}
                disabled={!analysisBusy && !hasLocalFileAccess}
                onClick={analysisBusy ? () => analysisAbortRef.current?.abort() : () => void runSemanticAnalysis()}
              >
                {analysisBusy ? 'Stop product analysis' : semanticAnalyzed > 0 ? 'Refresh product analysis' : 'Analyze product photos'}
              </button>
              <span className="muted">{semanticAnalyzed.toLocaleString()} / {effectiveItems.length.toLocaleString()} semantically analyzed{semanticFailed ? ` · ${semanticFailed.toLocaleString()} failed` : ''}</span>
            </div>
            {!hasLocalFileAccess && <p className="muted">Reconnect the source folder before running semantic analysis. Existing cached results remain usable.</p>}
          </div>

          {analysisProgress && (
            <div className="analysis-progress product-analysis-progress">
              <div>
                <strong>{analysisProgress.phase === 'model' ? 'Loading semantic model' : 'Understanding product photos locally'}</strong>
                <span>{analysisProgress.complete.toLocaleString()} / {analysisProgress.total.toLocaleString()} · {analysisProgress.reused.toLocaleString()} reused{analysisProgress.failed ? ` · ${analysisProgress.failed.toLocaleString()} failed` : ''}</span>
              </div>
              <progress max={Math.max(1, analysisProgress.total)} value={analysisProgress.complete} />
              <span className="muted" title={analysisProgress.currentPath}>{analysisProgress.currentPath}</span>
            </div>
          )}

          <div className="smart-result-filter-panel">
            <span className="inspector-label">View results</span>
            <div className="smart-result-filters vertical" role="group" aria-label="Product photo result filter">
              <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All <span>{matches.length.toLocaleString()}</span></button>
              <button type="button" className={filter === 'strong' ? 'active' : ''} onClick={() => setFilter('strong')}>Strong <span>{strongCount.toLocaleString()}</span></button>
              {manualCount > 0 && <button type="button" className={filter === 'manual' ? 'active' : ''} onClick={() => setFilter('manual')}>Added by you <span>{manualCount.toLocaleString()}</span></button>}
              <button type="button" className={filter === 'excluded' ? 'active' : ''} onClick={() => setFilter('excluded')}>Excluded <span>{excludedItems.length.toLocaleString()}</span></button>
            </div>
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
              <span><strong>Recognize photo series</strong><small>Boost an already plausible product photo when related shots appear together.</small></span>
            </label>
            <label>
              <input type="checkbox" checked={settings.preferNoPeople} onChange={(event) => updateSettings({ ...settings, preferNoPeople: event.target.checked })} />
              <span><strong>Prefer photos without people</strong><small>Use People analysis as an optional extra signal when available. It is not required.</small></span>
            </label>
          </div>

          <details className="smart-category-details">
            <summary><span>Fine tune & explain</span><strong>{Math.round(threshold * 100)}% final threshold</strong></summary>
            <div className="smart-category-detail-grid">
              <div><strong>Semantic signal</strong><span>{semanticAnalyzed.toLocaleString()} of {effectiveItems.length.toLocaleString()} photos analyzed. Balanced requires at least {Math.round(semanticFloor * 100)}% semantic product evidence before boosters count.</span></div>
              <div><strong>Series signal</strong><span>{similarityAnalyzed.toLocaleString()} photos have visual similarity data. Series can strengthen a match but can no longer create one by itself.</span></div>
              <div><strong>People signal</strong><span>{peopleAnalyzed.toLocaleString()} photos have face-analysis data. Missing People data is neutral; detected people reduce product confidence.</span></div>
              <div><strong>Model</strong><span>{PRODUCT_MODEL_ID}. The model is downloaded on first use and cached by the browser; photo bytes are processed locally and are not uploaded.</span></div>
              <div><strong>Looks like a product</strong><span>{PRODUCT_POSITIVE_PROMPTS.join(' · ')}</span></div>
              <div><strong>Looks like a memory</strong><span>{PRODUCT_NEGATIVE_PROMPTS.join(' · ')}</span></div>
              <div><strong>Manual corrections</strong><span>{manualCount.toLocaleString()} included · {excludedItems.length.toLocaleString()} excluded. Corrections persist in the local PhotoFind index.</span></div>
            </div>
          </details>
        </aside>
      </div>
    </section>
  )
}

function loadProductSettings(libraryId: string): LiteProductPhotoSettings {
  if (!libraryId) return DEFAULT_SMART_CATEGORY_SETTINGS.productPhotos
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${libraryId}`)
    if (!raw) return DEFAULT_SMART_CATEGORY_SETTINGS.productPhotos
    return normalizeSmartCategorySettings(JSON.parse(raw) as never).productPhotos
  } catch {
    return DEFAULT_SMART_CATEGORY_SETTINGS.productPhotos
  }
}

function sessionOverridesForLibrary(libraryId: string): Map<string, boolean | null> {
  const output = new Map<string, boolean | null>()
  if (!libraryId) return output
  const prefix = `${libraryId}:`
  for (const [key, value] of SESSION_OVERRIDES) if (key.startsWith(prefix)) output.set(key.slice(prefix.length), value)
  return output
}

function sessionAnalysisForLibrary(libraryId: string): Map<string, ProductAnalysisSnapshot> {
  const output = new Map<string, ProductAnalysisSnapshot>()
  if (!libraryId) return output
  const prefix = `${libraryId}:`
  for (const [key, value] of SESSION_ANALYSIS) if (key.startsWith(prefix)) output.set(key.slice(prefix.length), value)
  return output
}

function productAnalysisSnapshot(item: LiteMediaRecord): ProductAnalysisSnapshot {
  return {
    productAnalysisVersion: item.productAnalysisVersion,
    productAnalysisStatus: item.productAnalysisStatus,
    productAnalysisFingerprint: item.productAnalysisFingerprint,
    productSemanticScore: item.productSemanticScore,
    productSemanticLabel: item.productSemanticLabel,
    productSemanticNegativeLabel: item.productSemanticNegativeLabel,
    productAnalysisError: item.productAnalysisError,
    productAnalyzedAt: item.productAnalyzedAt
  }
}

function overrideSessionKey(libraryId: string, itemId: string): string {
  return `${libraryId}:${itemId}`
}

function analysisSessionKey(libraryId: string, itemId: string): string {
  return `${libraryId}:${itemId}`
}

function resultFilterLabel(filter: MatchFilter): string {
  if (filter === 'strong') return 'strong matches'
  if (filter === 'manual') return 'photos added by you'
  if (filter === 'excluded') return 'excluded photos'
  return 'matching photos'
}

function productOverrideUndoLabel(override: boolean | null): string {
  if (override === false) return 'Exclude product photo'
  if (override === true) return 'Include product photo'
  return 'Restore automatic product detection'
}

function isAbort(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError'
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Something went wrong.'
}
