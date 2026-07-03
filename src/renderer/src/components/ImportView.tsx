import { useState } from 'react'
import type { LibraryItem, LogEntry, RepairResult, ScanResult } from '../../../shared/types'
import { DiagnosticsDrawer } from './DiagnosticsDrawer'

export function ImportView({ onLibraryBuilt }: { onLibraryBuilt: (items: LibraryItem[]) => void }): JSX.Element {
  const [sourcePath, setSourcePath] = useState<string | null>(null)
  const [extractLog, setExtractLog] = useState<LogEntry[]>([])
  const [extracting, setExtracting] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [repairing, setRepairing] = useState(false)
  const [repairResult, setRepairResult] = useState<RepairResult | null>(null)
  const [buildingLibrary, setBuildingLibrary] = useState(false)

  const log: LogEntry[] = [...extractLog, ...(scanResult?.log ?? []), ...(repairResult?.log ?? [])]

  function resetDownstream(): void {
    setScanResult(null)
    setRepairResult(null)
  }

  async function handleSelectFolder(): Promise<void> {
    const path = await window.api.selectFolder()
    if (path) {
      setSourcePath(path)
      setExtractLog([])
      resetDownstream()
    }
  }

  async function handleSelectZips(): Promise<void> {
    const zipPaths = await window.api.selectZips()
    if (!zipPaths || zipPaths.length === 0) return
    setExtracting(true)
    resetDownstream()
    try {
      const result = await window.api.extractZips(zipPaths)
      setExtractLog(result.log)
      setSourcePath(result.destDir)
    } finally {
      setExtracting(false)
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

  async function handleBuildLibrary(): Promise<void> {
    if (!scanResult) return
    setBuildingLibrary(true)
    try {
      const items = await window.api.buildLibrary(scanResult.matches)
      onLibraryBuilt(items)
    } finally {
      setBuildingLibrary(false)
    }
  }

  return (
    <div className="import-view">
      <div className="import-top">
        <h1>Import Google Takeout or local photo folder</h1>
        <button onClick={handleSelectFolder}>Choose folder&hellip;</button>
        <button onClick={handleSelectZips} disabled={extracting}>
          {extracting ? 'Extracting…' : 'Choose Takeout zip(s)…'}
        </button>
        {sourcePath && <span className="source-path">{sourcePath}</span>}
        <button className="primary" disabled={!sourcePath || scanning || extracting} onClick={handleScan}>
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
        <button disabled={!scanResult || buildingLibrary} onClick={handleBuildLibrary}>
          {buildingLibrary ? 'Building…' : 'Build library'}
        </button>
      </div>

      <DiagnosticsDrawer log={log} />
    </div>
  )
}
