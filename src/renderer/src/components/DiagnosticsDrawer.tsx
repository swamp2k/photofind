import type { LogEntry } from '../../../shared/types'

export function DiagnosticsDrawer({ log }: { log: LogEntry[] }): JSX.Element {
  return (
    <div className="diagnostics-drawer">
      <div className="diagnostics-header">Diagnostics</div>
      <div className="diagnostics-body">
        {log.length === 0 && <div className="diagnostics-empty">No output yet. Run a scan to see results here.</div>}
        {log.map((entry, i) => (
          <div key={i} className={`log-line log-${entry.level.toLowerCase()}`}>
            <span className="log-level">[{entry.level}]</span> {entry.message}
          </div>
        ))}
      </div>
    </div>
  )
}
