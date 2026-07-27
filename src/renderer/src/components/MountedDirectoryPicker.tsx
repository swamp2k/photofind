import { useEffect, useState } from 'react'
import type { BrowserCapabilities, BrowserDirectoryApi, DirectoryEntry, DirectoryListing } from '../client'

/** Convert an internal browser-scoped URI into a label suitable for display. */
export function formatDirectoryDisplay(value: string): string {
  if (!value.startsWith('photofind://')) return value

  const remainder = value.slice('photofind://'.length)
  const [scope, ...segments] = remainder.split('/').filter(Boolean)
  const scopeLabel = scope ? scope.charAt(0).toUpperCase() + scope.slice(1) : 'PhotoFind'
  const decodedSegments = segments.map((segment) => {
    try {
      return decodeURIComponent(segment)
    } catch {
      return segment
    }
  })
  return [scopeLabel, ...decodedSegments].join(' / ')
}

interface Props {
  api: BrowserDirectoryApi
  onSource: (uri: string) => void
  onDestination: (uri: string) => void
  onError: (message: string) => void
}

export function MountedDirectoryPicker({ api, onSource, onDestination, onError }: Props): JSX.Element {
  const [capabilities, setCapabilities] = useState<BrowserCapabilities | null>(null)
  const [source, setSource] = useState<DirectoryListing | null>(null)
  const [destination, setDestination] = useState<DirectoryListing | null>(null)
  const [selectedSource, setSelectedSource] = useState<string | null>(null)
  const [selectedDestination, setSelectedDestination] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  const load = async (uri: string, target: 'source' | 'destination'): Promise<void> => {
    try {
      const listing = await api.browse(uri)
      if (target === 'source') setSource(listing)
      else setDestination(listing)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to browse directory')
    }
  }

  useEffect(() => {
    void api.capabilities().then(setCapabilities).catch((error) => onError(error instanceof Error ? error.message : 'Unable to load capabilities'))
    void load('photofind://photos', 'source')
    void load('photofind://exports', 'destination')
  }, [])

  const browse = (entry: DirectoryEntry, target: 'source' | 'destination'): void => { void load(entry.uri, target) }
  const inboxAvailable = capabilities?.roots.some((root) => root.scope === 'inbox' && root.browse)

  return (
    <section className="mounted-picker panel">
      <h2>Mounted folders (browser)</h2>
      <div className="mounted-picker-columns">
        <div>
          <strong>Source</strong>
          <div className="picker-roots">
            <button onClick={() => void load('photofind://photos', 'source')}>Photos</button>
            <button disabled={!inboxAvailable} onClick={() => void load('photofind://inbox', 'source')}>Inbox</button>
          </div>
          {source && <DirectoryBrowser listing={source} onBrowse={(entry) => browse(entry, 'source')} onSelect={() => { setSelectedSource(source.uri); onSource(source.uri) }} label="Select this source" />}
          {selectedSource && <small className="picker-selection">Selected: {formatDirectoryDisplay(selectedSource)}</small>}
        </div>
        <div>
          <strong>Export destination</strong>
          {destination && <DirectoryBrowser listing={destination} onBrowse={(entry) => browse(entry, 'destination')} onSelect={() => { setSelectedDestination(destination.uri); onDestination(destination.uri) }} label="Select this destination" />}
          {selectedDestination && <small className="picker-selection">Selected: {formatDirectoryDisplay(selectedDestination)}</small>}
          <div className="picker-create">
            <input aria-label="New export directory" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="New folder name" />
            <button disabled={!newName.trim()} onClick={async () => {
              try {
                const created = await api.createDirectory(destination?.uri ?? 'photofind://exports', newName.trim())
                setNewName('')
                await load(created.uri, 'destination')
              } catch (error) {
                onError(error instanceof Error ? error.message : 'Unable to create directory')
              }
            }}>Create</button>
          </div>
        </div>
      </div>
    </section>
  )
}

function DirectoryBrowser({ listing, onBrowse, onSelect, label }: { listing: DirectoryListing; onBrowse: (entry: DirectoryEntry) => void; onSelect: () => void; label: string }): JSX.Element {
  return (
    <div className="directory-browser">
      <div className="directory-breadcrumbs">{listing.breadcrumbs.map((crumb) => <button key={crumb.uri} onClick={() => onBrowse(crumb)}>{crumb.name}</button>)}</div>
      <button className="primary" onClick={onSelect}>{label}</button>
      <ul>{listing.entries.map((entry) => <li key={entry.uri}><button onClick={() => onBrowse(entry)}>{entry.name}/</button></li>)}</ul>
      {listing.skipped > 0 && <small className="muted">{listing.skipped} entries unavailable</small>}
    </div>
  )
}
