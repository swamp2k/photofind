import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BrowseFilters } from './BrowseFilters'
import { ComparePanel } from './ComparePanel'
import { CurationPanel } from './CurationPanel'
import { applyEventOverrides, createEventOverride, matchingEventOverride } from './eventOverrides'
import { buildEvents } from './events'
import { EventsPanel } from './EventsPanel'
import { exportLocalPhotos } from './exporter'
import { ensureReadPermission, ensureWritePermission, localFolderAccessMode, pickExportDirectory, pickLocalDirectory, pickLocalDirectoryFiles, supportsWritableExport } from './fileAccess'
import { availableYears, dateInputToEnd, dateInputToStart, filterPhotos, hasLocation } from './filters'
import { deleteEventOverride, deleteLibrary, listLibraries, loadEventOverrides, loadMedia, loadPeople, putMediaRecords, replaceLibrary, saveEventOverride, savePeopleState } from './libraryDb'
import { MapResults } from './MapResults'
import { analyzePeople } from './peopleAnalysis'
import { clusterPeople, excludeFaceFromPerson, mergePeople as mergePeopleState, renamePerson as renamePersonState, setPersonIgnored, splitFaceIntoNewPerson } from './people'
import { PeoplePanel } from './PeoplePanel'
import { PhotoResults } from './PhotoResults'
import { analyzeQuality } from './qualityAnalysis'
import { QualityPanel } from './QualityPanel'
import { countReviewStates, filterByReview, setReviewAssignments } from './review'
import { ReviewSession } from './ReviewSession'
import { ReviewToolbar } from './ReviewToolbar'
import { scanDirectory, scanFileSelection } from './scanner'
import { buildSimilarityGroups } from './similarity'
import { analyzeSimilarity } from './similarityAnalysis'
import { SimilarityGroups } from './SimilarityGroups'
import { isInExactSourceFolder, sourceFolderLabel } from './sourcePath'
import { SourceNavigationProvider } from './SourceNavigation'
import type { LiteDateMetadataFilter, LiteEventOverride, LiteEventRecord, LiteExportLayout, LiteExportProgress, LiteExportResult, LiteGeoBounds, LiteLibraryAccessMode, LiteLibraryRecord, LiteLocationFilter, LiteMediaRecord, LitePeopleProgress, LitePersonRecord, LitePhotoFilters, LiteQualityProgress, LiteReviewFilter, LiteReviewState, LiteScanProgress, LiteSimilarityProgress } from './types'

const PAGE_SIZE = 120
type BrowseView = 'photos' | 'events' | 'map' | 'people' | 'groups' | 'quality' | 'review' | 'compare' | 'selection'

