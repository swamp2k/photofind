import { useMemo, useState } from 'react'
import { LocalThumbnail } from './LocalThumbnail'
import { PhotoLightbox } from './PhotoLightbox'
import { ReviewControls } from './ReviewControls'
import { reviewStateOf } from './review'
import type { LiteExportLayout, LiteExportProgress, LiteExportResult, LiteMediaRecord, LiteReviewState } from './types'

interface CurationPanelProps {
  items: LiteMediaRecord[]
  sessionFiles: Map<string, File>
  exportSupported: boolean
  reconnectRequired: boolean
  busy: boolean
  progress: LiteExportProgress | null
  result: LiteExportResult | null
  onReview(item: LiteMediaRecord, state: LiteReviewState): void
  onExport(items: LiteMediaRecord[], layout: LiteExportLayout, includeReports: boolean, embedMetadata: boolean): void
}

type ExportScope = 'keep' | 'keep-maybe'

export function CurationPanel(props: CurationPanelProps): JSX.Element {
  const [scope, setScope] = useState<ExportScope>('keep')
  const [layout, setLayout] = useState<LiteExportLayout>('date-day')
  const [includeReports, setIncludeReports] = useState(true)
  const [embedMetadata, setEmbedMetadata] = useState(true)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const keep = useMemo(() => props.items.filter((item) => item.kind === 'image' && reviewStateOf(item) === 'keep'), [props.items])
  const maybe = useMemo(() => props.items.filter((item) => item.kind === 'image' && reviewStateOf(item) === 'maybe'), [props.items])
  const selected = scope === 'keep' ? keep : [...keep, ...maybe]

  return (
    <section className="curation-section">
      <div className="curation-hero">
        <div>
          <span className="mode-kicker">Finished selection</span>
          <h2>Keeper tray</h2>
          <p>Review the exact photos leaving PhotoFind. Export writes only to a folder you choose and never changes the source collection.</p>
        </div>
        <div className="curation-counts"><strong>{keep.length.toLocaleString()}</strong><span>Keep</span><strong>{maybe.length.toLocaleString()}</strong><span>Maybe</span></div>
      </div>

      <div className="export-card">
        <div className="export-card-heading"><div><h3>Export local copies</h3><p>Make the exported folder useful on its own, with repaired date and location metadata where PhotoFind knows them reliably.</p></div><span className="local-only-pill">Local write</span></div>
        <div className="export-controls">
          <label>Selection
            <select value={scope} onChange={(event) => setScope(event.target.value as ExportScope)}>
              <option value="keep">Keep only ({keep.length.toLocaleString()})</option>
              <option value="keep-maybe">Keep + Maybe ({(keep.length + maybe.length).toLocaleString()})</option>
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
            <input type="checkbox" checked={embedMetadata} onChange={(event) => setEmbedMetadata(event.target.checked)} />
            <span><strong>Embed repaired metadata</strong><small>JPEG copies receive reliable date/GPS directly. Other formats get an XMP sidecar.</small></span>
          </label>
          <label className="check-label export-option">
            <input type="checkbox" checked={includeReports} onChange={(event) => setIncludeReports(event.target.checked)} />
            <span><strong>Write selection reports</strong><small>Standalone JSON and readable HTML summaries.</small></span>
          </label>
          <button className="primary export-submit" type="button" disabled={props.busy || selected.length === 0 || !props.exportSupported || props.reconnectRequired} onClick={() => props.onExport(selected, layout, includeReports, embedMetadata)}>
            {props.busy ? 'Exporting…' : `Export ${selected.length.toLocaleString()} photos`}
          </button>
        </div>
        {!props.exportSupported && <div className="notice warning inline-notice">This browser cannot write directly to a chosen export folder. Use a Chromium browser exposing the File System Access API.</div>}
        {props.reconnectRequired && <div className="notice warning inline-notice">Reconnect the source folder before exporting originals.</div>}
        {props.progress && <ExportProgress progress={props.progress} />}
        {props.result && <ExportResult result={props.result} />}
      </div>

      {keep.length === 0 ? (
        <div className="curation-empty"><h3>No keepers yet</h3><p>Use Library, Review, Quality or Compare to mark photos as Keep. They appear here immediately.</p></div>
      ) : (
        <div className="keeper-grid">
          {keep.slice(0, 300).map((item, index) => (
            <article className="keeper-card" key={item.id}>
              <button type="button" className="keeper-preview" onClick={() => setOpenIndex(index)}><LocalThumbnail item={item} sessionFile={props.sessionFiles.get(item.id)} /></button>
              <div className="keeper-card-body"><strong title={item.relativePath}>{item.name}</strong>{typeof item.qualityScore === 'number' && <span>Technical {item.qualityScore}/100</span>}<ReviewControls item={item} compact onReview={props.onReview} /></div>
            </article>
          ))}
        </div>
      )}
      {keep.length > 300 && <p className="muted">Showing the first 300 keepers. All {keep.length.toLocaleString()} are included when exporting Keep.</p>}

      {openIndex !== null && keep[openIndex] && (
        <PhotoLightbox items={keep} index={openIndex} sessionFiles={props.sessionFiles} onIndex={setOpenIndex} onClose={() => setOpenIndex(null)} onReview={props.onReview} />
      )}
    </section>
  )
}

function ExportProgress({ progress }: { progress: LiteExportProgress }): JSX.Element {
  return <div className="analysis-progress export-progress"><div><strong>{progress.complete.toLocaleString()} / {progress.total.toLocaleString()}</strong><span>{progress.exported.toLocaleString()} copied · {progress.metadataEmbedded.toLocaleString()} metadata embedded · {progress.sidecarsWritten.toLocaleString()} XMP · {progress.failed.toLocaleString()} failed</span></div><progress max={Math.max(1, progress.total)} value={progress.complete} /><span className="muted" title={progress.currentPath}>{progress.currentPath}</span></div>
}

function ExportResult({ result }: { result: LiteExportResult }): JSX.Element {
  return <div className={result.failures.length > 0 ? 'export-result warning' : 'export-result success'}><strong>{result.exported.toLocaleString()} photos exported</strong><span>{result.metadataEmbedded.toLocaleString()} JPEG files received embedded normalized metadata · {result.sidecarsWritten.toLocaleString()} XMP sidecars written · {result.metadataUnchanged.toLocaleString()} copied with existing metadata unchanged.</span><span>{result.renamed.toLocaleString()} filenames were safely renamed to avoid overwriting existing files.</span>{result.manifestPath && <span>JSON report: {result.manifestPath}</span>}{result.reportPath && <span>HTML report: {result.reportPath}</span>}{result.failures.length > 0 && <details><summary>{result.failures.length.toLocaleString()} export notices or failures</summary><ul>{result.failures.slice(0, 30).map((failure) => <li key={failure.itemId}>{failure.relativePath}: {failure.message}</li>)}</ul></details>}</div>
}
