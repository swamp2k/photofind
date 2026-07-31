import { useCallback, useEffect, useMemo, useState } from 'react'
import { BrowseFilters } from './BrowseFilters'
import { ensureReadPermission, localFolderAccessMode, pickLocalDirectory, pickLocalDirectoryFiles } from './fileAccess'
import { availableYears, dateInputToEnd, dateInputToStart, filterPhotos, hasLocation } from './filters'
import { deleteLibrary, listLibraries, loadMedia, putMediaRecords, replaceLibrary } from './libraryDb'
import { MapResults } from './MapResults'
import { PhotoResults } from './PhotoResults'
import { scanDirectory, scanFileSelection } from './scanner'
import { buildSimilarityGroups } from './similarity'
import { analyzeSimilarity } from './similarityAnalysis'
import { SimilarityGroups } from './SimilarityGroups'
import type { LiteDateMetadataFilter, LiteGeoBounds, LiteLibraryAccessMode, LiteLibraryRecord, LiteLocationFilter, LiteMediaRecord, LitePhotoFilters, LiteScanProgress, LiteSimilarityProgress } from './types'

const PAGE_SIZE = 120
type BrowseView = 'photos' | 'map' | 'groups'

export function LiteApp(): JSX.Element {
  const [libraries, setLibraries] = useState<LiteLibraryRecord[]>([])
  const [activeLibrary, setActiveLibrary] = useState<LiteLibraryRecord | null>(null)
  const [media, setMedia] = useState<LiteMediaRecord[]>([])
  const [sessionFiles, setSessionFiles] = useState<Map<string, File>>(new Map())
  const [progress, setProgress] = useState<LiteScanProgress | null>(null)
  const [similarityProgress, setSimilarityProgress] = useState<LiteSimilarityProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [similarityBusy, setSimilarityBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [view, setView] = useState<BrowseView>('photos')
  const [year, setYear] = useState<number | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [locationFilter, setLocationFilter] = useState<LiteLocationFilter>('all')
  const [dateMetadataFilter, setDateMetadataFilter] = useState<LiteDateMetadataFilter>('all')
  const [filterToViewport, setFilterToViewport] = useState(false)
  const [mapBounds, setMapBounds] = useState<LiteGeoBounds | null>(null)
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null)
  const folderMode = localFolderAccessMode()
  const supported = folderMode !== 'unsupported'
  const working = busy || similarityBusy

  useEffect(() => { void refreshLibraries() }, [])

  const images = useMemo(() => media.filter((item) => item.kind === 'image'), [media])
  const similarityGroups = useMemo(() => buildSimilarityGroups(images), [images])
  const years = useMemo(() => availableYears(images), [images])
  const baseFilters = useMemo<LitePhotoFilters>(() => ({
    year,
    fromTime: dateInputToStart(fromDate),
    toTime: dateInputToEnd(toDate),
    location: locationFilter,
    dateMetadata: dateMetadataFilter,
    mapBounds: null
  }), [year, fromDate, toDate, locationFilter, dateMetadataFilter])
  const mapItems = useMemo(() => filterPhotos(images, baseFilters), [images, baseFilters])
  const filteredImages = useMemo(() => filterPhotos(images, { ...baseFilters, mapBounds: filterToViewport ? mapBounds : null }), [images, baseFilters, filterToViewport, mapBounds])
  const unknown = useMemo(() => media.filter((item) => item.kind === 'unknown'), [media])
  const locatedCount = useMemo(() => images.filter(hasLocation).length, [images])
  const fileTimeOnlyCount = useMemo(() => images.filter((item) => item.captureTimeSource === 'file').length, [images])
  const diagnostics = useMemo(() => collectDiagnostics(media), [media])
  const reconnectRequired = activeLibrary !== null && libraryMode(activeLibrary) === 'selection' && sessionFiles.size === 0
  const selectedMapItem = selectedMapId ? images.find((item) => item.id === selectedMapId) ?? null : null
  const handleMapBounds = useCallback((bounds: LiteGeoBounds | null) => { setMapBounds(bounds); setVisibleCount(PAGE_SIZE) }, [])

  async function refreshLibraries(): Promise<void> {
    try { setLibraries(await listLibraries()) } catch (cause) { setError(messageOf(cause)) }
  }

  async function addFolder(): Promise<void> {
    setError(null)
    try {
      if (folderMode === 'handle') return await indexHandle(await pickLocalDirectory(), null)
      if (folderMode === 'selection') return await indexFiles(await pickLocalDirectoryFiles(), null)
      setError('This browser does not expose a usable local-folder selection API.')
    } catch (cause) {
      if (!isAbort(cause)) setError(messageOf(cause))
    }
  }

  async function openLibrary(library: LiteLibraryRecord): Promise<void> {
    setError(null)
    try {
      if (libraryMode(library) === 'handle') {
        if (!library.rootHandle) throw new Error('This saved folder handle is unavailable. Forget the index and choose the folder again.')
        if (!(await ensureReadPermission(library.rootHandle))) throw new Error('PhotoFind needs permission to read this folder again.')
      }
      setBusy(true)
      setActiveLibrary(library)
      setMedia(await loadMedia(library.id))
      setSessionFiles(new Map())
      resetBrowseState()
    } catch (cause) { setError(messageOf(cause)) } finally { setBusy(false) }
  }

  async function rescanActive(): Promise<void> {
    if (!activeLibrary) return
    setError(null)
    try {
      if (libraryMode(activeLibrary) === 'selection') return await indexFiles(await pickLocalDirectoryFiles(), activeLibrary)
      if (!activeLibrary.rootHandle) throw new Error('The saved folder handle is unavailable.')
      if (!(await ensureReadPermission(activeLibrary.rootHandle))) throw new Error('Folder permission was not granted.')
      await indexHandle(activeLibrary.rootHandle, activeLibrary)
    } catch (cause) {
      if (!isAbort(cause)) setError(messageOf(cause))
    }
  }

  async function runSimilarityAnalysis(): Promise<void> {
    if (!activeLibrary || reconnectRequired || similarityBusy) return
    setError(null)
    setSimilarityBusy(true)
    setSimilarityProgress({ complete: 0, total: images.length, reused: 0, currentPath: '' })
    try {
      const updated = await analyzeSimilarity(media, {
        resolveFile: resolveLocalFile,
        onProgress: setSimilarityProgress,
        persistBatch: putMediaRecords
      })
      setMedia(updated)
    } catch (cause) {
      setError(`Similarity analysis stopped: ${messageOf(cause)}`)
    } finally {
      setSimilarityBusy(false)
      setSimilarityProgress(null)
    }
  }

  async function resolveLocalFile(item: LiteMediaRecord): Promise<File | null> {
    try {
      const sessionFile = sessionFiles.get(item.id)
      if (sessionFile) return sessionFile
      return item.fileHandle ? await item.fileHandle.getFile() : null
    } catch {
      return null
    }
  }

  async function indexHandle(handle: FileSystemDirectoryHandle, existing: LiteLibraryRecord | null): Promise<void> {
    setBusy(true)
    setProgress({ phase: 'files', scannedFiles: 0, currentPath: '' })
    try {
      const previous = existing ? await loadMedia(existing.id) : []
      const result = await scanDirectory(handle, existing ? { id: existing.id, createdAt: existing.createdAt } : null, previous, setProgress)
      await replaceLibrary(result.library, result.media)
      setActiveLibrary(result.library)
      setMedia(result.media)
      setSessionFiles(new Map())
      resetBrowseState()
      await refreshLibraries()
    } finally { setBusy(false); setProgress(null) }
  }

  async function indexFiles(files: File[], existing: LiteLibraryRecord | null): Promise<void> {
    setBusy(true)
    setProgress({ phase: 'files', scannedFiles: 0, currentPath: '' })
    try {
      const previous = existing ? await loadMedia(existing.id) : []
      const result = await scanFileSelection(files, existing ? { id: existing.id, createdAt: existing.createdAt } : null, previous, setProgress)
      if (existing && result.library.name !== existing.name) throw new Error(`Selected “${result.library.name}”, but this index belongs to “${existing.name}”. Choose the original folder.`)
      await replaceLibrary(result.library, result.media)
      setActiveLibrary(result.library)
      setMedia(result.media)
      setSessionFiles(result.sessionFiles)
      resetBrowseState()
      await refreshLibraries()
    } finally { setBusy(false); setProgress(null) }
  }

  async function forgetLibrary(library: LiteLibraryRecord): Promise<void> {
    if (!window.confirm(`Forget the local PhotoFind index for “${library.name}”? No photo files will be deleted.`)) return
    try {
      await deleteLibrary(library.id)
      if (activeLibrary?.id === library.id) { setActiveLibrary(null); setMedia([]); setSessionFiles(new Map()); resetBrowseState() }
      await refreshLibraries()
    } catch (cause) { setError(messageOf(cause)) }
  }

  function resetBrowseState(): void {
    setVisibleCount(PAGE_SIZE); setView('photos'); setYear(null); setFromDate(''); setToDate(''); setLocationFilter('all'); setDateMetadataFilter('all'); setFilterToViewport(false); setMapBounds(null); setSelectedMapId(null); setSimilarityProgress(null)
  }

  function clearFilters(): void {
    setYear(null); setFromDate(''); setToDate(''); setLocationFilter('all'); setDateMetadataFilter('all'); setFilterToViewport(false); setMapBounds(null); setVisibleCount(PAGE_SIZE)
  }

  return (
    <div className="lite-shell">
      <header className="topbar">
        <div><div className="eyebrow">PhotoFind Lite</div><h1>Find the photos worth keeping.</h1><p>Choose a folder on this computer. Dates, GPS, Takeout metadata and similarity analysis stay local; your photos and index are not uploaded.</p></div>
        <button className="primary" disabled={!supported || working} onClick={() => void addFolder()}>{working ? 'Working…' : 'Choose local folder'}</button>
      </header>

      {!supported && <div className="notice warning">Local folder access is not available in this browser.</div>}
      {folderMode === 'selection' && <div className="notice">This browser uses reconnect mode. The index persists locally, but reselect the folder after refresh to restore file previews and analysis access.</div>}
      {error && <div className="notice error">{error}</div>}
      {progress && <ProgressNotice progress={progress} />}

      <div className="workspace">
        <aside className="library-sidebar">
          <div className="sidebar-heading"><h2>Local indexes</h2><span>{libraries.length}</span></div>
          {libraries.length === 0 ? <p className="muted">No folders indexed in this browser yet.</p> : <div className="library-list">{libraries.map((library) => (
            <div className={activeLibrary?.id === library.id ? 'library-card active' : 'library-card'} key={library.id}>
              <button className="library-open" onClick={() => void openLibrary(library)}><strong>{library.name}</strong><span>{library.fileCount.toLocaleString()} files · {library.imageCount.toLocaleString()} photos</span></button>
              <button className="icon-button" title="Forget index" onClick={() => void forgetLibrary(library)}>×</button>
            </div>
          ))}</div>}
        </aside>

        <main className="library-main">
          {!activeLibrary ? <EmptyState /> : <>
            <section className="library-summary">
              <div><div className="eyebrow">Indexed folder</div><h2>{activeLibrary.name}</h2><p className="muted">Last indexed {new Date(activeLibrary.updatedAt).toLocaleString()}</p>{reconnectRequired && <p className="muted">Reselect this folder to restore previews and local analysis access.</p>}</div>
              <button disabled={working} onClick={() => void rescanActive()}>{libraryMode(activeLibrary) === 'selection' ? (reconnectRequired ? 'Reconnect folder' : 'Reselect & rescan') : 'Rescan folder'}</button>
            </section>

            <section className="stat-grid stat-grid-six">
              <Stat label="Photos" value={activeLibrary.imageCount} />
              <Stat label="Located" value={locatedCount} />
              <Stat label="File time only" value={fileTimeOnlyCount} warn={fileTimeOnlyCount > 0} />
              <Stat label="Groups" value={similarityGroups.length} />
              <Stat label="Videos" value={activeLibrary.videoCount} />
              <Stat label="Unknown" value={activeLibrary.unknownCount} warn={activeLibrary.unknownCount > 0} />
            </section>

            <BrowseFilters years={years} year={year} fromDate={fromDate} toDate={toDate} location={locationFilter} dateMetadata={dateMetadataFilter} matchingCount={filteredImages.length} totalCount={images.length} viewportActive={filterToViewport && mapBounds !== null}
              onYear={(value) => { setYear(value); setVisibleCount(PAGE_SIZE) }} onFromDate={(value) => { setFromDate(value); setVisibleCount(PAGE_SIZE) }} onToDate={(value) => { setToDate(value); setVisibleCount(PAGE_SIZE) }} onLocation={(value) => { setLocationFilter(value); setVisibleCount(PAGE_SIZE) }} onDateMetadata={(value) => { setDateMetadataFilter(value); setVisibleCount(PAGE_SIZE) }} onClear={clearFilters} />

            <div className="view-tabs" role="tablist" aria-label="Library view">
              <button className={view === 'photos' ? 'active' : ''} onClick={() => setView('photos')}>Photos</button>
              <button className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}>Map <span>{locatedCount.toLocaleString()}</span></button>
              <button className={view === 'groups' ? 'active' : ''} onClick={() => setView('groups')}>Groups <span>{similarityGroups.length.toLocaleString()}</span></button>
            </div>

            {view === 'map' && <MapResults items={mapItems} filterToViewport={filterToViewport} selected={selectedMapItem} sessionFiles={sessionFiles} onFilterToViewport={setFilterToViewport} onBoundsChange={handleMapBounds} onSelect={setSelectedMapId} onShowSelected={() => { setView('photos'); setVisibleCount(PAGE_SIZE) }} />}
            {view === 'photos' && <PhotoResults items={filteredImages} visibleCount={visibleCount} selectedId={selectedMapId} sessionFiles={sessionFiles} onShowMore={() => setVisibleCount((count) => count + PAGE_SIZE)} />}
            {view === 'groups' && <SimilarityGroups items={images} groups={similarityGroups} sessionFiles={sessionFiles} progress={similarityProgress} busy={similarityBusy} reconnectRequired={reconnectRequired} onAnalyze={() => void runSimilarityAnalysis()} />}

            <Diagnostics unknown={unknown} diagnostics={diagnostics} />
          </>}
        </main>
      </div>
    </div>
  )
}