export function LiteApp(): JSX.Element {
  const [libraries, setLibraries] = useState<LiteLibraryRecord[]>([])
  const [activeLibrary, setActiveLibrary] = useState<LiteLibraryRecord | null>(null)
  const [media, setMedia] = useState<LiteMediaRecord[]>([])
  const mediaRef = useRef<LiteMediaRecord[]>([])
  const reviewQueue = useRef<Promise<void>>(Promise.resolve())
  const [people, setPeople] = useState<LitePersonRecord[]>([])
  const [eventOverrides, setEventOverrides] = useState<LiteEventOverride[]>([])
  const [sessionFiles, setSessionFiles] = useState<Map<string, File>>(new Map())
  const [progress, setProgress] = useState<LiteScanProgress | null>(null)
  const [similarityProgress, setSimilarityProgress] = useState<LiteSimilarityProgress | null>(null)
  const [qualityProgress, setQualityProgress] = useState<LiteQualityProgress | null>(null)
  const [peopleProgress, setPeopleProgress] = useState<LitePeopleProgress | null>(null)
  const [exportProgress, setExportProgress] = useState<LiteExportProgress | null>(null)
  const [exportResult, setExportResult] = useState<LiteExportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [similarityBusy, setSimilarityBusy] = useState(false)
  const [qualityBusy, setQualityBusy] = useState(false)
  const [peopleBusy, setPeopleBusy] = useState(false)
  const [reviewWrites, setReviewWrites] = useState(0)
  const [exportBusy, setExportBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [view, setView] = useState<BrowseView>('photos')
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceFolderFilter, setSourceFolderFilter] = useState<string | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [locationFilter, setLocationFilter] = useState<LiteLocationFilter>('all')
  const [dateMetadataFilter, setDateMetadataFilter] = useState<LiteDateMetadataFilter>('all')
  const [reviewFilter, setReviewFilter] = useState<LiteReviewFilter>('all')
  const [filterToViewport, setFilterToViewport] = useState(false)
  const [mapBounds, setMapBounds] = useState<LiteGeoBounds | null>(null)
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null)
  const folderMode = localFolderAccessMode()
  const supported = folderMode !== 'unsupported'
  const exportSupported = supportsWritableExport()
  const reviewBusy = reviewWrites > 0
  const working = busy || similarityBusy || qualityBusy || peopleBusy || reviewBusy || exportBusy

  useEffect(() => { void refreshLibraries() }, [])

  const images = useMemo(() => media.filter((item) => item.kind === 'image'), [media])
  const personNamesById = useMemo(() => new Map(people.map((person) => [person.id, person.name?.trim() ?? ''])), [people])
  const folderScopedImages = useMemo(() => sourceFolderFilter === null ? images : images.filter((item) => isInExactSourceFolder(item, sourceFolderFilter)), [images, sourceFolderFilter])
  const searchedImages = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase()
    if (!query) return folderScopedImages
    return folderScopedImages.filter((item) => {
      const personNames = (item.faces ?? []).map((face) => face.personId ? personNamesById.get(face.personId) : '').filter(Boolean)
      return [item.name, item.relativePath, item.cameraMake, item.cameraModel, ...personNames]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(query))
    })
  }, [folderScopedImages, personNamesById, searchQuery])
  const reviewCounts = useMemo(() => countReviewStates(images), [images])
  const similarityGroups = useMemo(() => buildSimilarityGroups(images), [images])
  const baseEvents = useMemo(() => buildEvents(images, similarityGroups), [images, similarityGroups])
  const events = useMemo(() => applyEventOverrides(baseEvents, eventOverrides), [baseEvents, eventOverrides])
  const namedEventByItemId = useMemo(() => {
    const map = new Map<string, string>()
    for (const event of events) {
      if (!event.customTitle) continue
      for (const itemId of event.itemIds) map.set(itemId, event.customTitle)
    }
    return map
  }, [events])
  const qualityReadyCount = useMemo(() => images.filter((item) => item.qualityStatus === 'ready').length, [images])
  const greatQualityCount = useMemo(() => images.filter((item) => item.qualityTier === 'great').length, [images])
  const visiblePeopleCount = useMemo(() => people.filter((person) => !person.ignored).length, [people])
  const years = useMemo(() => availableYears(images), [images])
  const baseFilters = useMemo<LitePhotoFilters>(() => ({
    year,
    fromTime: dateInputToStart(fromDate),
    toTime: dateInputToEnd(toDate),
    location: locationFilter,
    dateMetadata: dateMetadataFilter,
    mapBounds: null
  }), [year, fromDate, toDate, locationFilter, dateMetadataFilter])
  const contextMapItems = useMemo(() => filterPhotos(searchedImages, baseFilters), [searchedImages, baseFilters])
  const mapItems = useMemo(() => filterByReview(contextMapItems, reviewFilter), [contextMapItems, reviewFilter])
  const contextFilteredImages = useMemo(() => filterPhotos(searchedImages, { ...baseFilters, mapBounds: filterToViewport ? mapBounds : null }), [searchedImages, baseFilters, filterToViewport, mapBounds])
  const filteredImages = useMemo(() => filterByReview(contextFilteredImages, reviewFilter), [contextFilteredImages, reviewFilter])
  const filteredIds = useMemo(() => new Set(filteredImages.map((item) => item.id)), [filteredImages])
  const contextualGroups = useMemo(() => similarityGroups.filter((group) => group.itemIds.some((id) => filteredIds.has(id))), [filteredIds, similarityGroups])
  const unknown = useMemo(() => media.filter((item) => item.kind === 'unknown'), [media])
  const locatedCount = useMemo(() => images.filter(hasLocation).length, [images])
  const diagnostics = useMemo(() => collectDiagnostics(media), [media])
  const reconnectRequired = activeLibrary !== null && libraryMode(activeLibrary) === 'selection' && sessionFiles.size === 0
  const selectedMapItem = selectedMapId ? images.find((item) => item.id === selectedMapId) ?? null : null
  const handleMapBounds = useCallback((bounds: LiteGeoBounds | null) => { setMapBounds(bounds); setVisibleCount(PAGE_SIZE) }, [])

  function setMediaState(next: LiteMediaRecord[]): void {
    mediaRef.current = next
    setMedia(next)
  }

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
      const [storedMedia, storedPeople, storedEventOverrides] = await Promise.all([loadMedia(library.id), loadPeople(library.id), loadEventOverrides(library.id)])
      setActiveLibrary(library)
      setMediaState(storedMedia)
      setPeople(storedPeople)
      setEventOverrides(storedEventOverrides)
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
    if (!activeLibrary || reconnectRequired || working) return
    setError(null)
    setSimilarityBusy(true)
    setSimilarityProgress({ complete: 0, total: images.length, reused: 0, currentPath: '' })
    try {
      const updated = await analyzeSimilarity(mediaRef.current, {
        resolveFile: resolveLocalFile,
        onProgress: setSimilarityProgress,
        persistBatch: putMediaRecords
      })
      setMediaState(updated)
    } catch (cause) {
      setError(`Similarity analysis stopped: ${messageOf(cause)}`)
    } finally {
      setSimilarityBusy(false)
      setSimilarityProgress(null)
    }
  }

  async function runQualityAnalysis(): Promise<void> {
    if (!activeLibrary || reconnectRequired || working) return
    setError(null)
    setQualityBusy(true)
    setQualityProgress({ complete: 0, total: images.length, reused: 0, currentPath: '' })
    try {
      const updated = await analyzeQuality(mediaRef.current, {
        resolveFile: resolveLocalFile,
        onProgress: setQualityProgress,
        persistBatch: putMediaRecords
      })
      setMediaState(updated)
    } catch (cause) {
      setError(`Quality analysis stopped: ${messageOf(cause)}`)
    } finally {
      setQualityBusy(false)
      setQualityProgress(null)
    }
  }

  async function runPeopleAnalysis(): Promise<void> {
    if (!activeLibrary || reconnectRequired || working) return
    setError(null)
    setPeopleBusy(true)
    setPeopleProgress({ phase: 'models', complete: 0, total: images.length, reused: 0, facesFound: 0, currentPath: 'Loading local face models…' })
    try {
      const result = await analyzePeople(mediaRef.current, {
        existingPeople: people,
        resolveFile: resolveLocalFile,
        persistBatch: putMediaRecords,
        onProgress: setPeopleProgress
      })
      await savePeopleState(activeLibrary.id, result.people, result.changed)
      setMediaState(result.items)
      setPeople(result.people)
    } catch (cause) {
      setError(`People analysis stopped: ${messageOf(cause)}`)
    } finally {
      setPeopleBusy(false)
      setPeopleProgress(null)
    }
  }

  function updateReview(targets: LiteMediaRecord[], state: LiteReviewState): void {
    applyReviewAssignments(new Map(targets.map((item) => [item.id, state])))
  }

  function pickBest(selected: LiteMediaRecord, others: LiteMediaRecord[]): void {
    const assignments = new Map<string, LiteReviewState>([[selected.id, 'keep']])
    for (const item of others) assignments.set(item.id, 'reject')
    applyReviewAssignments(assignments)
  }

  function applyReviewAssignments(assignments: ReadonlyMap<string, LiteReviewState>): void {
    const result = setReviewAssignments(mediaRef.current, assignments)
    if (result.changed.length === 0) return
    setMediaState(result.items)
    setReviewWrites((value) => value + 1)
    reviewQueue.current = reviewQueue.current
      .then(() => putMediaRecords(result.changed))
      .catch((cause) => { setError(`A review decision could not be persisted: ${messageOf(cause)}`) })
      .finally(() => setReviewWrites((value) => Math.max(0, value - 1)))
  }

  function bulkReview(state: LiteReviewState): void {
    if (filteredImages.length >= 250 && !window.confirm(`Mark all ${filteredImages.length.toLocaleString()} current results as ${state}? This only changes the local PhotoFind index and can be reversed.`)) return
    updateReview(filteredImages, state)
  }

  async function renamePerson(personId: string, name: string): Promise<void> {
    if (!activeLibrary) return
    const next = renamePersonState(people, personId, name)
    try {
      await savePeopleState(activeLibrary.id, next, [])
      setPeople(next)
    } catch (cause) { setError(`Person name was not saved: ${messageOf(cause)}`) }
  }

  async function ignorePerson(personId: string, ignored: boolean): Promise<void> {
    if (!activeLibrary) return
    const next = setPersonIgnored(people, personId, ignored)
    try {
      await savePeopleState(activeLibrary.id, next, [])
      setPeople(next)
    } catch (cause) { setError(`Person visibility was not saved: ${messageOf(cause)}`) }
  }

  async function mergePerson(sourceId: string, targetId: string): Promise<void> {
    if (!activeLibrary) return
    const result = mergePeopleState(mediaRef.current, people, sourceId, targetId)
    try {
      await savePeopleState(activeLibrary.id, result.people, result.changed)
      setMediaState(result.items)
      setPeople(result.people)
    } catch (cause) { setError(`People clusters were not merged: ${messageOf(cause)}`) }
  }

  async function splitPersonFace(faceRef: string): Promise<void> {
    if (!activeLibrary) return
    const result = splitFaceIntoNewPerson(mediaRef.current, people, faceRef)
    try {
      await savePeopleState(activeLibrary.id, result.people, result.changed)
      setMediaState(result.items)
      setPeople(result.people)
    } catch (cause) { setError(`Face was not split into a new person: ${messageOf(cause)}`) }
  }

  async function excludePersonFace(faceRef: string, personId: string): Promise<void> {
    if (!activeLibrary) return
    const result = excludeFaceFromPerson(mediaRef.current, people, faceRef, personId)
    try {
      await savePeopleState(activeLibrary.id, result.people, result.changed)
      setMediaState(result.items)
      setPeople(result.people)
    } catch (cause) { setError(`Face correction was not saved: ${messageOf(cause)}`) }
  }

  async function renameEvent(event: LiteEventRecord, title: string): Promise<void> {
    if (!activeLibrary) return
    const prior = matchingEventOverride(event, eventOverrides)
    const next = createEventOverride(event, title)
    try {
      if (!next) {
        if (!prior) return
        await deleteEventOverride(prior.id)
        setEventOverrides((current) => current.filter((override) => override.id !== prior.id))
        return
      }
      await saveEventOverride(next)
      if (prior && prior.id !== next.id) await deleteEventOverride(prior.id)
      setEventOverrides((current) => [next, ...current.filter((override) => override.id !== next.id && override.id !== prior?.id)])
    } catch (cause) { setError(`Event name was not saved: ${messageOf(cause)}`) }
  }

  async function runExport(items: LiteMediaRecord[], layout: LiteExportLayout, includeReports: boolean, embedMetadata: boolean, includeEventName: boolean, preserveModifiedDates: boolean): Promise<void> {
    if (exportBusy || items.length === 0 || reconnectRequired) return
    setError(null)
    setExportResult(null)
    try {
      const destination = await pickExportDirectory()
      if (!(await ensureWritePermission(destination))) throw new Error('Write permission was not granted for the export folder.')
      setExportBusy(true)
      setExportProgress({ complete: 0, total: items.length, exported: 0, renamed: 0, failed: 0, metadataEmbedded: 0, sidecarsWritten: 0, currentPath: '' })
      const result = await exportLocalPhotos({
        items,
        destination,
        layout,
        includeReports,
        embedMetadata,
        includeEventName,
        preserveModifiedDates,
        eventNameForItem: (item) => namedEventByItemId.get(item.id),
        resolveFile: resolveLocalFile,
        onProgress: setExportProgress
      })
      setExportResult(result)
      if (result.failures.length > 0) setError(`Export completed with ${result.failures.length.toLocaleString()} notices or failures. Details remain visible in Selection.`)
    } catch (cause) {
      if (!isAbort(cause)) setError(`Export stopped: ${messageOf(cause)}`)
    } finally {
      setExportBusy(false)
      setExportProgress(null)
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

  async function applyScanResult(library: LiteLibraryRecord, scannedMedia: LiteMediaRecord[], nextSessionFiles: Map<string, File>, existing: boolean): Promise<void> {
    const reconciled = clusterPeople(scannedMedia, existing ? people : [])
    await replaceLibrary(library, reconciled.items)
    await savePeopleState(library.id, reconciled.people, reconciled.changed)
    setActiveLibrary(library)
    setMediaState(reconciled.items)
    setPeople(reconciled.people)
    if (!existing) setEventOverrides([])
    setSessionFiles(nextSessionFiles)
    resetBrowseState()
    await refreshLibraries()
  }

  async function indexHandle(handle: FileSystemDirectoryHandle, existing: LiteLibraryRecord | null): Promise<void> {
    setBusy(true)
    setProgress({ phase: 'files', scannedFiles: 0, currentPath: '' })
    try {
      const previous = existing ? await loadMedia(existing.id) : []
      const result = await scanDirectory(handle, existing ? { id: existing.id, createdAt: existing.createdAt } : null, previous, setProgress)
      await applyScanResult(result.library, result.media, new Map(), Boolean(existing))
    } finally { setBusy(false); setProgress(null) }
  }

  async function indexFiles(files: File[], existing: LiteLibraryRecord | null): Promise<void> {
    setBusy(true)
    setProgress({ phase: 'files', scannedFiles: 0, currentPath: '' })
    try {
      const previous = existing ? await loadMedia(existing.id) : []
      const result = await scanFileSelection(files, existing ? { id: existing.id, createdAt: existing.createdAt } : null, previous, setProgress)
      if (existing && result.library.name !== existing.name) throw new Error(`Selected “${result.library.name}”, but this index belongs to “${existing.name}”. Choose the original folder.`)
      await applyScanResult(result.library, result.media, result.sessionFiles, Boolean(existing))
    } finally { setBusy(false); setProgress(null) }
  }

  async function forgetLibrary(library: LiteLibraryRecord): Promise<void> {
    if (!window.confirm(`Forget the local PhotoFind index for “${library.name}”? No photo files will be deleted.`)) return
    try {
      await deleteLibrary(library.id)
      if (activeLibrary?.id === library.id) { setActiveLibrary(null); setMediaState([]); setPeople([]); setEventOverrides([]); setSessionFiles(new Map()); resetBrowseState() }
      await refreshLibraries()
    } catch (cause) { setError(messageOf(cause)) }
  }

  function resetBrowseState(): void {
    setVisibleCount(PAGE_SIZE); setView('photos'); setSearchQuery(''); setSourceFolderFilter(null); setYear(null); setFromDate(''); setToDate(''); setLocationFilter('all'); setDateMetadataFilter('all'); setReviewFilter('all'); setFilterToViewport(false); setMapBounds(null); setSelectedMapId(null); setSimilarityProgress(null); setQualityProgress(null); setPeopleProgress(null); setExportProgress(null); setExportResult(null)
  }

  function clearFilters(): void {
    setSearchQuery(''); setSourceFolderFilter(null); setYear(null); setFromDate(''); setToDate(''); setLocationFilter('all'); setDateMetadataFilter('all'); setFilterToViewport(false); setMapBounds(null); setVisibleCount(PAGE_SIZE)
  }

  function showSourceFolder(folder: string): void {
    setSearchQuery('')
    setSourceFolderFilter(folder)
    setYear(null)
    setFromDate('')
    setToDate('')
    setLocationFilter('all')
    setDateMetadataFilter('all')
    setReviewFilter('all')
    setFilterToViewport(false)
    setMapBounds(null)
    setSelectedMapId(null)
    setVisibleCount(PAGE_SIZE)
    setView('photos')
  }

  const focusedMode = view === 'review' || view === 'compare'
  const browseControls = view === 'photos' || view === 'map' || view === 'groups' || view === 'quality'
  const globalSearchDisabled = !activeLibrary || focusedMode || view === 'people' || view === 'events'

  return (
    <SourceNavigationProvider showFolder={showSourceFolder}>
      <div className="pf-app">
        <header className="pf-topbar">
          <div className="pf-brand"><span className="pf-logo" aria-hidden="true">P</span><div><strong>photofind</strong><span>Find the photos that matter.</span></div></div>
          <label className="global-search"><span aria-hidden="true">⌕</span><input type="search" value={searchQuery} disabled={globalSearchDisabled} onChange={(event) => { setSearchQuery(event.target.value); setVisibleCount(PAGE_SIZE) }} placeholder="Search filenames, folders, cameras or named people…" aria-label="Search local photo index" /></label>
          <div className="topbar-actions"><span className="local-only-pill">▣ 100% local</span><button className="primary" disabled={!supported || working} onClick={() => void addFolder()}>{working ? 'Working…' : '+ Add folder'}</button></div>
        </header>

        {!supported && <div className="notice warning">Local folder access is not available in this browser.</div>}
        {folderMode === 'selection' && <div className="notice">This browser uses reconnect mode. The local index and review decisions persist, but reselect the folder after refresh to restore previews, analysis and export access.</div>}
        {error && <div className="notice error">{error}</div>}
        {progress && <ProgressNotice progress={progress} />}

        <div className="pf-layout">
          <aside className="pf-sidebar">
            <nav className="mode-nav" aria-label="PhotoFind modes">
              <ModeButton icon="▦" label="Library" active={view === 'photos'} disabled={!activeLibrary} onClick={() => setView('photos')} />
              <ModeButton icon="◷" label="Events" count={events.length} active={view === 'events'} disabled={!activeLibrary} onClick={() => setView('events')} />
              <ModeButton icon="⌖" label="Map" count={locatedCount} active={view === 'map'} disabled={!activeLibrary} onClick={() => setView('map')} />
              <ModeButton icon="◎" label="People" count={visiblePeopleCount} active={view === 'people'} disabled={!activeLibrary} onClick={() => setView('people')} />
              <ModeButton icon="◫" label="Duplicates" count={similarityGroups.length} active={view === 'groups'} disabled={!activeLibrary} onClick={() => setView('groups')} />
              <ModeButton icon="✦" label="Quality" count={qualityReadyCount} active={view === 'quality'} disabled={!activeLibrary} onClick={() => setView('quality')} />
              <div className="nav-divider" />
              <ModeButton icon="▶" label="Review" count={reviewCounts.unreviewed} active={view === 'review'} disabled={!activeLibrary || filteredImages.length === 0 || reconnectRequired} onClick={() => setView('review')} />
              <ModeButton icon="◧" label="Compare" count={contextualGroups.length} active={view === 'compare'} disabled={!activeLibrary || contextualGroups.length === 0 || reconnectRequired} onClick={() => setView('compare')} />
              <ModeButton icon="✓" label="Selection" count={reviewCounts.keep} active={view === 'selection'} disabled={!activeLibrary} onClick={() => setView('selection')} />
            </nav>

            <section className="index-section">
              <div className="sidebar-heading"><h2>Local indexes</h2><span>{libraries.length}</span></div>
              {libraries.length === 0 ? <p className="sidebar-empty">No folders indexed yet.</p> : <div className="library-list">{libraries.map((library) => (
                <div className={activeLibrary?.id === library.id ? 'library-card active' : 'library-card'} key={library.id}>
                  <button className="library-open" onClick={() => void openLibrary(library)}><strong>{library.name}</strong><span>{library.imageCount.toLocaleString()} photos</span></button>
                  <button className="icon-button" title="Forget local index" aria-label={`Forget ${library.name} index`} onClick={() => void forgetLibrary(library)}>×</button>
                </div>
              ))}</div>}
            </section>
            <div className="sidebar-privacy"><span>▣</span><div><strong>Private by design</strong><small>Photos, face data and index stay on this device.</small></div></div>
          </aside>

          <main className={focusedMode ? 'pf-main focus-main' : 'pf-main'}>
            {!activeLibrary ? <EmptyState onChoose={() => void addFolder()} disabled={!supported || working} /> : focusedMode ? (
              view === 'review'
                ? <ReviewSession title={activeLibrary.name} items={filteredImages} sessionFiles={sessionFiles} onReview={updateReview} onExit={() => setView('photos')} />
                : <ComparePanel items={images} groups={contextualGroups} sessionFiles={sessionFiles} onReview={(item, state) => updateReview([item], state)} onPickBest={pickBest} />
            ) : <>
              <section className="collection-header">
                <div><span className="mode-kicker">{viewTitle(view)}</span><h1>{activeLibrary.name}</h1><p>{viewDescription(view)} · indexed {new Date(activeLibrary.updatedAt).toLocaleString()}</p></div>
                <div className="collection-actions"><div className="collection-totals"><span><strong>{activeLibrary.imageCount.toLocaleString()}</strong> photos</span><span className="keep"><strong>{reviewCounts.keep.toLocaleString()}</strong> keep</span><span className="maybe"><strong>{reviewCounts.maybe.toLocaleString()}</strong> maybe</span>{greatQualityCount > 0 && <span><strong>{greatQualityCount.toLocaleString()}</strong> great</span>}</div><button disabled={working} onClick={() => void rescanActive()}>{libraryMode(activeLibrary) === 'selection' ? (reconnectRequired ? 'Reconnect folder' : 'Reselect & rescan') : 'Rescan'}</button></div>
              </section>

              {reconnectRequired && <div className="notice warning inline-notice">Reconnect this folder to restore previews, analysis and export access.</div>}
              {sourceFolderFilter !== null && <div className="source-filter-banner"><div><span>Source folder</span><strong>{sourceFolderLabel(sourceFolderFilter)}</strong><code>{sourceFolderFilter || '(library root)'}</code></div><button type="button" onClick={() => setSourceFolderFilter(null)}>Clear folder filter</button></div>}

              {browseControls && <details className="filter-disclosure" open>
                <summary><span>Find & filter</span><strong>{filteredImages.length.toLocaleString()} matching</strong></summary>
                <BrowseFilters years={years} year={year} fromDate={fromDate} toDate={toDate} location={locationFilter} dateMetadata={dateMetadataFilter} matchingCount={filteredImages.length} totalCount={images.length} viewportActive={filterToViewport && mapBounds !== null}
                  onYear={(value) => { setYear(value); setVisibleCount(PAGE_SIZE) }} onFromDate={(value) => { setFromDate(value); setVisibleCount(PAGE_SIZE) }} onToDate={(value) => { setToDate(value); setVisibleCount(PAGE_SIZE) }} onLocation={(value) => { setLocationFilter(value); setVisibleCount(PAGE_SIZE) }} onDateMetadata={(value) => { setDateMetadataFilter(value); setVisibleCount(PAGE_SIZE) }} onClear={clearFilters} />
                <ReviewToolbar counts={reviewCounts} filter={reviewFilter} matchingCount={filteredImages.length} onFilter={(value) => { setReviewFilter(value); setVisibleCount(PAGE_SIZE) }} onBulk={bulkReview} />
              </details>}

              {view === 'events' && <EventsPanel items={images} events={events} people={people} sessionFiles={sessionFiles} onReview={(item, state) => updateReview([item], state)} onRename={(event, title) => void renameEvent(event, title)} />}
              {view === 'map' && <MapResults items={mapItems} filterToViewport={filterToViewport} selected={selectedMapItem} sessionFiles={sessionFiles} onFilterToViewport={setFilterToViewport} onBoundsChange={handleMapBounds} onSelect={setSelectedMapId} onShowSelected={() => { setView('photos'); setVisibleCount(PAGE_SIZE) }} onReview={(item, state) => updateReview([item], state)} />}
              {view === 'people' && <PeoplePanel items={images} people={people} sessionFiles={sessionFiles} progress={peopleProgress} busy={peopleBusy} reconnectRequired={reconnectRequired} onAnalyze={() => void runPeopleAnalysis()} onRename={(personId, name) => void renamePerson(personId, name)} onIgnore={(personId, ignored) => void ignorePerson(personId, ignored)} onMerge={(sourceId, targetId) => void mergePerson(sourceId, targetId)} onSplit={(faceRef) => void splitPersonFace(faceRef)} onExclude={(faceRef, personId) => void excludePersonFace(faceRef, personId)} onReview={(item, state) => updateReview([item], state)} />}
              {view === 'photos' && <PhotoResults items={filteredImages} visibleCount={visibleCount} selectedId={selectedMapId} sessionFiles={sessionFiles} onShowMore={() => setVisibleCount((count) => count + PAGE_SIZE)} onReview={(item, state) => updateReview([item], state)} />}
              {view === 'groups' && <SimilarityGroups items={images} groups={contextualGroups} reviewFilter={reviewFilter} sessionFiles={sessionFiles} progress={similarityProgress} busy={working} reconnectRequired={reconnectRequired} onAnalyze={() => void runSimilarityAnalysis()} onReview={(item, state) => updateReview([item], state)} />}
              {view === 'quality' && <QualityPanel items={filteredImages} sessionFiles={sessionFiles} progress={qualityProgress} busy={working} reconnectRequired={reconnectRequired} onAnalyze={() => void runQualityAnalysis()} onReview={(item, state) => updateReview([item], state)} />}
              {view === 'selection' && <CurationPanel items={images} events={events} sessionFiles={sessionFiles} exportSupported={exportSupported} reconnectRequired={reconnectRequired} busy={exportBusy} progress={exportProgress} result={exportResult} onReview={(item, state) => updateReview([item], state)} onExport={(items, layout, reports, metadata, eventNames, modifiedDates) => void runExport(items, layout, reports, metadata, eventNames, modifiedDates)} />}

              <Diagnostics unknown={unknown} diagnostics={diagnostics} />
            </>}
          </main>
        </div>
      </div>
    </SourceNavigationProvider>
  )
}

function ModeButton({ icon, label, count, active, disabled, onClick }: { icon: string; label: string; count?: number; active: boolean; disabled?: boolean; onClick(): void }): JSX.Element {
  return <button type="button" className={active ? 'mode-button active' : 'mode-button'} disabled={disabled} onClick={onClick}><span aria-hidden="true">{icon}</span><strong>{label}</strong>{typeof count === 'number' && <small>{count.toLocaleString()}</small>}</button>
}

function EmptyState({ onChoose, disabled }: { onChoose(): void; disabled: boolean }): JSX.Element {
  return <section className="empty-state modern-empty"><span className="empty-mark">P</span><h1>Your photos stay yours.</h1><p>Choose a local photo folder or extracted Google Photos Takeout. PhotoFind builds a private index in this browser, then helps you find, compare, review and export the moments worth keeping.</p><button type="button" className="primary" disabled={disabled} onClick={onChoose}>Choose local folder</button><div className="privacy-grid"><div><strong>100% local</strong><span>No photo bytes, metadata, hashes, face embeddings or decisions are uploaded.</span></div><div><strong>Smart and fast</strong><span>Timeline, map, people, events, similarity and quality analysis run on this device.</span></div><div><strong>Safe by default</strong><span>Source media stays read-only. Only explicit exports write new copies.</span></div></div></section>
}

function ProgressNotice({ progress }: { progress: LiteScanProgress }): JSX.Element {
  if (progress.phase === 'metadata') {
    const complete = (progress.metadataParsed ?? 0) + (progress.metadataReused ?? 0)
    return <div className="notice progress">Reading local metadata {complete.toLocaleString()} / {(progress.metadataTotal ?? 0).toLocaleString()}{progress.metadataReused ? ` · ${progress.metadataReused.toLocaleString()} unchanged reused` : ''}{progress.currentPath ? ` — ${progress.currentPath}` : ''}</div>
  }
  return <div className="notice progress">Indexed {progress.scannedFiles.toLocaleString()} files{progress.currentPath ? ` — ${progress.currentPath}` : ''}</div>
}

function Diagnostics({ unknown, diagnostics }: { unknown: LiteMediaRecord[]; diagnostics: Array<{ path: string; message: string }> }): JSX.Element {
  const count = unknown.length + diagnostics.length
  return <details className="diagnostics-section"><summary><span>Diagnostics</span><strong>{count.toLocaleString()} notices</strong></summary>{count === 0 ? <p>No metadata, analysis or unknown-file diagnostics in this index.</p> : <ul className="diagnostic-list">{unknown.slice(0, 20).map((item) => <li key={`unknown-${item.id}`}>[INFO] {item.relativePath}: unrecognized file type</li>)}{diagnostics.slice(0, 60).map((entry, index) => <li key={`${entry.path}-${index}`}>[WARN] {entry.path}: {entry.message}</li>)}</ul>}</details>
}

function collectDiagnostics(items: LiteMediaRecord[]): Array<{ path: string; message: string }> {
  const output: Array<{ path: string; message: string }> = []
  for (const item of items) {
    for (const message of item.diagnostics ?? []) output.push({ path: item.relativePath, message })
    if (item.similarityError) output.push({ path: item.relativePath, message: `Similarity analysis: ${item.similarityError}` })
    if (item.qualityError) output.push({ path: item.relativePath, message: `Quality analysis: ${item.qualityError}` })
    if (item.faceAnalysisError) output.push({ path: item.relativePath, message: `People analysis: ${item.faceAnalysisError}` })
  }
  return output
}

function viewTitle(view: Exclude<BrowseView, 'review' | 'compare'>): string {
  if (view === 'events') return 'Events'
  if (view === 'map') return 'Places'
  if (view === 'people') return 'People'
  if (view === 'groups') return 'Duplicates'
  if (view === 'quality') return 'Technical quality'
  if (view === 'selection') return 'Your selection'
  return 'Library'
}

function viewDescription(view: Exclude<BrowseView, 'review' | 'compare'>): string {
  if (view === 'events') return 'Browse and name locally derived moments across time, place, folders and people'
  if (view === 'map') return 'Explore the collection by location'
  if (view === 'people') return 'Name and correct private, browser-local face clusters'
  if (view === 'groups') return 'Find duplicates, bursts and similar scenes with their source folders'
  if (view === 'quality') return 'Find technically strong frames without confusing quality with importance'
  if (view === 'selection') return 'Filter keepers by event and export self-contained copies'
  return 'Browse and find the photos that matter'
}

function libraryMode(library: LiteLibraryRecord): LiteLibraryAccessMode { return library.accessMode ?? (library.rootHandle ? 'handle' : 'selection') }
function messageOf(cause: unknown): string { return cause instanceof Error ? cause.message : 'Something went wrong.' }
function isAbort(cause: unknown): boolean { return cause instanceof DOMException && cause.name === 'AbortError' }
