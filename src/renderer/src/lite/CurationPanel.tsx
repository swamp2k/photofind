import { useEffect, useMemo, useRef, useState } from 'react'
import { buildExportSelection, splitEventsForExportFilter, type ExportSelectionScope } from './curationSelection'
import { applyKnownDateOverrides, isKnownDateOverride } from './eventOverrides'
import {
  DEFAULT_EXPORT_FOLDER_TEMPLATE,
  EXPORT_FOLDER_TEMPLATE_PRESETS,
  EXPORT_FOLDER_TEMPLATE_TOKENS,
  previewExportFolderTemplate,
  validateExportFolderTemplate
} from './exportPathTemplate'
import { loadEventOverrides } from './libraryDb'
import { LocalThumbnail } from './LocalThumbnail'
import { PhotoLightbox } from './PhotoLightbox'
import { PhotoSelectionBar, useExplorerPhotoSelection } from './PhotoSelection'
import { ReviewControls } from './ReviewControls'
import { reviewStateOf } from './review'
import type { LiteEventOverride, LiteEventRecord, LiteExportLayout, LiteExportProgress, LiteExportResult, LiteMediaRecord, LiteReviewState } from './types'

interface CurationPanelProps {
  items: LiteMediaRecord[]
  events: LiteEventRecord[]
  sessionFiles: Map<string, File>
  exportSupported: boolean
  reconnectRequired: boolean
  busy: boolean
  progress: LiteExportProgress | null
  result: LiteExportResult | null
  batchSize: number
  flowLoading: boolean
  onReview(item: LiteMediaRecord, state: LiteReviewState): void
  onExport(items: LiteMediaRecord[], layout: LiteExportLayout, includeReports: boolean, embedMetadata: boolean, includeEventName: boolean, preserveModifiedDates: boolean): void
}

const SCOPE_LABELS: Record<ExportSelectionScope, string> = {
  keep: 'Keep',
  maybe: 'Maybe',
  known: 'Known dates & holidays'
}

