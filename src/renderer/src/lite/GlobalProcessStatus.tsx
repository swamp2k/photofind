import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGlobalProcesses } from './globalProcesses'

export function GlobalProcessStatus(): JSX.Element | null {
  const activities = useGlobalProcesses()
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const resolveTarget = (): boolean => {
      const sidebar = document.querySelector<HTMLElement>('.pf-sidebar')
      if (!sidebar) return false
      setTarget(sidebar)
      return true
    }
    if (resolveTarget()) return
    const observer = new MutationObserver(() => {
      if (resolveTarget()) observer.disconnect()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  if (!target || activities.length === 0) return null

  return createPortal(
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
              <div className={hasProgress ? 'global-process-track' : 'global-process-track indeterminate'}>
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
    </section>,
    target
  )
}
