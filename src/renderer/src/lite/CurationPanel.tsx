import { useMemo, useState } from 'react'
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
  onReview(item: LiteMediaRecord, state: LiteReviewState): void
  onExport(items: LiteMediaRecord[], layout: LiteExportLayout, includeReports: boolean, embedMetadata: boolean, includeEventName: boolean, preserveModifiedDates: boolean): void
}

type ExportScope = 'keep' | 'keep-maybe'

export function CurationPanel(props: CurationPanelProps): JSX.Element {
  const [scope, setScope] = useState<ExportScope>('keep')
  const [layout, setLayout] = useState<LiteExportLayout>('date-day')
  const [eventFilter, setEventFilter] = useState('')
  const [includeEventName, setIncludeEventName] = useState(true)
  const [includeReports, setIncludeReports] = useState(true)
  const [embedMetadata, setEmbedMetadata] = useState(true)
  const [preserveModifiedDates, setPreserveModifiedDates] = useState(true)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const keep = useMemo(() => props.items.filter((item) => item.kind === 'image' && reviewStateOf(item) === 'keep'), [props.items])
  const maybe = useMemo(() => props.items.filter((item) => item.kind === 'image' && reviewStateOf(item) === 'maybe'), [props.items])
  const eventByItemId = useMemo(() => {
    const map = new Map<string, string>()
    for (const event of props.events) for (const id of event.itemIds) map.set(id, event.id)
    return map
  }, [props.events])
  const eventMatches = (item: LiteMediaRecord): boolean => !eventFilter || eventByItemId.get(item.id) === eventFilter
  const filteredKeep = useMemo(() => keep.filter(eventMatches), [keep, eventFilter, eventByItemId])
  const filteredMaybe = useMemo(() => maybe.filter(eventMatches), [maybe, eventFilter, eventByItemId])
  const selected = scope === 'keep' ? filteredKeep : [...filteredKeep, ...filteredMaybe]
  const selection = useExplorerPhotoSelection(filteredKeep)
  const dateLayout = layout === 'date-day' || layout === 'date-month'
  const sortedEvents = useMemo(() => [...props.events].sort((a, b) => a.startTime - b.startTime || a.title.localeCompare(b.title)), [props.events])

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
        <div className="export-card-heading"><div><h3>Export local copies</h3><p>Filter by event, build readable date/event folders, and preserve the original time hints PhotoFind knows about.</p></div><span className="local-only-pill">Local write</span></div>
        <div className="export-controls">
          <label>Selection
            <select value={scope} onChange={(event) => setScope(event.target.value as ExportScope)}>
              <option value="keep">Keep only ({filteredKeep.length.toLocaleString()})</option>
              <option value="keep-maybe">Keep + Maybe ({(filteredKeep.length + filteredMaybe.length).toLocaleString()})</option>
            </select>
          </label>
          <label>Event
            <select value={eventFilter} onChange={(event) => { setEventFilter(event.target.value); setOpenIndex(null); selection.clear() }}>
              <option value="">All events</option>
              {sortedEvents.map((event) => <option value={event.id} key={event.id}>{event.title} · {event.itemIds.length} photos</option>)}
            </select>
          </label>
          <label>Folder layout
            <select value={layout} onChange={(event) => setLayout(event.target.value as LiteExportLayout)}>
              <option value="date-day">Year / month / day</option>
              <option value="date-month">Year / month</option>
              <option value="source-folders">Preserve source folders</option>
              <option value="flat">One flat folder</option>
            </select>
          </label>
          <label className="check-label export-option">
            <input type="checkbox" checked={includeEventName} disabled={!dateLayout} onChange={(event) => setIncludeEventName(event.target.checked)} />
            <span><strong>Include named event in month folder</strong><small>{dateLayout ? 'Example: 2011 / 06 - Motorcycle trip. Only events you explicitly renamed are included.' : 'Available with Year/month date layouts.'}</small></span>
          </label>
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
          <button className="primary export-submit" type="button" disabled={props.busy || selected.length === 0 || !props.exportSupported || props.reconnectRequired} onClick={() => props.onExport(selected, layout, includeReports, embedMetadata, dateLayout && includeEventName, preserveModifiedDates)}>
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
        <div className="keeper-grid">
          {filteredKeep.slice(0, 300).map((item, index) => {
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
      )}
      {filteredKeep.length > 300 && <p className="muted">Showing the first 300 keepers for this filter. All {filteredKeep.length.toLocaleString()} matching keepers are included in export scope.</p>}

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