export function CurationPanel(props: CurationPanelProps): JSX.Element {
  const [scopes, setScopes] = useState<Set<ExportSelectionScope>>(() => new Set(['keep', 'known']))
  const [eventFilter, setEventFilter] = useState('')
  const [folderTemplate, setFolderTemplate] = useState(DEFAULT_EXPORT_FOLDER_TEMPLATE)
  const [includeReports, setIncludeReports] = useState(true)
  const [embedMetadata, setEmbedMetadata] = useState(true)
  const [preserveModifiedDates, setPreserveModifiedDates] = useState(true)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [visibleCount, setVisibleCount] = useState(props.batchSize)
  const [knownOverrides, setKnownOverrides] = useState<LiteEventOverride[]>([])
  const [knownOverrideError, setKnownOverrideError] = useState<string | null>(null)
  const templateInputRef = useRef<HTMLInputElement | null>(null)
  const flowSentinelRef = useRef<HTMLDivElement | null>(null)
  const libraryId = props.events[0]?.libraryId ?? props.items[0]?.libraryId ?? null
  const effectiveEvents = useMemo(() => applyKnownDateOverrides(props.events, knownOverrides), [knownOverrides, props.events])
  const eventGroups = useMemo(() => splitEventsForExportFilter(effectiveEvents), [effectiveEvents])
  const selectedEvent = useMemo(() => effectiveEvents.find((event) => event.id === eventFilter) ?? null, [effectiveEvents, eventFilter])
  const keep = useMemo(() => props.items.filter((item) => item.kind === 'image' && reviewStateOf(item) === 'keep'), [props.items])
  const maybe = useMemo(() => props.items.filter((item) => item.kind === 'image' && reviewStateOf(item) === 'maybe'), [props.items])
  const knownPhotos = useMemo(() => buildExportSelection(props.items, new Set<ExportSelectionScope>(['known']), eventGroups.known), [eventGroups.known, props.items])
  const filteredKeep = useMemo(() => buildExportSelection(props.items, new Set<ExportSelectionScope>(['keep']), eventGroups.known, selectedEvent), [eventGroups.known, props.items, selectedEvent])
  const filteredMaybe = useMemo(() => buildExportSelection(props.items, new Set<ExportSelectionScope>(['maybe']), eventGroups.known, selectedEvent), [eventGroups.known, props.items, selectedEvent])
  const filteredKnown = useMemo(() => buildExportSelection(props.items, new Set<ExportSelectionScope>(['known']), eventGroups.known, selectedEvent), [eventGroups.known, props.items, selectedEvent])
  const selected = useMemo(() => buildExportSelection(props.items, scopes, eventGroups.known, selectedEvent), [eventGroups.known, props.items, scopes, selectedEvent])
  const selection = useExplorerPhotoSelection(selected)
  const eventByItemId = useMemo(() => {
    const map = new Map<string, LiteEventRecord>()
    for (const event of effectiveEvents) for (const id of event.itemIds) map.set(id, event)
    return map
  }, [effectiveEvents])
  const templateError = validateExportFolderTemplate(folderTemplate)
  const previewItem = selected[0] ?? keep[0] ?? knownPhotos[0]
  const previewEventName = previewItem ? eventByItemId.get(previewItem.id)?.title : undefined
  const templatePreview = previewExportFolderTemplate(previewItem, folderTemplate, previewEventName)
  const automaticFlow = props.flowLoading && typeof IntersectionObserver !== 'undefined'
  const hasMore = visibleCount < selected.length
  const scopeKey = [...scopes].sort().join(',')
  const scopeSummary = [...scopes].map((scope) => SCOPE_LABELS[scope]).join(' + ') || 'Nothing selected'

  useEffect(() => {
    let disposed = false
    setKnownOverrideError(null)
    if (!libraryId) {
      setKnownOverrides([])
      return () => { disposed = true }
    }
    void loadEventOverrides(libraryId)
      .then((overrides) => {
        if (!disposed) setKnownOverrides(overrides.filter(isKnownDateOverride))
      })
      .catch((cause) => {
        if (!disposed) setKnownOverrideError(`Known-event classifications could not be loaded: ${messageOf(cause)}`)
      })
    return () => { disposed = true }
  }, [libraryId])

  useEffect(() => {
    setVisibleCount(props.batchSize)
    setOpenIndex(null)
  }, [eventFilter, props.batchSize, scopeKey])

  useEffect(() => {
    if (!automaticFlow || !hasMore) return
    const target = flowSentinelRef.current
    if (!target) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisibleCount((count) => Math.min(selected.length, count + props.batchSize))
      }
    }, { rootMargin: '600px 0px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [automaticFlow, hasMore, props.batchSize, selected.length, visibleCount])

  function toggleScope(scope: ExportSelectionScope): void {
    setScopes((current) => {
      const next = new Set(current)
      if (next.has(scope)) next.delete(scope)
      else next.add(scope)
      return next
    })
  }

  function insertToken(token: string): void {
    const input = templateInputRef.current
    if (!input) {
      setFolderTemplate((value) => `${value}${token}`)
      return
    }
    const start = input.selectionStart ?? folderTemplate.length
    const end = input.selectionEnd ?? start
    const next = `${folderTemplate.slice(0, start)}${token}${folderTemplate.slice(end)}`
    setFolderTemplate(next)
    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(start + token.length, start + token.length)
    })
  }

  function startExport(): void {
    if (templateError) return
    // Keep the existing export API stable while marking this value explicitly as a template.
    const encodedTemplate = `template:${folderTemplate}` as LiteExportLayout
    props.onExport(selected, encodedTemplate, includeReports, embedMetadata, folderTemplate.includes('{EVENT}'), preserveModifiedDates)
  }

  return (
    <section className="curation-section">
      <div className="curation-hero">
        <div>
          <span className="mode-kicker">Finished selection</span>
          <h2>Export tray</h2>
          <p>Review the exact photos leaving PhotoFind. Combine Keep, Maybe and explicitly saved known events, then optionally narrow the result to one event.</p>
        </div>
        <div className="curation-counts"><strong>{keep.length.toLocaleString()}</strong><span>Keep</span><strong>{maybe.length.toLocaleString()}</strong><span>Maybe</span><strong>{knownPhotos.length.toLocaleString()}</strong><span>Known event photos</span></div>
      </div>

      <div className="export-card">
        <div className="export-card-heading"><div><h3>Export local copies</h3><p>Build the folder structure from placeholders. Anything outside a placeholder is literal custom text.</p></div><span className="local-only-pill">Local write</span></div>
        <div className="export-controls">
          <div className="export-scope-control">
            <span>Selection</span>
            <details className="export-scope-menu">
              <summary><strong>{scopeSummary}</strong><small>{selected.length.toLocaleString()} photos</small></summary>
              <div className="export-scope-options">
                <label><input type="checkbox" checked={scopes.has('keep')} onChange={() => toggleScope('keep')} /><span><strong>Keep</strong><small>{filteredKeep.length.toLocaleString()} photos</small></span></label>
                <label><input type="checkbox" checked={scopes.has('maybe')} onChange={() => toggleScope('maybe')} /><span><strong>Maybe</strong><small>{filteredMaybe.length.toLocaleString()} photos</small></span></label>
                <label><input type="checkbox" checked={scopes.has('known')} onChange={() => toggleScope('known')} /><span><strong>Known dates & holidays</strong><small>{filteredKnown.length.toLocaleString()} photos in {eventGroups.known.length.toLocaleString()} events</small></span></label>
              </div>
            </details>
          </div>

          <label>Event filter
            <select value={eventFilter} onChange={(event) => { setEventFilter(event.target.value); selection.clear() }}>
              <option value="">All events</option>
              {eventGroups.known.map((event) => <option value={event.id} key={`known-${event.id}`}>{event.title} · {event.itemIds.length} photos</option>)}
              {eventGroups.known.length > 0 && eventGroups.detected.length > 0 && <option disabled>──────────</option>}
              {eventGroups.detected.map((event) => <option value={event.id} key={`detected-${event.id}`}>{event.title} · {event.itemIds.length} photos</option>)}
            </select>
          </label>

          <div className="export-template-editor">
            <div className="export-template-heading">
              <label htmlFor="export-folder-template">Folder template</label>
              <select aria-label="Folder template preset" defaultValue="" onChange={(event) => { if (event.target.value !== '__choose__') setFolderTemplate(event.target.value); event.currentTarget.value = '__choose__' }}>
                <option value="__choose__">Presets…</option>
                {EXPORT_FOLDER_TEMPLATE_PRESETS.map((preset) => <option value={preset.value} key={preset.label}>{preset.label}</option>)}
              </select>
            </div>
            <input
              ref={templateInputRef}
              id="export-folder-template"
              className={templateError ? 'template-input invalid' : 'template-input'}
              value={folderTemplate}
              onChange={(event) => setFolderTemplate(event.target.value)}
              spellCheck={false}
              placeholder="{YYYY}/{YYYY}.{MM} - {EVENT}"
            />
            <div className="template-token-row" aria-label="Insert folder placeholder">
              {EXPORT_FOLDER_TEMPLATE_TOKENS.map((token) => <button type="button" className="token-button" key={token} onClick={() => insertToken(token)}>{token}</button>)}
              <span>Custom text is written directly in the template.</span>
            </div>
            <div className={templateError ? 'template-preview invalid' : 'template-preview'}>
              <span>{templateError ? 'Template error' : 'Preview'}</span>
              <code>{templateError ?? templatePreview}</code>
            </div>
            <small><strong>{'{EVENT}'}</strong> uses the title of a meaningful or Known event. Photos without an event automatically fall back to the same template with the empty event suffix removed.</small>
          </div>

          <label className="check-label export-option">
            <input type="checkbox" checked={embedMetadata} onChange={(event) => setEmbedMetadata(event.target.checked)} />
            <span><strong>Embed repaired metadata</strong><small>JPEG copies receive reliable capture/GPS metadata and the original modified-time hint. Other formats get XMP.</small></span>
          </label>
          <label className="check-label export-option">
            <input type="checkbox" checked={preserveModifiedDates} onChange={(event) => setPreserveModifiedDates(event.target.checked)} />
            <span><strong>Preserve filesystem modified dates</strong><small>The browser cannot set filesystem mtime itself, so PhotoFind writes a restoration pack (Python + PowerShell) beside the export.</small></span>
          </label>
          <label className="check-label export-option">
            <input type="checkbox" checked={includeReports} onChange={(event) => setIncludeReports(event.target.checked)} />
            <span><strong>Write selection reports</strong><small>Standalone JSON and readable HTML summaries.</small></span>
          </label>
          <button className="primary export-submit" type="button" disabled={props.busy || selected.length === 0 || !props.exportSupported || props.reconnectRequired || Boolean(templateError)} onClick={startExport}>
            {props.busy ? 'Exporting…' : `Export ${selected.length.toLocaleString()} photos`}
          </button>
        </div>
        {knownOverrideError && <div className="notice error inline-notice">{knownOverrideError}</div>}
        {!props.exportSupported && <div className="notice warning inline-notice">This browser cannot write directly to a chosen export folder. Use a Chromium browser exposing the File System Access API.</div>}
        {props.reconnectRequired && <div className="notice warning inline-notice">Reconnect the source folder before exporting originals.</div>}
        {props.progress && <ExportProgress progress={props.progress} />}
        {props.result && <ExportResult result={props.result} />}
      </div>

      <PhotoSelectionBar items={selection.selectedItems} onReview={(targets, state) => targets.forEach((item) => props.onReview(item, state))} onClear={selection.clear} />

      {selected.length === 0 ? (
        <div className="curation-empty"><h3>No photos match this export selection</h3><p>{eventFilter ? 'Choose another event, clear the event filter, or enable another Selection checkbox.' : 'Enable Keep, Maybe or Known dates & holidays above.'}</p></div>
      ) : (
        <>
          <div className="keeper-grid">
            {selected.slice(0, visibleCount).map((item, index) => {
              const isSelected = selection.isSelected(item.id)
              return <article className={isSelected ? 'keeper-card explorer-selected' : 'keeper-card'} key={item.id}>
                <button type="button" className="keeper-preview" aria-pressed={isSelected} onClick={(event) => selection.handlePhotoClick(event, item.id, () => setOpenIndex(index))}>
                  <LocalThumbnail item={item} sessionFile={props.sessionFiles.get(item.id)} />
                  {isSelected && <span className="selection-check">✓</span>}
                </button>
                <div className="keeper-card-body"><strong title={item.relativePath}>{item.name}</strong>{typeof item.qualityScore === 'number' && <span>Technical {item.qualityScore}/100</span>}<ReviewControls item={item} compact onReview={props.onReview} /></div>
              </article>
            })}
          </div>
          {hasMore && !automaticFlow && <button className="load-more" type="button" onClick={() => setVisibleCount((count) => Math.min(selected.length, count + props.batchSize))}>Show {Math.min(props.batchSize, selected.length - visibleCount).toLocaleString()} more</button>}
          {hasMore && automaticFlow && <div ref={flowSentinelRef} aria-hidden="true" style={{ height: 1 }} />}
          <p className="muted">Showing {Math.min(visibleCount, selected.length).toLocaleString()} of {selected.length.toLocaleString()} photos in the current export selection · {props.batchSize.toLocaleString()} per batch{automaticFlow ? ' · Flow on' : ''}.</p>
        </>
      )}

      {openIndex !== null && selected[openIndex] && (
        <PhotoLightbox items={selected} index={openIndex} sessionFiles={props.sessionFiles} onIndex={setOpenIndex} onClose={() => setOpenIndex(null)} onReview={props.onReview} />
      )}
    </section>
  )
}

