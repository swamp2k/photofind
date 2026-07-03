import { useEffect, useMemo, useState } from 'react'
import type { KeeperStatus, LibraryItem } from '../../../shared/types'
import { toMediaUrl } from '../../../shared/mediaUrl'

type Filter = 'all' | KeeperStatus

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'keep', label: 'Keep' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'reject', label: 'Reject' },
  { value: 'unset', label: 'Unreviewed' }
]

export function ViewerView({
  items,
  onItemsChange
}: {
  items: LibraryItem[]
  onItemsChange: (items: LibraryItem[]) => void
}): JSX.Element {
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedPath, setSelectedPath] = useState<string | null>(items[0]?.path ?? null)
  const [exportStatus, setExportStatus] = useState<string | null>(null)

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: items.length, keep: 0, maybe: 0, reject: 0, unset: 0 }
    for (const item of items) c[item.status]++
    return c
  }, [items])

  const visible = useMemo(() => (filter === 'all' ? items : items.filter((i) => i.status === filter)), [items, filter])

  const selectedIndex = visible.findIndex((i) => i.path === selectedPath)
  const selected = selectedIndex >= 0 ? visible[selectedIndex] : null

  useEffect(() => {
    if (visible.length > 0 && !visible.some((i) => i.path === selectedPath)) {
      setSelectedPath(visible[0].path)
    }
  }, [visible, selectedPath])

  async function setStatus(path: string, status: KeeperStatus): Promise<void> {
    await window.api.setLibraryStatus(path, status)
    onItemsChange(items.map((i) => (i.path === path ? { ...i, status } : i)))
  }

  function moveSelection(delta: number): void {
    if (visible.length === 0) return
    const next = Math.min(Math.max(selectedIndex + delta, 0), visible.length - 1)
    setSelectedPath(visible[next].path)
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (!selected) return
    if (e.key === 'ArrowRight') moveSelection(1)
    else if (e.key === 'ArrowLeft') moveSelection(-1)
    else if (e.key.toLowerCase() === 'k') setStatus(selected.path, 'keep')
    else if (e.key.toLowerCase() === 'm') setStatus(selected.path, 'maybe')
    else if (e.key.toLowerCase() === 'r') setStatus(selected.path, 'reject')
  }

  async function handleExportKeepers(): Promise<void> {
    setExportStatus('Exporting…')
    const result = await window.api.exportKeepers()
    if (!result) {
      setExportStatus(null)
      return
    }
    setExportStatus(`Exported ${result.exported}/${result.attempted} keepers${result.failed ? `, ${result.failed} failed` : ''}.`)
  }

  return (
    <div className="viewer-view" tabIndex={0} onKeyDown={handleKeyDown}>
      <aside className="viewer-sidebar">
        <h2>Filters</h2>
        <ul className="filter-list">
          {FILTERS.map((f) => (
            <li key={f.value}>
              <button className={filter === f.value ? 'filter active' : 'filter'} onClick={() => setFilter(f.value)}>
                {f.label} <span className="filter-count">{counts[f.value]}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="muted sidebar-note">Timeline, people, and place filters arrive in a later milestone.</p>
      </aside>

      <main className="viewer-grid">
        {visible.map((item) => (
          <button
            key={item.path}
            className={item.path === selectedPath ? 'thumb selected' : 'thumb'}
            onClick={() => setSelectedPath(item.path)}
            title={item.name}
          >
            {item.thumbnailPath ? (
              <img src={toMediaUrl(item.thumbnailPath)} loading="lazy" alt={item.name} />
            ) : (
              <div className="thumb-placeholder">{item.kind.toUpperCase()}</div>
            )}
            {item.status !== 'unset' && <span className={`status-badge status-${item.status}`}>{item.status}</span>}
          </button>
        ))}
        {visible.length === 0 && <p className="muted">Nothing matches this filter.</p>}
      </main>

      <aside className="viewer-inspector">
        <h2>Inspector</h2>
        {selected ? (
          <>
            <div className="inspector-preview">
              {selected.kind === 'image' ? (
                <img src={toMediaUrl(selected.path)} alt={selected.name} />
              ) : (
                <div className="thumb-placeholder large">{selected.kind.toUpperCase()}</div>
              )}
            </div>
            <dl className="inspector-fields">
              <dt>Name</dt>
              <dd>{selected.name}</dd>
              <dt>Kind</dt>
              <dd>{selected.kind}</dd>
              <dt>Size</dt>
              <dd>{(selected.sizeBytes / 1024).toFixed(0)} KB</dd>
              <dt>Metadata match</dt>
              <dd className={`stat-${selected.confidence}`}>{selected.confidence}</dd>
              <dt>Status</dt>
              <dd>{selected.status}</dd>
            </dl>
            <div className="inspector-actions">
              <button onClick={() => setStatus(selected.path, 'keep')}>Keep (K)</button>
              <button onClick={() => setStatus(selected.path, 'maybe')}>Maybe (M)</button>
              <button onClick={() => setStatus(selected.path, 'reject')}>Reject (R)</button>
            </div>
          </>
        ) : (
          <p className="muted">Select an item to inspect it.</p>
        )}
      </aside>

      <footer className="keeper-tray">
        <span>{counts.keep} keeper{counts.keep === 1 ? '' : 's'} marked</span>
        <button className="primary" disabled={counts.keep === 0} onClick={handleExportKeepers}>
          Export keepers&hellip;
        </button>
        {exportStatus && <span className="export-status">{exportStatus}</span>}
      </footer>
    </div>
  )
}
