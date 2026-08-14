import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_EXPORT_FOLDER_TEMPLATE,
  EXPORT_FOLDER_TEMPLATE_PRESETS,
  EXPORT_FOLDER_TEMPLATE_TOKENS,
  previewExportFolderTemplate,
  validateExportFolderTemplate
} from './exportPathTemplate'
import { LocalThumbnail } from './LocalThumbnail'
import { PhotoLightbox } from './PhotoLightbox'
import { PhotoSelectionBar, useExplorerPhotoSelection } from './PhotoSelection'
import { ReviewControls } from './ReviewControls'
import { reviewStateOf } from './review'
import type { LiteEventRecord, LiteExportLayout, LiteExportProgress, LiteExportResult, LiteMediaRecord, LiteReviewState } from './types'

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

type ExportScope = 'keep' | 'keep-maybe'

export function CurationPanel(props: CurationPanelProps): JSX.Element {
  const [scope, setScope] = useState<ExportScope>('keep')
  const [eventFilter, setEventFilter] = useState('')
  const [folderTemplate, setFolderTemplate] = useState(DEFAULT_EXPORT_FOLDER_TEMPLATE)
  const [includeReports, setIncludeReports] = useState(true)
  const [embedMetadata, setEmbedMetadata] = useState(true)
  const [preserveModifiedDates, setPreserveModifiedDates] = useState(true)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [visibleCount, setVisibleCount] = useState(props.batchSize)
  const templateInputRef = useRef<HTMLInputElement | null>(null)
  const flowSentinelRef = useRef<HTMLDivElement | null>(null)
  const keep = useMemo(() => props.items.filter((item) => item.kind === 'image' && reviewStateOf(item) === 'keep'), [props.items])
  const maybe = useMemo(() => props.items.filter((item) => item.kind === 'image' && reviewStateOf(item) === 'maybe'), [props.items])
  const eventByItemId = useMemo(() => {
    const map = new Map<string, LiteEventRecord>()
    for (const event of props.events) for (const id of event.itemIds) map.set(id, event)
    return map
  }, [props.events])
  const filteredKeep = useMemo(() => keep.filter((item) => !eventFilter || eventByItemId.get(item.id)?.id === eventFilter), [keep, eventFilter, eventByItemId])
  const filteredMaybe = useMemo(() => maybe.filter((item) => !eventFilter || eventByItemId.get(item.id)?.id === eventFilter), [maybe, eventFilter, eventByItemId])
  const selected = scope === 'keep' ? filteredKeep : [...filteredKeep, ...filteredMaybe]
  const selection = useExplorerPhotoSelection(filteredKeep)
  const sortedEvents = useMemo(() => [...props.events].sort((a, b) => a.startTime - b.startTime || a.title.localeCompare(b.title)), [props.events])
  const templateError = validateExportFolderTemplate(folderTemplate)
  const previewItem = selected[0] ?? filteredKeep[0] ?? keep[0]
  const previewEventName = previewItem ? eventByItemId.get(previewItem.id)?.customTitle : undefined
  const templatePreview = previewExportFolderTemplate(previewItem, folderTemplate, previewEventName)
  const automaticFlow = props.flowLoading && typeof IntersectionObserver !== 'undefined'
  const hasMore = visibleCount < filteredKeep.length

  useEffect(() => {
    setVisibleCount(props.batchSize)
  }, [eventFilter, props.batchSize])

  useEffect(() => {
    if (!automaticFlow || !hasMore) return
    const target = flowSentinelRef.current
    if (!target) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisibleCount((count) => Math.min(filteredKeep.length, count + props.batchSize))
      }
    }, { rootMargin: '600px 0px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [automaticFlow, filteredKeep.length, hasMore, props.batchSize, visibleCount])

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
          <h2>Keeper tray</h2>
          <p>Review the exact photos leaving PhotoFind. Click to preview; Ctrl-click or Shift-click to select photos for bulk actions.</p>
        </div>
        <div className="curation-counts"><strong>{keep.length.toLocaleString()}</strong><span>Keep</span><strong>{maybe.length.toLocaleString()}</strong><span>Maybe</span></div>
      </div>

      <div className="export-card">
        <div className="export-card-heading"><div><h3>Export local copies</h3><p>Build the folder structure from placeholders. Anything outside a placeholder is literal custom text.</p></div><span className="local-only-pill">Local write</span></div>
        <div className="export-controls">
          <label>Selection
            <select value={scope} onChange={(event) => setScope(event.target.value as ExportScope)}>
              <option value="keep">Keep only ({filteredKeep.length.toLocaleString()})</option>
              <option value="keep-maybe">Keep + Maybe ({(filteredKeep.length + filteredMaybe.length).toLocaleString()})</option>
            </select>
          </label>
          <label>Event filter
            <select value={eventFilter} onChange={(event) => { setEventFilter(event.target.value); setOpenIndex(null); selection.clear() }}>
              <option value="">All events</option>
              {sortedEvents.map((event) => <option value={event.id} key={event.id}>{event.title} · {event.itemIds.length} photos</option>)}
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
              placeholder="{YYYY}/{MM} - {EVENT}"
            />
            <div className="template-token-row" aria-label="Insert folder placeholder">
              {EXPORT_FOLDER_TEMPLATE_TOKENS.map((token) => <button type="button" className="token-button" key={token} onClick={() => insertToken(token)}>{token}</button>)}
              <span>Custom text is written directly in the template.</span>
            </div>
            <div className={templateError ? 'template-preview invalid' : 'template-preview'}>
              <span>{templateError ? 'Template error' : 'Preview'}</span>
              <code>{templateError ?? templatePreview}</code>
            </div>
            <small><strong>{'{EVENT}'}</strong> uses only an event name you explicitly assigned. If no name exists, PhotoFind removes the empty placeholder and trailing separators cleanly.</small>
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
        {!props.exportSupported && <div className="notice warning inline-notice">This browser cannot write directly to a chosen export folder. Use a Chromium browser exposing the File System Access API.</div>}
        {props.reconnectRequired && <div className="notice warning inline-notice">Reconnect the source folder before exporting originals.</div>}
        {props.progress && <ExportProgress progress={props.progress} />}
        {props.result && <ExportResult result={props.result} />}
      </div>

      <PhotoSelectionBar items={selection.selectedItems} onReview={(targets, state) => targets.forEach((item) => props.onReview(item, state))} onClear={selection.clear} />

      {filteredKeep.length === 0 ? (
        <div className="curation-empty"><h3>{eventFilter ? 'No keepers in this event' : 'No keepers yet'}</h3><p>{eventFilter ? 'Choose another event or clear the event filter.' : 'Use Library, Review, Quality or Compare to mark photos as Keep. They appear here immediately.'}</p></div>
      ) : (
        <>
          <div className="keeper-grid">
            {filteredKeep.slice(0, visibleCount).map((item, index) => {
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
          {hasMore && !automaticFlow && <button className="load-more" type="button" onClick={() => setVisibleCount((count) => Math.min(filteredKeep.length, count + props.batchSize))}>Show {Math.min(props.batchSize, filteredKeep.length - visibleCount).toLocaleString()} more</button>}
          {hasMore && automaticFlow && <div ref={flowSentinelRef} aria-hidden="true" style={{ height: 1 }} />}
          <p className="muted">Showing {Math.min(visibleCount, filteredKeep.length).toLocaleString()} of {filteredKeep.length.toLocaleString()} keepers · {props.batchSize.toLocaleString()} per batch{automaticFlow ? ' · Flow on' : ''}. All matching keepers remain included in export scope.</p>
        </>
      )}

      {openIndex !== null && filteredKeep[openIndex] && (
        <PhotoLightbox items={filteredKeep} index={openIndex} sessionFiles={props.sessionFiles} onIndex={setOpenIndex} onClose={() => setOpenIndex(null)} onReview={props.onReview} />
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
    {result.timestampRestoreCount > 0 && <span><strong>Modified dates:</strong> original filesystem mtimes for {result.timestampRestoreCount.toLocaleString()} exported photos are recorded. Run the included Python script on Linux/macOS or PowerShell script on Windows to apply them to the exported files.</span>}
    {result.timestampRestoreFiles?.map((path) => <span key={path}>Timestamp helper: {path}</span>)}
    {result.manifestPath && <span>JSON report: {result.manifestPath}</span>}{result.reportPath && <span>HTML report: {result.reportPath}</span>}
    {result.failures.length > 0 && <details><summary>{result.failures.length.toLocaleString()} export notices or failures</summary><ul>{result.failures.slice(0, 30).map((failure) => <li key={failure.itemId}>{failure.relativePath}: {failure.message}</li>)}</ul></details>}
  </div>
}
