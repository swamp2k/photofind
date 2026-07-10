import { useState } from 'react'
import { Sidebar, type AppView } from './components/Sidebar'
import { CurateView } from './views/CurateView'
import { TakeoutView } from './views/TakeoutView'

export default function App(): JSX.Element {
  const [view, setView] = useState<AppView>('curate')

  return (
    <div className="app-shell">
      <Sidebar view={view} onNavigate={setView} />
      {/* Views unmount on switch; in-progress view state resets (accepted M1 tradeoff). */}
      <main className="app-main">{view === 'curate' ? <CurateView /> : <TakeoutView />}</main>
    </div>
  )
}
