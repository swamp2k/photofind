export type AppView = 'curate' | 'events' | 'takeout'

interface SidebarProps {
  view: AppView
  onNavigate: (view: AppView) => void
}

export function Sidebar({ view, onNavigate }: SidebarProps): JSX.Element {
  return (
    <nav className="sidebar" aria-label="Main navigation">
      <div className="sidebar-brand">Photofind</div>

      <div className="sidebar-section">
        <div className="sidebar-section-title">Library</div>
        <button
          className={view === 'curate' ? 'sidebar-item active' : 'sidebar-item'}
          onClick={() => onNavigate('curate')}
        >
          Curate
        </button>
        <button
          className={view === 'events' ? 'sidebar-item active' : 'sidebar-item'}
          onClick={() => onNavigate('events')}
        >
          Events
        </button>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-title">Google Takeout</div>
        <button
          className={view === 'takeout' ? 'sidebar-item active' : 'sidebar-item'}
          onClick={() => onNavigate('takeout')}
        >
          Import &amp; repair
        </button>
      </div>
    </nav>
  )
}
