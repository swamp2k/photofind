import type { SidecarMatch } from '../../../shared/types'

interface ScanReviewTableProps {
  matches: SidecarMatch[]
}

export function ScanReviewTable({ matches }: ScanReviewTableProps): JSX.Element {
  return (
    <section className="scan-review">
      <div className="scan-review-header">
        <h2>Scan review</h2>
        <span>{matches.length} media files</span>
      </div>

      {matches.length === 0 ? (
        <div className="scan-review-empty">No media files found in this source.</div>
      ) : (
        <div className="scan-review-table-wrap">
          <table className="scan-review-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Sidecar</th>
                <th>Repair</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((match) => {
                const repairable = match.confidence === 'safe' && match.sidecar !== null
                return (
                  <tr key={match.media.path}>
                    <td>
                      <div className="file-cell" title={match.media.path}>
                        {match.media.name}
                      </div>
                    </td>
                    <td>{match.media.kind.toUpperCase()}</td>
                    <td>
                      <span className={`status-pill status-${match.confidence}`}>{match.confidence}</span>
                    </td>
                    <td>
                      {match.sidecar ? (
                        <span className="sidecar-name" title={match.sidecar.path}>
                          {match.sidecar.name}
                        </span>
                      ) : (
                        <span className="muted">None</span>
                      )}
                    </td>
                    <td>
                      <span className={repairable ? 'repair-yes' : 'repair-no'}>{repairable ? 'Eligible' : 'Skipped'}</span>
                    </td>
                    <td>
                      <span title={match.reason}>{match.reason}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