function EmptyState(): JSX.Element {
  return <section className="empty-state"><h2>Start with a pile of photos</h2><p>Select a local folder or extracted Google Photos Takeout folder. PhotoFind builds a private local index with usable time, location and later similarity signals.</p><div className="privacy-grid"><div><strong>Local files</strong><span>No photo bytes or sidecar contents are uploaded.</span></div><div><strong>Local index</strong><span>EXIF, GPS, hashes and derived metadata stay in IndexedDB on this device.</span></div><div><strong>Map privacy</strong><span>Map tiles are fetched externally and reveal the approximate map area you view.</span></div></div></section>
}

function ProgressNotice({ progress }: { progress: LiteScanProgress }): JSX.Element {
  if (progress.phase === 'metadata') {
    const complete = (progress.metadataParsed ?? 0) + (progress.metadataReused ?? 0)
    return <div className="notice progress">Reading local metadata {complete.toLocaleString()} / {(progress.metadataTotal ?? 0).toLocaleString()}{progress.metadataReused ? ` · ${progress.metadataReused.toLocaleString()} unchanged reused` : ''}{progress.currentPath ? ` — ${progress.currentPath}` : ''}</div>
  }
  return <div className="notice progress">Indexed {progress.scannedFiles.toLocaleString()} files{progress.currentPath ? ` — ${progress.currentPath}` : ''}</div>
}