function ExportProgress({ progress }: { progress: LiteExportProgress }): JSX.Element {
  return <div className="analysis-progress export-progress"><div><strong>{progress.complete.toLocaleString()} / {progress.total.toLocaleString()}</strong><span>{progress.exported.toLocaleString()} copied · {progress.metadataEmbedded.toLocaleString()} metadata embedded · {progress.sidecarsWritten.toLocaleString()} XMP · {progress.failed.toLocaleString()} failed</span></div><progress max={Math.max(1, progress.total)} value={progress.complete} /><span className="muted" title={progress.currentPath}>{progress.currentPath}</span></div>
}

function ExportResult({ result }: { result: LiteExportResult }): JSX.Element {
  return <div className={result.failures.length > 0 ? 'export-result warning' : 'export-result success'}>
    <strong>{result.exported.toLocaleString()} photos exported</strong>
    <span>{result.metadataEmbedded.toLocaleString()} JPEG files received embedded normalized metadata · {result.sidecarsWritten.toLocaleString()} XMP sidecars written · {result.metadataUnchanged.toLocaleString()} copied with existing metadata unchanged.</span>
    <span>{result.renamed.toLocaleString()} filenames were safely renamed to avoid overwriting existing files.</span>
    {result.timestampRestoreCount > 0 && <span><strong>Modified dates:</strong> best known photo dates for {result.timestampRestoreCount.toLocaleString()} exported photos are recorded. Run the included Python script on Linux/macOS or PowerShell script on Windows to apply them to the exported files.</span>}
    {result.timestampRestoreFiles?.map((path) => <span key={path}>Timestamp helper: {path}</span>)}
    {result.manifestPath && <span>JSON report: {result.manifestPath}</span>}{result.reportPath && <span>HTML report: {result.reportPath}</span>}
    {result.failures.length > 0 && <details><summary>{result.failures.length.toLocaleString()} export notices or failures</summary><ul>{result.failures.slice(0, 30).map((failure) => <li key={failure.itemId}>{failure.relativePath}: {failure.message}</li>)}</ul></details>}
  </div>
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Something went wrong.'
}