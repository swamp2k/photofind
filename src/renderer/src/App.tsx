import { useState } from 'react'
import type { LibraryItem } from '../../shared/types'
import { ImportView } from './components/ImportView'
import { ViewerView } from './components/ViewerView'

type View = 'import' | 'viewer'

export default function App(): JSX.Element {
  const [view, setView] = useState<View>('import')
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([])

  return (
    <div className="app-shell">
      <nav className="tab-bar">
        <button className={view === 'import' ? 'tab active' : 'tab'} onClick={() => setView('import')}>
          Import
        </button>
        <button
          className={view === 'viewer' ? 'tab active' : 'tab'}
          disabled={libraryItems.length === 0}
          onClick={() => setView('viewer')}
        >
          Library ({libraryItems.length})
        </button>
      </nav>

      {view === 'import' && (
        <ImportView
          onLibraryBuilt={(items) => {
            setLibraryItems(items)
            setView('viewer')
          }}
        />
      )}
      {view === 'viewer' && <ViewerView items={libraryItems} onItemsChange={setLibraryItems} />}
    </div>
  )
}
