export interface GlobalProcessActivity {
  id: string
  label: string
  detail?: string
  complete?: number
  total?: number
  indeterminate?: boolean
}

interface GlobalProcessStatusProps {
  activities: GlobalProcessActivity[]
}

export function GlobalProcessStatus({ activities }: GlobalProcessStatusProps): JSX.Element | null {
  if (activities.length === 0) return null

  return (
    <section className="global-process-status" aria-live="polite" aria-label="PhotoFind activity">
      <div className="global-process-heading">
        <span className="global-process-pulse" aria-hidden="true" />
        <strong>{activities.length === 1 ? 'PhotoFind is working' : `${activities.length} processes running`}</strong>
      </div>
      <div className="global-process-list">
        {activities.map((activity) => {
          const hasProgress = typeof activity.complete === 'number' && typeof activity.total === 'number' && activity.total > 0
          const percent = hasProgress ? Math.max(0, Math.min(100, Math.round((activity.complete! / activity.total!) * 100))) : null
          return (
            <div className="global-process-item" key={activity.id}>
              <div className="global-process-row">
                <span>{activity.label}</span>
                {hasProgress && <strong>{percent}%</strong>}
              </div>
              <div className={activity.indeterminate || !hasProgress ? 'global-process-track indeterminate' : 'global-process-track'}>
                <i style={hasProgress ? { width: `${percent}%` } : undefined} />
              </div>
              {(activity.detail || hasProgress) && (
                <div className="global-process-detail" title={activity.detail}>
                  {hasProgress && <span>{activity.complete!.toLocaleString()} / {activity.total!.toLocaleString()}</span>}
                  {activity.detail && <span>{activity.detail}</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