function Diagnostics({ unknown, diagnostics }: { unknown: LiteMediaRecord[]; diagnostics: Array<{ path: string; message: string }> }): JSX.Element {
  return <section className="diagnostics-section"><div className="section-heading"><div><div className="eyebrow">Diagnostics</div><h2>Nothing disappears silently</h2></div><span className="muted">{(unknown.length + diagnostics.length).toLocaleString()} notices</span></div>{unknown.length === 0 && diagnostics.length === 0 ? <p className="muted">No metadata, analysis or unknown-file diagnostics in this index.</p> : <ul className="diagnostic-list">{unknown.slice(0, 20).map((item) => <li key={`unknown-${item.id}`}>[INFO] {item.relativePath}: unrecognized file type</li>)}{diagnostics.slice(0, 50).map((entry, index) => <li key={`${entry.path}-${index}`}>[WARN] {entry.path}: {entry.message}</li>)}</ul>}</section>
}

function collectDiagnostics(items: LiteMediaRecord[]): Array<{ path: string; message: string }> {
  const output: Array<{ path: string; message: string }> = []
  for (const item of items) {
    for (const message of item.diagnostics ?? []) output.push({ path: item.relativePath, message })
    if (item.similarityError) output.push({ path: item.relativePath, message: `Similarity analysis: ${item.similarityError}` })
  }
  return output
}

function libraryMode(library: LiteLibraryRecord): LiteLibraryAccessMode { return library.accessMode ?? (library.rootHandle ? 'handle' : 'selection') }
function Stat({ label, value, warn = false }: { label: string; value: number; warn?: boolean }): JSX.Element { return <div className={warn ? 'stat-card warn' : 'stat-card'}><span>{label}</span><strong>{value.toLocaleString()}</strong></div> }
function messageOf(cause: unknown): string { return cause instanceof Error ? cause.message : 'Something went wrong.' }
function isAbort(cause: unknown): boolean { return cause instanceof DOMException && cause.name === 'AbortError' }
