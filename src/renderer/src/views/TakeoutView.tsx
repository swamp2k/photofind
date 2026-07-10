import { useState } from 'react'
import type { ExportResult, LogEntry, RepairResult, ScanResult } from '../../../shared/types'
import { DiagnosticsDrawer } from '../components/DiagnosticsDrawer'
import { MediaGrid } from '../components/MediaGrid'
import { ScanReviewTable } from '../components/ScanReviewTable'

export function TakeoutView(): JSX.Element {
  const [sourcePath, setSourcePath] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [repairing, setRepairing] = useState(false)
  const [repairMode, setRepairMode] = useState<'dry-run' | 'write' | null>(null)
  const [repairResult, setRepairResult] = useState<RepairResult | null>(null)
  const [dryRunComplete, setDryRunComplete] = useState(false)
  const [confirmRepairOpen, setConfirmRepairOpen] = useState(false)
  const [keepers, setKeepers] = useState<Set<string>>(() => new Set())
  const [exporting, setExporting] = useState(false)
  const [exportResult, setExportResult] = useState<ExportResult | null>(null)

  const log: LogEntry[] = [...(scanResult?.log ?? []), ...(repairResult?.log ?? []), ...(exportResult?.log ?? [])]
  const safeMatches = scanResult?.summary.safeMatches ?? 0
  const skippedMatches = scanResult ? scanResult.summary.uncertainMatches + scanResult.summary.missingMatches : 0
  const canRepair = Boolean(scanResult && dryRunComplete && safeMatches > 0 && !repairing)

  async function handleSelectSource(): Promise<void> {
    const path = await window.api.selectFolder()
    if (path) {
      setSourcePath(path)
      setScanResult(null)
      setRepairResult(null)
      setRepairMode(null)
      setDryRunComplete(false)
      setConfirmRepairOpen(false)
      setKeepers(new Set())
      setExportResult(null)
    }
  }

  async function handleScan(): Promise<void> {
    if (!sourcePath) return
    setScanning(true)
    setRepairResult(null)
    setRepairMode(null)
    setDryRunComplete(false)
    setConfirmRepairOpen(false)
    setKeepers(new Set())
    setExportResult(null)
    try {
      const result = await window.api.runScan(sourcePath)
      setScanResult(result)
      setKeepers(new Set(result.keepers))
    } finally {
      setScanning(false)
    }
  }

  async function handleExportKeepers(): Promise<void> {
    if (keepers.size === 0) return
    const destination = await window.api.selectExportFolder()
    if (!destination) return

    setExporting(true)
    try {
      const result = await window.api.exportKeepers(Array.from(keepers), destination)
      setExportResult(result)
    } finally {
      setExporting(false)
    }
  }

  async function handleRepair(dryRun: boolean): Promise<void> {
    if (!scanResult) return
    setRepairing(true)
    setRepairMode(dryRun ? 'dry-run' : 'write')
    if (!dryRun) setConfirmRepairOpen(false)
    try {
      const result = await window.api.runRepair(scanResult.matches, dryRun)
      setRepairResult(result)
      if (dryRun) setDryRunComplete(true)
    } finally {
      setRepairing(false)
      setRepairMode(null)
    }
  }

  async function handleToggleKeeper(mediaPath: string): Promise<void> {
    const kept = !keepers.has(mediaPath)
    setKeepers((current) => {
      const next = new Set(current)
      if (kept) {
        next.add(mediaPath)
      } else {
        next.delete(mediaPath)
      }
      return next
    })
    try {
      await window.api.setKeeper(mediaPath, kept)
    } catch (err) {
      setKeepers((current) => {
        const next = new Set(current)
        if (kept) {
          next.delete(mediaPath)
        } else {
          next.add(mediaPath)
        }
        return next
      })
      console.error('Failed to persist keeper state', err)
    }
  }

  return (
    <div className="import-view">
      <div className="import-top">
        <h1>Google Takeout — import &amp; repair</h1>
        <button onClick={handleSelectSource}>Choose folder&hellip;</button>
        {sourcePath && <span className="source-path">{sourcePath}</span>}
        <button className="primary" disabled={!sourcePath || scanning} onClick={handleScan}>
          {scanning ? 'Scanning…' : 'Scan'}
        </button>
      </div>

      <div className="import-panels">
        <section className="panel">
          <h2>Source</h2>
          {sourcePath ? <p>{sourcePath}</p> : <p className="muted">No source selected yet.</p>}
        </section>

        <section className="panel">
          <h2>Scan summary</h2>
          {scanResult ? (
            <ul className="stat-list">
              <li>Total files: {scanResult.summary.totalFiles}</li>
              <li>Images: {scanResult.summary.images}</li>
              <li>RAW: {scanResult.summary.raw}</li>
              <li>Videos: {scanResult.summary.videos}</li>
              <li>JSON/XMP sidecars: {scanResult.summary.sidecars}</li>
              <li>Unknown: {scanResult.summary.unknown}</li>
              <li>Thumbnails: {scanResult.thumbnails.generated} generated, {scanResult.thumbnails.reused} reused</li>
              <li className={scanResult.thumbnails.failed > 0 ? 'stat-missing' : undefined}>
                Thumbnail failures: {scanResult.thumbnails.failed}
              </li>
            </ul>
          ) : (
            <p className="muted">Run a scan to see results.</p>
          )}
        </section>

        <section className="panel">
          <h2>Metadata health</h2>
          {scanResult ? (
            <ul className="stat-list">
              <li className="stat-safe">Safe matches: {scanResult.summary.safeMatches}</li>
              <li className="stat-uncertain">Uncertain matches: {scanResult.summary.uncertainMatches}</li>
              <li className="stat-missing">Missing JSON: {scanResult.summary.missingMatches}</li>
            </ul>
          ) : (
            <p className="muted">Run a scan to see results.</p>
          )}
          {repairResult && (
            <p className="repair-summary">
              Repair: {repairResult.repaired} written, {repairResult.failed} failed, of {repairResult.attempted} attempted.
            </p>
          )}
        </section>
      </div>

      <div className="import-actions">
        <button disabled={!scanResult || repairing} onClick={() => handleRepair(true)}>
          {repairMode === 'dry-run' ? 'Dry running...' : 'Dry run'}
        </button>
        <button className="primary" disabled={!canRepair} onClick={() => setConfirmRepairOpen(true)}>
          {repairMode === 'write' ? 'Repairing...' : 'Repair metadata'}
        </button>
        {scanResult && !dryRunComplete && <span className="action-note">Run dry run before writing metadata.</span>}
        <button disabled={!scanResult || keepers.size === 0 || exporting} onClick={handleExportKeepers}>
          {exporting ? 'Exporting...' : `Export keepers (${keepers.size})`}
        </button>
      </div>

      {exportResult && (
        <div className={exportResult.failed > 0 ? 'export-summary export-summary-warn' : 'export-summary'}>
          Exported {exportResult.exported} of {exportResult.attempted} keepers to {exportResult.destinationRoot}. Report: {exportResult.reportPath}
        </div>
      )}

      {scanResult && (
        <MediaGrid
          thumbnails={scanResult.thumbnails.items}
          matches={scanResult.matches}
          keepers={keepers}
          onToggleKeeper={handleToggleKeeper}
        />
      )}

      {scanResult && <ScanReviewTable matches={scanResult.matches} />}

      <DiagnosticsDrawer log={log} />

      {confirmRepairOpen && scanResult && (
        <div className="modal-backdrop" role="presentation">
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="repair-confirm-title">
            <h2 id="repair-confirm-title">Confirm metadata repair</h2>
            <p>
              This will write Google Takeout date and GPS metadata to {safeMatches} files with safe sidecar matches.
              {skippedMatches > 0 && ` ${skippedMatches} uncertain or missing matches will be skipped.`}
            </p>
            <dl className="confirm-stats">
              <div>
                <dt>Writable</dt>
                <dd>{safeMatches}</dd>
              </div>
              <div>
                <dt>Skipped</dt>
                <dd>{skippedMatches}</dd>
              </div>
              <div>
                <dt>Dry run</dt>
                <dd>{dryRunComplete ? 'Complete' : 'Required'}</dd>
              </div>
            </dl>
            <div className="modal-actions">
              <button disabled={repairing} onClick={() => setConfirmRepairOpen(false)}>
                Cancel
              </button>
              <button className="primary danger" disabled={!canRepair} onClick={() => handleRepair(false)}>
                Write metadata
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
