import { useState } from 'react'
import { Sidebar, type AppView } from './components/Sidebar'
import { useCurateSession } from './hooks/useCurateSession'
import { CurateView } from './views/CurateView'
import { EventsView } from './views/EventsView'
import { TakeoutView } from './views/TakeoutView'

export default function App(): JSX.Element {
  const [view, setView] = useState<AppView>('curate')
  // Session lives here so scan results survive switching between views.
  const session = useCurateSession()

  return (
    <div className="app-shell">
      <Sidebar view={view} onNavigate={setView} />
      <main className="app-main">
        {view === 'curate' && <CurateView session={session} />}
        {view === 'events' && <EventsView session={session} />}
        {view === 'takeout' && <TakeoutView />}
      </main>
    </div>
  )
}
