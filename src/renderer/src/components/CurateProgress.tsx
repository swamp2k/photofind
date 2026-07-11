import type { ScanProgressEvent } from '../../../shared/types'

const PHASE_LABELS: Record<ScanProgressEvent['phase'], string> = {
  scanning: 'Scanning folder',
  metadata: 'Reading photo metadata',
  thumbnails: 'Generating thumbnails',
  analyzing: 'Analyzing quality',
  faces: 'Detecting faces',
  grouping: 'Grouping bursts',
  done: 'Done'
}

export function CurateProgress({ progress }: { progress: ScanProgressEvent }): JSX.Element {
  const percent = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0
  return (
    <div className="curate-progress" role="status">
      <div className="curate-progress-label">
        <span>{PHASE_LABELS[progress.phase]}</span>
        {progress.total > 0 && (
          <span className="muted">
            {progress.processed} / {progress.total}
          </span>
        )}
      </div>
      <div className="curate-progress-track">
        <div className="curate-progress-bar" style={{ width: `${percent}%` }} />
      </div>
      {progress.currentFile && <div className="curate-progress-file">{progress.currentFile}</div>}
    </div>
  )
}
