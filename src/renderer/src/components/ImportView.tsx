import { useState } from 'react'
import type { LogEntry, RepairResult, ScanResult } from '../../../shared/types'
import { DiagnosticsDrawer } from './DiagnosticsDrawer'

export function ImportView(): JSX.Element {
  const [sourcePath, setSourcePath] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [repairing, setRepairing] = useState(false)
  const [repairResult, setRepairResult] = useState<RepairResult | null>(null)

  const log: LogEntry[] = [...(scanResult?.log ?? []), ...(repairResult?.log ?? [])]

  async function handleSelectSource(): Promise<void> {
    const path = await window.api.selectFolder()
    if (path) {
      setSourcePath(path)
      setScanResult(null)
      setRepairResult(null)
    }
  }

  async function handleScan(): Promise<void> {
    if (!sourcePath) return
    setScanning(true)
    setRepairResult(null)
    try {
      const result = await window.api.runScan(sourcePath)
      setScanResult(result)
    } finally {
      setScanning(false)
    }
  }

  async function handleRepair(dryRun: boolean): Promise<void> {
    if (!scanResult) return
    setRepairing(true)
    try {
      const result = await window.api.runRepair(scanResult.matches, dryRun)
      setRepairResult(result)
    } finally {
      setRepairing(false)
    }
  }

  return (
    <div className="import-view">
      <div className="import-top">
        <h1>Import Google Takeout or local photo folder</h1>
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
          Dry run
        </button>
        <button className="primary" disabled={!scanResult || repairing} onClick={() => handleRepair(false)}>
          {repairing ? 'Repairing…' : 'Repair metadata'}
        </button>
        <button disabled title="Coming in a later milestone">
          Build library
        </button>
      </div>

      <DiagnosticsDrawer log={log} />
    </div>
  )
}
