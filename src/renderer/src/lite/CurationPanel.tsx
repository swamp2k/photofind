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
  onExport(items: LiteMediaRecord[], layout: LiteExportLayout, includeReports: boolean): void
}

type ExportScope = 'keep' | 'keep-maybe'

export function CurationPanel(props: CurationPanelProps): JSX.Element {
  const [scope, setScope] = useState<ExportScope>('keep')
  const [layout, setLayout] = useState<LiteExportLayout>('date-day')
  const [includeReports, setIncludeReports] = useState(true)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const keep = useMemo(() => props.items.filter((item) => item.kind === 'image' && reviewStateOf(item) === 'keep'), [props.items])
  const maybe = useMemo(() => props.items.filter((item) => item.kind === 'image' && reviewStateOf(item) === 'maybe'), [props.items])
  const selected = scope === 'keep' ? keep : [...keep, ...maybe]

  return (
    <section className="curation-section">
      <div className="curation-hero">
        <div>
          <div className="eyebrow">Lite 5 · curation and export</div>
          <h2>Keeper tray</h2>
          <p className="muted">Review decisions stay in this browser index. Export copies selected originals into a folder you choose; source photos are never modified or deleted.</p>
        </div>
        <div className="curation-counts"><strong>{keep.length.toLocaleString()}</strong><span>keepers</span><strong>{maybe.length.toLocaleString()}</strong><span>maybe</span></div>
      </div>

      <div className="export-card">
        <div className="export-controls">
          <label>Export selection
            <select value={scope} onChange={(event) => setScope(event.target.value as ExportScope)}>
              <option value="keep">Keep only ({keep.length.toLocaleString()})</option>
              <option value="keep-maybe">Keep + Maybe ({(keep.length + maybe.length).toLocaleString()})</option>
            </select>
          </label>
          <label>Folder layout
            <select value={layout} onChange={(event) => setLayout(event.target.value as LiteExportLayout)}>
              <option value="date-day">YYYY / MM / DD</option>
              <option value="date-month">YYYY / MM</option>
              <option value="source-folders">Preserve source folders</option>
              <option value="flat">One flat folder</option>
            </select>
          </label>
          <label className="check-label export-report-check">
            <input type="checkbox" checked={includeReports} onChange={(event) => setIncludeReports(event.target.checked)} />
            <span>Write standalone JSON + HTML selection reports</span>
          </label>
          <button className="primary" type="button" disabled={props.busy || selected.length === 0 || !props.exportSupported || props.reconnectRequired} onClick={() => props.onExport(selected, layout, includeReports)}>
            {props.busy ? 'Exporting…' : `Export ${selected.length.toLocaleString()} photos`}
          </button>
        </div>
        {!props.exportSupported && <div className="notice warning inline-notice">This browser cannot write directly to a chosen export folder. Use a Chromium browser exposing the File System Access API.</div>}
        {props.reconnectRequired && <div className="notice warning inline-notice">Reconnect the source folder before exporting originals.</div>}
        {props.progress && <ExportProgress progress={props.progress} />}
        {props.result && <ExportResult result={props.result} />}
      </div>

      {keep.length === 0 ? (
        <div className="curation-empty"><h3>No keepers yet</h3><p>Mark photos as Keep from Photos, Quality, Groups, Map or the full-size viewer. They will appear here immediately.</p></div>
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
  return <div className="analysis-progress export-progress"><div><strong>{progress.complete.toLocaleString()} / {progress.total.toLocaleString()}</strong><span>{progress.exported.toLocaleString()} exported · {progress.renamed.toLocaleString()} collision-renamed · {progress.failed.toLocaleString()} failed</span></div><progress max={Math.max(1, progress.total)} value={progress.complete} /><span className="muted" title={progress.currentPath}>{progress.currentPath}</span></div>
}

function ExportResult({ result }: { result: LiteExportResult }): JSX.Element {
  return <div className={result.failures.length > 0 ? 'export-result warning' : 'export-result success'}><strong>{result.exported.toLocaleString()} photos exported</strong><span>{result.renamed.toLocaleString()} filenames were safely renamed to avoid overwriting existing files.</span>{result.manifestPath && <span>JSON report: {result.manifestPath}</span>}{result.reportPath && <span>HTML report: {result.reportPath}</span>}{result.failures.length > 0 && <details><summary>{result.failures.length.toLocaleString()} export failures</summary><ul>{result.failures.slice(0, 30).map((failure) => <li key={failure.itemId}>{failure.relativePath}: {failure.message}</li>)}</ul></details>}</div>
}
