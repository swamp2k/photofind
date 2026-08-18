import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BrowseFilters } from './BrowseFilters'
import { ComparePanel } from './ComparePanel'
import { classifyLikelyNonPhoto, setScreenshotOverride } from './contentClassification'
import { usePhotoFindContextMenu } from './ContextMenu'
import { CurationPanel } from './CurationPanel'
import { buildExportEventNameMap } from './curationSelection'
import { applyEventOverrides, createEventKnownDateOverride, createEventOverride, createEventPhotoAdditionOverride, createEventPhotoRemovalOverride, createEventRemovalOverride, createManualEventOverride, isKnownDateEvent, matchingEventOverride } from './eventOverrides'
import { buildEvents, isMeaningfulEvent } from './events'
import { EventsPanel } from './EventsPanel'
import { exportLocalPhotos } from './exporter'
import { ensureReadPermission, ensureWritePermission, localFolderAccessMode, pickExportDirectory, pickLocalDirectory, pickLocalDirectoryFiles, supportsWritableExport } from './fileAccess'
import { availableYears, containsCoordinate, dateInputToEnd, dateInputToStart, filterPhotos, hasLocation } from './filters'
import { KnownDatesDialog } from './KnownDatesDialog'
import { mergeKnownDates } from './knownDates'
import { deleteEventOverride, deleteLibrary, listLibraries, loadEventOverrides, loadGlobalKnownDates, loadMedia, loadPeople, putMediaRecords, replaceLibrary, saveEventOverride, saveEventOverrideBatch, saveKnownDateState, savePeopleState } from './libraryDb'
import { MapResults } from './MapResults'
import { analyzePeople } from './peopleAnalysis'
import { clusterPeople, excludeFaceFromPerson, mergePeople as mergePeopleState, renamePerson as renamePersonState, setPersonIgnored, splitFaceIntoNewPerson } from './people'
import { PeoplePanel } from './PeoplePanel'
import { PhotoResults } from './PhotoResults'
import { analyzeQuality } from './qualityAnalysis'
import { QualityPanel } from './QualityPanel'
import { countReviewStates, filterByReview, isRejected, setReviewAssignments } from './review'
import { ReviewSession } from './ReviewSession'
import { useReviewSettings } from './ReviewSettings'
import { ReviewToolbar } from './ReviewToolbar'
import { scanDirectory, scanFileSelection } from './scanner'
import { buildSimilarityGroups } from './similarity'
import { analyzeSimilarity } from './similarityAnalysis'
import { SimilarityGroups } from './SimilarityGroups'
import { isInExactSourceFolder, sourceFolderLabel } from './sourcePath'
import { SourceNavigationProvider } from './SourceNavigation'
import { isStarred, setPhotoStarred } from './starred'
import { useGlobalStarredPhotos } from './globalStarred'
import type { LiteDateMetadataFilter, LiteEventOverride, LiteEventRecord, LiteExportLayout, LiteExportProgress, LiteExportResult, LiteGeoBounds, LiteKnownDateRecord, LiteLibraryAccessMode, LiteLibraryRecord, LiteLocationFilter, LiteMediaRecord, LitePeopleProgress, LitePersonRecord, LitePhotoFilters, LiteQualityProgress, LiteReviewFilter, LiteReviewState, LiteScanProgress, LiteSimilarityProgress } from './types'
import { clearUndoHistory, LIBRARY_STATE_CHANGED_EVENT, registerUndo, UndoControl } from './undoHistory'

type BrowseView = 'photos' | 'starred' | 'events' | 'map' | 'people' | 'groups' | 'quality' | 'review' | 'compare' | 'selection'

export function LiteApp(): JSX.Element {
  const { settings } = useReviewSettings()
  const pageSize = settings.photoBatchSize
  const [libraries, setLibraries] = useState<LiteLibraryRecord[]>([])
  const [activeLibrary, setActiveLibrary] = useState<LiteLibraryRecord | null>(null)
  const [media, setMedia] = useState<LiteMediaRecord[]>([])
  const mediaRef = useRef<LiteMediaRecord[]>([])
  const eventsRef = useRef<LiteEventRecord[]>([])
  const eventOverridesRef = useRef<LiteEventOverride[]>([])
  const reviewQueue = useRef<Promise<void>>(Promise.resolve())
  const similarityAbortRef = useRef<AbortController | null>(null)
  const qualityAbortRef = useRef<AbortController | null>(null)
  const peopleAbortRef = useRef<AbortController | null>(null)
  const { registerPhotoActions } = usePhotoFindContextMenu()
  const [people, setPeople] = useState<LitePersonRecord[]>([])
  const [eventOverrides, setEventOverrides] = useState<LiteEventOverride[]>([])
  eventOverridesRef.current = eventOverrides
  const [globalKnownDates, setGlobalKnownDates] = useState<LiteKnownDateRecord[]>([])
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
  const [knownDatesOpen, setKnownDatesOpen] = useState(false)
  const [contextCreateItemIds, setContextCreateItemIds] = useState<string[] | null>(null)
  const [contextCreateTitle, setContextCreateTitle] = useState('')
  const [contextCreateBusy, setContextCreateBusy] = useState(false)
  const [contextCreateError, setContextCreateError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(pageSize)
  const [view, setView] = useState<BrowseView>('photos')
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceFolderFilter, setSourceFolderFilter] = useState<string | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [locationFilter, setLocationFilter] = useState<LiteLocationFilter>('all')
  const [dateMetadataFilter, setDateMetadataFilter] = useState<LiteDateMetadataFilter>('all')
  const [reviewFilter, setReviewFilter] = useState<LiteReviewFilter>('all')
  const [mapBounds, setMapBounds] = useState<LiteGeoBounds | null>(null)
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null)
  const [showGlobalStarred, setShowGlobalStarred] = useState(false)
  const filterToViewport = view === 'map'
  const folderMode = localFolderAccessMode()
  const supported = folderMode !== 'unsupported'
  const exportSupported = supportsWritableExport()
  const reviewBusy = reviewWrites > 0
  const working = busy || similarityBusy || qualityBusy || peopleBusy || reviewBusy || exportBusy

  useEffect(() => {
    void refreshLibraries()
    void refreshGlobalKnownDates()
  }, [])
  useEffect(() => { setVisibleCount(pageSize) }, [pageSize])
  useEffect(() => { clearUndoHistory() }, [activeLibrary?.id])
  useEffect(() => {
    const libraryId = activeLibrary?.id
    if (!libraryId) return
    const handler = (): void => { void reloadLibraryState(libraryId) }
    window.addEventListener(LIBRARY_STATE_CHANGED_EVENT, handler)
    return () => window.removeEventListener(LIBRARY_STATE_CHANGED_EVENT, handler)
  }, [activeLibrary?.id])
  useEffect(() => {
    registerPhotoActions({
      resolvePhoto(id) {
        const item = mediaRef.current.find((candidate) => candidate.id === id && candidate.kind === 'image')
        return item ? { id: item.id, name: item.name, starred: isStarred(item), screenshot: classifyLikelyNonPhoto(item) !== null } : null
      },
      setStarred(id, starred) {
        setStarredState(id, starred)
      },
      setScreenshot(id, screenshot) {
        setScreenshotState(id, screenshot)
      },
      listKnownEvents(photoIds) {
        const targets = [...new Set(photoIds)]
        return eventsRef.current
          .filter(isKnownDateEvent)
          .sort((left, right) => right.startTime - left.startTime || left.title.localeCompare(right.title))
          .map((event) => {
            const included = targets.reduce((count, id) => count + (event.itemIds.includes(id) ? 1 : 0), 0)
            const partial = targets.length > 1 && included > 0 && included < targets.length
              ? `${included.toLocaleString()}/${targets.length.toLocaleString()} selected already added · `
              : ''
            return {
              id: event.id,
              title: event.title,
              hint: `${partial}${formatContextEventDate(event)} · ${event.itemIds.length.toLocaleString()}`,
              containsPhoto: targets.length > 0 && included === targets.length
            }
          })
      },
      resolveEvent(eventId, photoIds) {
        const event = eventsRef.current.find((candidate) => candidate.id === eventId)
        const targets = [...new Set(photoIds)]
        return event ? {
          id: event.id,
          title: event.title,
          hint: formatContextEventDate(event),
          containsPhoto: targets.length > 0 && targets.every((id) => event.itemIds.includes(id))
        } : null
      },
      createEvent(photoIds) {
        beginContextCreateEvent(photoIds)
      },
      addToEvent(photoIds, eventId) {
        return addPhotosToEventByIds(photoIds, eventId)
      },
      removeFromEvent(photoIds, eventId) {
        return removePhotosFromEventByIds(photoIds, eventId)
      }
    })
    return () => registerPhotoActions(null)
  }, [registerPhotoActions])

  const images = useMemo(() => media.filter((item) => item.kind === 'image'), [media])
  const activeImages = useMemo(() => images.filter((item) => !isRejected(item)), [images])
  const starredImages = useMemo(() => activeImages.filter(isStarred), [activeImages])
  const globalStarred = useGlobalStarredPhotos(view === 'starred' && showGlobalStarred)
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
  const allSimilarityGroups = useMemo(() => buildSimilarityGroups(images), [images])
  const similarityGroups = useMemo(() => buildSimilarityGroups(activeImages), [activeImages])
  const localKnownDates = activeLibrary?.knownDates
  const knownDates = useMemo(() => mergeKnownDates(localKnownDates ?? [], globalKnownDates), [globalKnownDates, localKnownDates])
  const baseEvents = useMemo(() => buildEvents(activeImages, similarityGroups, knownDates), [activeImages, similarityGroups, knownDates])
  const events = useMemo(() => applyEventOverrides(baseEvents, eventOverrides, activeImages), [activeImages, baseEvents, eventOverrides])
  eventsRef.current = events
  const meaningfulEvents = useMemo(() => events.filter(isMeaningfulEvent), [events])
  const exportEventByItemId = useMemo(() => buildExportEventNameMap(meaningfulEvents), [meaningfulEvents])
  const qualityReadyCount = useMemo(() => activeImages.filter((item) => item.qualityStatus === 'ready').length, [activeImages])
  const greatQualityCount = useMemo(() => activeImages.filter((item) => item.qualityTier === 'great').length, [activeImages])
  const peopleAnalyzedCount = useMemo(() => activeImages.filter((item) => item.faceAnalysisStatus === 'ready').length, [activeImages])
  const activePersonIds = useMemo(() => {
    const ids = new Set<string>()
    for (const item of activeImages) for (const face of item.faces ?? []) if (face.personId) ids.add(face.personId)
    return ids
  }, [activeImages])
  const visiblePeopleCount = useMemo(() => people.filter((person) => !person.ignored && activePersonIds.has(person.id)).length, [activePersonIds, people])
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
  const mapViewportItems = useMemo(() => {
    const located = mapItems.filter(hasLocation)
    if (!mapBounds) return located
    return located.filter((item) => containsCoordinate(mapBounds, item.latitude!, item.longitude!))
  }, [mapBounds, mapItems])
  const contextFilteredImages = useMemo(() => filterPhotos(searchedImages, { ...baseFilters, mapBounds: filterToViewport ? mapBounds : null }), [searchedImages, baseFilters, filterToViewport, mapBounds])
  const filteredImages = useMemo(() => filterByReview(contextFilteredImages, reviewFilter), [contextFilteredImages, reviewFilter])
  const globalStarredSearchedImages = useMemo(() => {
    if (!showGlobalStarred) return globalStarred.items
    const query = searchQuery.trim().toLocaleLowerCase()
    if (!query) return globalStarred.items
    return globalStarred.items.filter((item) => [item.name, item.relativePath, item.cameraMake, item.cameraModel]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(query)))
  }, [globalStarred.items, searchQuery, showGlobalStarred])
  const starredFilteredImages = useMemo(() => showGlobalStarred
    ? filterByReview(filterPhotos(globalStarredSearchedImages, baseFilters), reviewFilter)
    : filteredImages.filter(isStarred), [baseFilters, filteredImages, globalStarredSearchedImages, reviewFilter, showGlobalStarred])
  const currentBrowseImages = view === 'starred' ? starredFilteredImages : filteredImages
  const currentBrowseTotal = view === 'starred' ? (showGlobalStarred ? globalStarred.items.length : starredImages.length) : reviewFilter === 'reject' ? reviewCounts.reject : activeImages.length
  const filteredIds = useMemo(() => new Set(filteredImages.map((item) => item.id)), [filteredImages])
  const contextualGroupSource = reviewFilter === 'reject' ? allSimilarityGroups : similarityGroups
  const contextualGroups = useMemo(() => contextualGroupSource.filter((group) => group.itemIds.some((id) => filteredIds.has(id))), [contextualGroupSource, filteredIds])
  const unknown = useMemo(() => media.filter((item) => item.kind === 'unknown'), [media])
  const locatedCount = useMemo(() => activeImages.filter(hasLocation).length, [activeImages])
  const diagnostics = useMemo(() => collectDiagnostics(media), [media])
  const reconnectRequired = activeLibrary !== null && libraryMode(activeLibrary) === 'selection' && sessionFiles.size === 0
  const selectedMapItem = selectedMapId ? mapItems.find((item) => item.id === selectedMapId) ?? null : null
  const handleMapBounds = useCallback((bounds: LiteGeoBounds | null) => { setMapBounds(bounds); setVisibleCount(pageSize) }, [pageSize])

  function setMediaState(next: LiteMediaRecord[]): void {
    mediaRef.current = next
    setMedia(next)
  }

  function previousMediaRecords(changed: LiteMediaRecord[]): LiteMediaRecord[] {
    const ids = new Set(changed.map((item) => item.id))
    return mediaRef.current.filter((item) => ids.has(item.id))
  }

  function updateEventOverrideState(upserts: LiteEventOverride[], removeIds: string[] = []): void {
    setEventOverrides((current) => {
      const next = nextEventOverrideState(current, upserts, removeIds)
      eventOverridesRef.current = next
      return next
    })
  }

  function setStarredState(itemId: string, starred: boolean): void {
    const previous = mediaRef.current.find((item) => item.id === itemId)
    const result = setPhotoStarred(mediaRef.current, itemId, starred)
    if (!result.changed) return
    setMediaState(result.items)
    setReviewWrites((value) => value + 1)
    const changed = result.changed
    reviewQueue.current = reviewQueue.current
      .then(async () => {
        await putMediaRecords([changed])
        if (previous) registerUndo(starred ? 'Star photo' : 'Unstar photo', () => putMediaRecords([previous]))
      })
      .catch((cause) => { setError(`Starred status could not be persisted: ${messageOf(cause)}`) })
      .finally(() => setReviewWrites((value) => Math.max(0, value - 1)))
  }

  function setScreenshotState(itemId: string, screenshot: boolean): void {
    const previous = mediaRef.current.find((item) => item.id === itemId)
    const result = setScreenshotOverride(mediaRef.current, itemId, screenshot)
    if (!result.changed) return
    setMediaState(result.items)
    setReviewWrites((value) => value + 1)
    const changed = result.changed
    reviewQueue.current = reviewQueue.current
      .then(async () => {
        await putMediaRecords([changed])
        if (previous) registerUndo(screenshot ? 'Mark as screenshot' : 'Restore photo classification', () => putMediaRecords([previous]))
      })
      .catch((cause) => { setError(`Screenshot status could not be persisted: ${messageOf(cause)}`) })
      .finally(() => setReviewWrites((value) => Math.max(0, value - 1)))
  }

  async function refreshLibraries(): Promise<void> {
    try { setLibraries(await listLibraries()) } catch (cause) { setError(messageOf(cause)) }
  }

  async function refreshGlobalKnownDates(): Promise<void> {
    try { setGlobalKnownDates(await loadGlobalKnownDates()) } catch (cause) { setError(`Global known dates could not be loaded: ${messageOf(cause)}`) }
  }

  async function reloadLibraryState(libraryId: string): Promise<void> {
    try {
      const [nextLibraries, storedMedia, storedPeople, storedEventOverrides, storedGlobalKnownDates] = await Promise.all([
        listLibraries(),
        loadMedia(libraryId),
        loadPeople(libraryId),
        loadEventOverrides(libraryId),
        loadGlobalKnownDates()
      ])
      const nextLibrary = nextLibraries.find((library) => library.id === libraryId)
      setLibraries(nextLibraries)
      if (nextLibrary) setActiveLibrary(nextLibrary)
      setMediaState(storedMedia)
      setPeople(storedPeople)
      eventOverridesRef.current = storedEventOverrides
      setEventOverrides(storedEventOverrides)
      setGlobalKnownDates(storedGlobalKnownDates)
    } catch (cause) {
      setError(`The local library changed, but the refreshed state could not be loaded: ${messageOf(cause)}`)
    }
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
      eventOverridesRef.current = storedEventOverrides
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
    clearUndoHistory()
    const controller = new AbortController()
    similarityAbortRef.current = controller
    setError(null)
    setSimilarityBusy(true)
    setSimilarityProgress({ complete: 0, total: images.length, reused: 0, currentPath: '' })
    try {
      const updated = await analyzeSimilarity(mediaRef.current, {
        resolveFile: resolveLocalFile,
        onProgress: setSimilarityProgress,
        persistBatch: putMediaRecords,
        signal: controller.signal
      })
      setMediaState(updated)
    } catch (cause) {
      if (isAbort(cause)) await reloadPersistedMedia(activeLibrary.id)
      else setError(`Similarity analysis stopped: ${messageOf(cause)}`)
    } finally {
      if (similarityAbortRef.current === controller) similarityAbortRef.current = null
      setSimilarityBusy(false)
      setSimilarityProgress(null)
    }
  }

  async function runQualityAnalysis(): Promise<void> {
    if (!activeLibrary || reconnectRequired || working) return
    clearUndoHistory()
    const controller = new AbortController()
    qualityAbortRef.current = controller
    setError(null)
    setQualityBusy(true)
    setQualityProgress({ complete: 0, total: images.length, reused: 0, currentPath: '' })
    try {
      const updated = await analyzeQuality(mediaRef.current, {
        resolveFile: resolveLocalFile,
        onProgress: setQualityProgress,
        persistBatch: putMediaRecords,
        signal: controller.signal
      })
      setMediaState(updated)
    } catch (cause) {
      if (isAbort(cause)) await reloadPersistedMedia(activeLibrary.id)
      else setError(`Quality analysis stopped: ${messageOf(cause)}`)
    } finally {
      if (qualityAbortRef.current === controller) qualityAbortRef.current = null
      setQualityBusy(false)
      setQualityProgress(null)
    }
  }

  async function runPeopleAnalysis(): Promise<void> {
    if (!activeLibrary || reconnectRequired || working) return
    clearUndoHistory()
    const controller = new AbortController()
    peopleAbortRef.current = controller
    setError(null)
    setPeopleBusy(true)
    setPeopleProgress({ phase: 'models', complete: 0, total: images.length, reused: 0, facesFound: 0, currentPath: 'Loading local face models…' })
    try {
      const result = await analyzePeople(mediaRef.current, {
        existingPeople: people,
        resolveFile: resolveLocalFile,
        persistBatch: putMediaRecords,
        onProgress: setPeopleProgress,
        signal: controller.signal
      })
      await savePeopleState(activeLibrary.id, result.people, result.changed)
      setMediaState(result.items)
      setPeople(result.people)
    } catch (cause) {
      if (isAbort(cause)) await reloadPersistedMedia(activeLibrary.id)
      else setError(`People analysis stopped: ${messageOf(cause)}`)
    } finally {
      if (peopleAbortRef.current === controller) peopleAbortRef.current = null
      setPeopleBusy(false)
      setPeopleProgress(null)
    }
  }

  function stopSimilarityAnalysis(): void { similarityAbortRef.current?.abort() }
  function stopQualityAnalysis(): void { qualityAbortRef.current?.abort() }
  function stopPeopleAnalysis(): void { peopleAbortRef.current?.abort() }

  async function reloadPersistedMedia(libraryId: string): Promise<void> {
    try {
      setMediaState(await loadMedia(libraryId))
    } catch (cause) {
      setError(`Analysis stopped, but the partial local results could not be reloaded: ${messageOf(cause)}`)
    }
  }

  function updateReview(targets: LiteMediaRecord[], state: LiteReviewState, undoLabel?: string): void {
    applyReviewAssignments(new Map(targets.map((item) => [item.id, state])), undoLabel)
  }

  async function updateStarredReview(item: LiteMediaRecord, state: LiteReviewState): Promise<void> {
    if (!showGlobalStarred || item.libraryId === activeLibrary?.id) {
      updateReview([item], state)
      return
    }
    const result = setReviewAssignments([item], new Map([[item.id, state]]))
    if (result.changed.length === 0) return
    const previous = item
    try {
      await putMediaRecords(result.changed)
      window.dispatchEvent(new Event(LIBRARY_STATE_CHANGED_EVENT))
      registerUndo('Review global starred photo', async () => {
        await putMediaRecords([previous])
        window.dispatchEvent(new Event(LIBRARY_STATE_CHANGED_EVENT))
      })
    } catch (cause) {
      setError(`Review state could not be saved for the other photo index: ${messageOf(cause)}`)
    }
  }

  function pickBest(selected: LiteMediaRecord, others: LiteMediaRecord[]): void {
    const assignments = new Map<string, LiteReviewState>([[selected.id, 'keep']])
    for (const item of others) assignments.set(item.id, 'reject')
    applyReviewAssignments(assignments, 'Pick best photo')
  }

  function applyReviewAssignments(assignments: ReadonlyMap<string, LiteReviewState>, undoLabel?: string): void {
    const result = setReviewAssignments(mediaRef.current, assignments)
    if (result.changed.length === 0) return
    const previous = previousMediaRecords(result.changed)
    const label = undoLabel ?? reviewUndoLabel(assignments, result.changed.length)
    setMediaState(result.items)
    setReviewWrites((value) => value + 1)
    reviewQueue.current = reviewQueue.current
      .then(async () => {
        await putMediaRecords(result.changed)
        registerUndo(label, () => putMediaRecords(previous))
      })
      .catch((cause) => { setError(`A review decision could not be persisted: ${messageOf(cause)}`) })
      .finally(() => setReviewWrites((value) => Math.max(0, value - 1)))
  }

  function bulkReview(state: LiteReviewState): void {
    if (currentBrowseImages.length >= 250 && !window.confirm(`Mark all ${currentBrowseImages.length.toLocaleString()} current results as ${state}? This only changes the local PhotoFind index and can be reversed.`)) return
    updateReview(currentBrowseImages, state)
  }

  async function renamePerson(personId: string, name: string): Promise<void> {
    if (!activeLibrary) return
    const libraryId = activeLibrary.id
    const previousPeople = people
    const next = renamePersonState(people, personId, name)
    try {
      await savePeopleState(libraryId, next, [])
      setPeople(next)
      registerUndo('Rename person', () => savePeopleState(libraryId, previousPeople, []))
    } catch (cause) { setError(`Person name was not saved: ${messageOf(cause)}`) }
  }

  async function ignorePerson(personId: string, ignored: boolean): Promise<void> {
    if (!activeLibrary) return
    const libraryId = activeLibrary.id
    const previousPeople = people
    const next = setPersonIgnored(people, personId, ignored)
    try {
      await savePeopleState(libraryId, next, [])
      setPeople(next)
      registerUndo(ignored ? 'Ignore person' : 'Restore person', () => savePeopleState(libraryId, previousPeople, []))
    } catch (cause) { setError(`Person visibility was not saved: ${messageOf(cause)}`) }
  }

  async function mergePerson(sourceId: string, targetId: string): Promise<void> {
    if (!activeLibrary) return
    const libraryId = activeLibrary.id
    const previousPeople = people
    const result = mergePeopleState(mediaRef.current, people, sourceId, targetId)
    const previousMedia = previousMediaRecords(result.changed)
    try {
      await savePeopleState(libraryId, result.people, result.changed)
      setMediaState(result.items)
      setPeople(result.people)
      registerUndo('Merge people', () => savePeopleState(libraryId, previousPeople, previousMedia))
    } catch (cause) { setError(`People clusters were not merged: ${messageOf(cause)}`) }
  }

  async function splitPersonFace(faceRef: string): Promise<void> {
    if (!activeLibrary) return
    const libraryId = activeLibrary.id
    const previousPeople = people
    const result = splitFaceIntoNewPerson(mediaRef.current, people, faceRef)
    const previousMedia = previousMediaRecords(result.changed)
    try {
      await savePeopleState(libraryId, result.people, result.changed)
      setMediaState(result.items)
      setPeople(result.people)
      registerUndo('Split person face', () => savePeopleState(libraryId, previousPeople, previousMedia))
    } catch (cause) { setError(`Face was not split into a new person: ${messageOf(cause)}`) }
  }

  async function excludePersonFace(faceRef: string, personId: string): Promise<void> {
    if (!activeLibrary) return
    const libraryId = activeLibrary.id
    const previousPeople = people
    const result = excludeFaceFromPerson(mediaRef.current, people, faceRef, personId)
    const previousMedia = previousMediaRecords(result.changed)
    try {
      await savePeopleState(libraryId, result.people, result.changed)
      setMediaState(result.items)
      setPeople(result.people)
      registerUndo('Correct person match', () => savePeopleState(libraryId, previousPeople, previousMedia))
    } catch (cause) { setError(`Face correction was not saved: ${messageOf(cause)}`) }
  }

  async function addKnownEvent(event: LiteEventRecord): Promise<void> {
    if (!activeLibrary || isKnownDateEvent(event)) return
    const before = eventOverridesRef.current
    const prior = matchingEventOverride(event, before)
    const next = createEventKnownDateOverride(event, prior)
    const removeIds = prior && prior.id !== next.id ? [prior.id] : []
    const after = nextEventOverrideState(before, [next], removeIds)
    try {
      setError(null)
      await saveEventOverrideBatch([next], removeIds)
      updateEventOverrideState([next], removeIds)
      registerEventStateUndo('Add known event', before, after)
    } catch (cause) {
      const message = `Event could not be added to Known dates & holidays: ${messageOf(cause)}`
      setError(message)
      throw new Error(message)
    }
  }

  async function renameEvent(event: LiteEventRecord, title: string): Promise<void> {
    if (!activeLibrary) return
    const before = eventOverridesRef.current
    const prior = matchingEventOverride(event, before)
    const next = createEventOverride(event, title, Date.now(), prior)
    try {
      if (!next) {
        if (!prior) return
        await deleteEventOverride(prior.id)
        const after = nextEventOverrideState(before, [], [prior.id])
        updateEventOverrideState([], [prior.id])
        registerEventStateUndo('Rename event', before, after)
        return
      }
      const removeIds = prior && prior.id !== next.id ? [prior.id] : []
      const after = nextEventOverrideState(before, [next], removeIds)
      await saveEventOverrideBatch([next], removeIds)
      updateEventOverrideState([next], removeIds)
      registerEventStateUndo('Rename event', before, after)
    } catch (cause) { setError(`Event name was not saved: ${messageOf(cause)}`) }
  }

  async function removeEvent(event: LiteEventRecord): Promise<void> {
    if (!activeLibrary) return
    const before = eventOverridesRef.current
    const prior = matchingEventOverride(event, before)
    const next = createEventRemovalOverride(event, prior)
    const removeIds = prior && prior.id !== next.id ? [prior.id] : []
    const after = nextEventOverrideState(before, [next], removeIds)
    try {
      await saveEventOverrideBatch([next], removeIds)
      updateEventOverrideState([next], removeIds)
      registerEventStateUndo('Remove event', before, after)
    } catch (cause) { setError(`Event could not be removed: ${messageOf(cause)}`) }
  }

  async function removePhotosFromEvent(event: LiteEventRecord, targets: LiteMediaRecord[]): Promise<void> {
    if (!activeLibrary || targets.length === 0) return
    const before = eventOverridesRef.current
    const prior = matchingEventOverride(event, before)
    const next = createEventPhotoRemovalOverride(event, targets.map((item) => item.id), prior)
    const removeIds = prior && prior.id !== next.id ? [prior.id] : []
    const after = nextEventOverrideState(before, [next], removeIds)
    try {
      await saveEventOverrideBatch([next], removeIds)
      updateEventOverrideState([next], removeIds)
      registerEventStateUndo('Remove photos from event', before, after)
    } catch (cause) { setError(`Photos could not be removed from the event: ${messageOf(cause)}`) }
  }

  async function addPhotosToEventByIds(photoIds: string[], eventId: string): Promise<void> {
    const event = eventsRef.current.find((candidate) => candidate.id === eventId && isKnownDateEvent(candidate))
    if (!event) return
    const availableIds = new Set(mediaRef.current.filter((candidate) => candidate.kind === 'image' && !isRejected(candidate)).map((candidate) => candidate.id))
    const additions = [...new Set(photoIds)].filter((id) => availableIds.has(id) && !event.itemIds.includes(id))
    if (additions.length === 0) return
    const before = eventOverridesRef.current
    const prior = matchingEventOverride(event, before)
    const next = createEventPhotoAdditionOverride(event, additions, prior)
    const removeIds = prior && prior.id !== next.id ? [prior.id] : []
    const after = nextEventOverrideState(before, [next], removeIds)
    try {
      setError(null)
      await saveEventOverrideBatch([next], removeIds)
      updateEventOverrideState([next], removeIds)
      registerEventStateUndo('Add photos to event', before, after)
    } catch (cause) {
      setError(`${additions.length === 1 ? 'Photo' : 'Photos'} could not be added to “${event.title}”: ${messageOf(cause)}`)
    }
  }

  async function removePhotosFromEventByIds(photoIds: string[], eventId: string): Promise<void> {
    const event = eventsRef.current.find((candidate) => candidate.id === eventId)
    if (!event) return
    const removals = [...new Set(photoIds)].filter((id) => event.itemIds.includes(id))
    if (removals.length === 0) return
    const before = eventOverridesRef.current
    const prior = matchingEventOverride(event, before)
    const next = createEventPhotoRemovalOverride(event, removals, prior)
    const removeIds = prior && prior.id !== next.id ? [prior.id] : []
    const after = nextEventOverrideState(before, [next], removeIds)
    try {
      setError(null)
      await saveEventOverrideBatch([next], removeIds)
      updateEventOverrideState([next], removeIds)
      registerEventStateUndo('Remove photos from event', before, after)
    } catch (cause) {
      setError(`${removals.length === 1 ? 'Photo' : 'Photos'} could not be removed from “${event.title}”: ${messageOf(cause)}`)
    }
  }

  function beginContextCreateEvent(photoIds: string[]): void {
    const availableIds = new Set(mediaRef.current.filter((candidate) => candidate.kind === 'image' && !isRejected(candidate)).map((candidate) => candidate.id))
    const targets = [...new Set(photoIds)].filter((id) => availableIds.has(id))
    if (targets.length === 0) return
    setContextCreateItemIds(targets)
    setContextCreateTitle('')
    setContextCreateError(null)
  }

  async function submitContextCreateEvent(): Promise<void> {
    if (!contextCreateItemIds || contextCreateItemIds.length === 0 || !contextCreateTitle.trim() || contextCreateBusy) return
    const targetIds = new Set(contextCreateItemIds)
    const targets = mediaRef.current.filter((item) => item.kind === 'image' && !isRejected(item) && targetIds.has(item.id))
    const libraryId = targets[0]?.libraryId
    if (!libraryId || targets.length === 0) {
      setContextCreateError('The selected photos are no longer available in this index.')
      return
    }
    const next = createManualEventOverride(libraryId, targets, contextCreateTitle.trim())
    if (!next) {
      setContextCreateError('Choose an event name and at least one photo.')
      return
    }
    const before = eventOverridesRef.current
    const after = nextEventOverrideState(before, [next])
    setContextCreateBusy(true)
    setContextCreateError(null)
    try {
      setError(null)
      await saveEventOverride(next)
      updateEventOverrideState([next])
      registerEventStateUndo('Create event', before, after)
      setContextCreateItemIds(null)
      setContextCreateTitle('')
    } catch (cause) {
      const message = `Event could not be created: ${messageOf(cause)}`
      setContextCreateError(message)
      setError(message)
    } finally {
      setContextCreateBusy(false)
    }
  }

  async function mergeEvents(targets: LiteEventRecord[], title: string): Promise<void> {
    if (!activeLibrary || targets.length < 2) return
    const targetIds = new Set(targets.flatMap((event) => event.itemIds))
    const unionItems = mediaRef.current.filter((item) => item.kind === 'image' && targetIds.has(item.id))
    const now = Date.now()
    const merged = createManualEventOverride(activeLibrary.id, unionItems, title, now)
    if (!merged) throw new Error('Choose a name and at least two events with photos.')

    const currentOverrides = eventOverridesRef.current
    const writes: LiteEventOverride[] = [merged]
    const deleteIds: string[] = []
    targets.forEach((event, index) => {
      const prior = matchingEventOverride(event, currentOverrides)
      const hidden = createEventRemovalOverride(event, prior, now + index + 1)
      writes.push(hidden)
      if (prior && prior.id !== hidden.id) deleteIds.push(prior.id)
    })
    const after = nextEventOverrideState(currentOverrides, writes, deleteIds)

    try {
      setError(null)
      await saveEventOverrideBatch(writes, deleteIds)
      updateEventOverrideState(writes, deleteIds)
      registerEventStateUndo('Merge events', currentOverrides, after)
    } catch (cause) {
      const message = `Events could not be merged: ${messageOf(cause)}`
      setError(message)
      throw new Error(message)
    }
  }

  async function createMapEvent(targets: LiteMediaRecord[], title: string): Promise<void> {
    if (!activeLibrary) throw new Error('Open a library before creating an event.')
    const next = createManualEventOverride(activeLibrary.id, targets, title)
    if (!next) throw new Error('Choose a name and keep at least one photo inside the visible map area.')
    const before = eventOverridesRef.current
    const after = nextEventOverrideState(before, [next])
    try {
      setError(null)
      await saveEventOverride(next)
      updateEventOverrideState([next])
      registerEventStateUndo('Create map event', before, after)
    } catch (cause) {
      const message = `Map event could not be saved: ${messageOf(cause)}`
      setError(message)
      throw new Error(message)
    }
  }

  async function replaceKnownDates(localRecords: LiteKnownDateRecord[], globalRecords: LiteKnownDateRecord[]): Promise<void> {
    if (!activeLibrary) return
    const libraryId = activeLibrary.id
    const previousLocal = activeLibrary.knownDates ?? []
    const previousGlobal = globalKnownDates
    try {
      const updated = await saveKnownDateState(libraryId, localRecords, globalRecords)
      setActiveLibrary(updated)
      setGlobalKnownDates(globalRecords)
      setLibraries((current) => current.map((library) => library.id === updated.id ? updated : library))
      registerUndo('Update known dates', async () => { await saveKnownDateState(libraryId, previousLocal, previousGlobal) })
    } catch (cause) {
      setError(`Known dates were not saved: ${messageOf(cause)}`)
      throw cause
    }
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
        eventNameForItem: (item) => exportEventByItemId.get(item.id),
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

  async function applyScanResult(library: LiteLibraryRecord, scannedMedia: LiteMediaRecord[], nextSessionFiles: Map<string, File>, existingLibrary: LiteLibraryRecord | null): Promise<void> {
    const reconciled = clusterPeople(scannedMedia, existingLibrary ? people : [])
    const persistedLibrary = existingLibrary?.knownDates !== undefined ? { ...library, knownDates: existingLibrary.knownDates } : library
    await replaceLibrary(persistedLibrary, reconciled.items)
    await savePeopleState(persistedLibrary.id, reconciled.people, reconciled.changed)
    setActiveLibrary(persistedLibrary)
    setMediaState(reconciled.items)
    setPeople(reconciled.people)
    if (!existingLibrary) {
      eventOverridesRef.current = []
      setEventOverrides([])
    }
    setSessionFiles(nextSessionFiles)
    resetBrowseState()
    await refreshLibraries()
  }

  async function indexHandle(handle: FileSystemDirectoryHandle, existing: LiteLibraryRecord | null): Promise<void> {
    clearUndoHistory()
    setBusy(true)
    setProgress({ phase: 'files', scannedFiles: 0, currentPath: '' })
    try {
      const previous = existing ? await loadMedia(existing.id) : []
      const result = await scanDirectory(handle, existing ? { id: existing.id, createdAt: existing.createdAt } : null, previous, setProgress)
      await applyScanResult(result.library, result.media, new Map(), existing)
    } finally { setBusy(false); setProgress(null) }
  }

  async function indexFiles(files: File[], existing: LiteLibraryRecord | null): Promise<void> {
    clearUndoHistory()
    setBusy(true)
    setProgress({ phase: 'files', scannedFiles: 0, currentPath: '' })
    try {
      const previous = existing ? await loadMedia(existing.id) : []
      const result = await scanFileSelection(files, existing ? { id: existing.id, createdAt: existing.createdAt } : null, previous, setProgress)
      if (existing && result.library.name !== existing.name) throw new Error(`Selected “${result.library.name}”, but this index belongs to “${existing.name}”. Choose the original folder.`)
      await applyScanResult(result.library, result.media, result.sessionFiles, existing)
    } finally { setBusy(false); setProgress(null) }
  }

  async function forgetLibrary(library: LiteLibraryRecord): Promise<void> {
    if (!window.confirm(`Forget the local PhotoFind index for “${library.name}”? No photo files will be deleted.`)) return
    try {
      await deleteLibrary(library.id)
      if (activeLibrary?.id === library.id) {
        setActiveLibrary(null)
        setMediaState([])
        setPeople([])
        eventOverridesRef.current = []
        eventsRef.current = []
        setEventOverrides([])
        setSessionFiles(new Map())
        resetBrowseState()
      }
      await refreshLibraries()
    } catch (cause) { setError(messageOf(cause)) }
  }

  function resetBrowseState(): void {
    setKnownDatesOpen(false); setVisibleCount(pageSize); setView('photos'); setSearchQuery(''); setSourceFolderFilter(null); setYear(null); setFromDate(''); setToDate(''); setLocationFilter('all'); setDateMetadataFilter('all'); setReviewFilter('all'); setMapBounds(null); setSelectedMapId(null); setSimilarityProgress(null); setQualityProgress(null); setPeopleProgress(null); setExportProgress(null); setExportResult(null)
  }

  function clearFilters(): void {
    setSearchQuery(''); setSourceFolderFilter(null); setYear(null); setFromDate(''); setToDate(''); setLocationFilter('all'); setDateMetadataFilter('all'); setVisibleCount(pageSize)
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
    setMapBounds(null)
    setSelectedMapId(null)
    setVisibleCount(pageSize)
    setView('photos')
  }

  const focusedMode = view === 'review' || view === 'compare'
  const browseControls = view === 'photos' || view === 'starred' || view === 'map' || view === 'groups' || view === 'quality'
  const globalSearchDisabled = !activeLibrary || focusedMode || view === 'people' || view === 'events'
  const contextualItems = reviewFilter === 'reject' ? images : activeImages

  return (
    <SourceNavigationProvider showFolder={showSourceFolder}>
      <div className="pf-app">
        <header className="pf-topbar">
          <div className="pf-brand"><span className="pf-logo" aria-hidden="true">P</span><div><strong>photofind</strong><span>Find the photos that matter.</span></div></div>
          <label className="global-search"><span aria-hidden="true">⌕</span><input type="search" value={searchQuery} disabled={globalSearchDisabled} onChange={(event) => { setSearchQuery(event.target.value); setVisibleCount(pageSize) }} placeholder="Search filenames, folders, cameras or named people…" aria-label="Search local photo index" /></label>
          <div className="topbar-actions"><span className="local-only-pill">▣ 100% local</span><UndoControl onError={setError} /><button className="primary" disabled={!supported || working} onClick={() => void addFolder()}>{working ? 'Working…' : '+ Add folder'}</button></div>
        </header>

        {!supported && <div className="notice warning">Local folder access is not available in this browser.</div>}
        {folderMode === 'selection' && <div className="notice">This browser uses reconnect mode. The local index and review decisions persist, but reselect the folder after refresh to restore previews, analysis and export access.</div>}
        {error && <div className="notice error">{error}</div>}
        {progress && <ProgressNotice progress={progress} />}

        <div className="pf-layout">
          <aside className="pf-sidebar">
            <nav className="mode-nav" aria-label="PhotoFind modes">
              <ModeButton icon="▦" label="Library" active={view === 'photos'} disabled={!activeLibrary} onClick={() => setView('photos')} />
              <ModeButton icon="★" label="Starred" count={starredImages.length} active={view === 'starred'} disabled={!activeLibrary} onClick={() => { setView('starred'); setVisibleCount(pageSize) }} />
              <ModeButton icon="◷" label="Events" count={meaningfulEvents.length} active={view === 'events'} disabled={!activeLibrary} onClick={() => setView('events')} />
              <ModeButton icon="⌖" label="Map" count={locatedCount} active={view === 'map'} disabled={!activeLibrary} onClick={() => { setMapBounds(null); setView('map') }} />
              <ModeButton icon="◎" label="AI filters" count={visiblePeopleCount} active={view === 'people'} disabled={!activeLibrary} onClick={() => setView('people')} />
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
                : <ComparePanel items={contextualItems} groups={contextualGroups} sessionFiles={sessionFiles} onReview={(item, state) => updateReview([item], state)} onPickBest={pickBest} />
            ) : <>
              <section className="collection-header compact-collection-header">
                <div><span className="mode-kicker">{viewTitle(view)}</span><h1>{activeLibrary.name}</h1><p>{viewDescription(view)} · indexed {new Date(activeLibrary.updatedAt).toLocaleString()}</p></div>
                <div className="collection-actions">
                  <div className="collection-totals"><span><strong>{activeLibrary.imageCount.toLocaleString()}</strong> photos</span><span className="keep"><strong>{reviewCounts.keep.toLocaleString()}</strong> keep</span><span className="maybe"><strong>{reviewCounts.maybe.toLocaleString()}</strong> maybe</span>{starredImages.length > 0 && <span><strong>{starredImages.length.toLocaleString()}</strong> starred</span>}{greatQualityCount > 0 && <span><strong>{greatQualityCount.toLocaleString()}</strong> great</span>}</div>
                  <div className="collection-action-buttons">
                    {view === 'events' && <button type="button" disabled={working} onClick={() => setKnownDatesOpen(true)}>Known dates{knownDates.length ? ` (${knownDates.length})` : ''}</button>}
                    {view === 'people' && <button
                      type="button"
                      className={peopleBusy ? 'danger-outline' : 'primary'}
                      disabled={!peopleBusy && (working || reconnectRequired || activeImages.length === 0)}
                      title={peopleBusy ? 'Stops after the current local face operation completes.' : undefined}
                      onClick={peopleBusy ? stopPeopleAnalysis : () => void runPeopleAnalysis()}
                    >{peopleBusy ? 'Stop people analysis' : peopleAnalyzedCount > 0 ? 'Refresh people analysis' : 'Analyze people'}</button>}
                    <button disabled={working} onClick={() => void rescanActive()}>{libraryMode(activeLibrary) === 'selection' ? (reconnectRequired ? 'Reconnect folder' : 'Reselect & rescan') : 'Rescan'}</button>
                  </div>
                </div>
              </section>

              {reconnectRequired && <div className="notice warning inline-notice">Reconnect this folder to restore previews, analysis and export access.</div>}
              {sourceFolderFilter !== null && <div className="source-filter-banner"><div><span>Source folder</span><strong>{sourceFolderLabel(sourceFolderFilter)}</strong><code>{sourceFolderFilter || '(library root)'}</code></div><button type="button" onClick={() => setSourceFolderFilter(null)}>Clear folder filter</button></div>}

              {browseControls && <details className="filter-disclosure" open>
                <summary><span>Find & filter</span><strong>{currentBrowseImages.length.toLocaleString()} matching</strong></summary>
                {view === 'starred' && <label className="global-starred-toggle">
                  <input type="checkbox" checked={showGlobalStarred} onChange={(event) => { setShowGlobalStarred(event.target.checked); setVisibleCount(pageSize) }} />
                  <span><strong>Show Global</strong><small>Include starred photos from every local photo index, not only the active index.</small></span>
                </label>}
                {view === 'starred' && showGlobalStarred && globalStarred.loading && <div className="global-starred-status">Loading starred photos across indexes…</div>}
                {view === 'starred' && showGlobalStarred && !globalStarred.loading && !globalStarred.error && <div className="global-starred-status">{globalStarred.items.length.toLocaleString()} starred photos across {globalStarred.libraryCount.toLocaleString()} indexes.</div>}
                {view === 'starred' && showGlobalStarred && globalStarred.error && <div className="global-starred-status error">Global starred photos could not be loaded: {globalStarred.error}</div>}
                <BrowseFilters years={years} year={year} fromDate={fromDate} toDate={toDate} location={locationFilter} dateMetadata={dateMetadataFilter} matchingCount={currentBrowseImages.length} totalCount={currentBrowseTotal} viewportActive={filterToViewport && mapBounds !== null}
                  onYear={(value) => { setYear(value); setVisibleCount(pageSize) }} onFromDate={(value) => { setFromDate(value); setToDate(value); setVisibleCount(pageSize) }} onToDate={(value) => { setToDate(value); setVisibleCount(pageSize) }} onLocation={(value) => { setLocationFilter(value); setVisibleCount(pageSize) }} onDateMetadata={(value) => { setDateMetadataFilter(value); setVisibleCount(pageSize) }} onClear={clearFilters} />
                <ReviewToolbar counts={reviewCounts} filter={reviewFilter} matchingCount={currentBrowseImages.length} onFilter={(value) => { setReviewFilter(value); setVisibleCount(pageSize) }} onBulk={bulkReview} />
              </details>}

              {view === 'events' && <EventsPanel items={activeImages} events={events} people={people} sessionFiles={sessionFiles} onReview={(item, state) => updateReview([item], state)} onRename={(event, title) => void renameEvent(event, title)} onAddKnown={addKnownEvent} onRemove={(event) => void removeEvent(event)} onRemovePhotos={(event, targets) => void removePhotosFromEvent(event, targets)} onMerge={mergeEvents} />}
              {view === 'map' && <MapResults items={mapItems} visibleItems={mapViewportItems} viewportReady={mapBounds !== null} selected={selectedMapItem} sessionFiles={sessionFiles} onBoundsChange={handleMapBounds} onCreateEvent={createMapEvent} onSelect={setSelectedMapId} onShowSelected={() => { setView('photos'); setVisibleCount(pageSize) }} onReview={(item, state) => updateReview([item], state)} />}
              {view === 'people' && <PeoplePanel items={activeImages} people={people} sessionFiles={sessionFiles} progress={peopleProgress} busy={peopleBusy} reconnectRequired={reconnectRequired} onRename={(personId, name) => void renamePerson(personId, name)} onIgnore={(personId, ignored) => void ignorePerson(personId, ignored)} onMerge={(sourceId, targetId) => void mergePerson(sourceId, targetId)} onSplit={(faceRef) => void splitPersonFace(faceRef)} onExclude={(faceRef, personId) => void excludePersonFace(faceRef, personId)} onReview={(item, state) => updateReview([item], state)} />}
              {view === 'photos' && <PhotoResults items={filteredImages} visibleCount={visibleCount} batchSize={pageSize} flowLoading={settings.flowLoading} selectedId={selectedMapId} sessionFiles={sessionFiles} onShowMore={() => setVisibleCount((count) => count + pageSize)} onReview={(item, state) => updateReview([item], state)} />}
              {view === 'starred' && <PhotoResults items={starredFilteredImages} visibleCount={visibleCount} batchSize={pageSize} flowLoading={settings.flowLoading} selectedId={null} sessionFiles={sessionFiles} onShowMore={() => setVisibleCount((count) => count + pageSize)} onReview={(item, state) => void updateStarredReview(item, state)} />}
              {view === 'groups' && <SimilarityGroups items={contextualItems} groups={contextualGroups} reviewFilter={reviewFilter} sessionFiles={sessionFiles} progress={similarityProgress} busy={similarityBusy} reconnectRequired={reconnectRequired} onAnalyze={() => void runSimilarityAnalysis()} onAbort={stopSimilarityAnalysis} onReview={(item, state) => updateReview([item], state)} onApprove={(items) => updateReview(items, 'keep', 'Approve duplicate group')} />}
              {view === 'quality' && <QualityPanel items={filteredImages} sessionFiles={sessionFiles} progress={qualityProgress} busy={qualityBusy} reconnectRequired={reconnectRequired} onAnalyze={() => void runQualityAnalysis()} onAbort={stopQualityAnalysis} onReview={(item, state) => updateReview([item], state)} />}
              {view === 'selection' && <CurationPanel items={activeImages} events={meaningfulEvents} sessionFiles={sessionFiles} exportSupported={exportSupported} reconnectRequired={reconnectRequired} busy={exportBusy} progress={exportProgress} result={exportResult} batchSize={pageSize} flowLoading={settings.flowLoading} onReview={(item, state) => updateReview([item], state)} onExport={(items, layout, reports, metadata, eventNames, modifiedDates) => void runExport(items, layout, reports, metadata, eventNames, modifiedDates)} />}

              <Diagnostics unknown={unknown} diagnostics={diagnostics} />
            </>}
          </main>
        </div>

        {knownDatesOpen && activeLibrary && <KnownDatesDialog libraryId={activeLibrary.id} localRecords={activeLibrary.knownDates ?? []} globalRecords={globalKnownDates} years={years} onReplace={replaceKnownDates} onClose={() => setKnownDatesOpen(false)} />}
        {contextCreateItemIds && (
          <div className="pf-dialog-backdrop" role="presentation" onMouseDown={() => { if (!contextCreateBusy) setContextCreateItemIds(null) }}>
            <form className="pf-dialog event-rename-dialog" role="dialog" aria-modal="true" aria-label="Create event from selected photos" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void submitContextCreateEvent() }}>
              <div><span className="mode-kicker">Known event</span><h3>Create Event</h3><p>Create a persistent Known event from {contextCreateItemIds.length.toLocaleString()} selected photo{contextCreateItemIds.length === 1 ? '' : 's'}.</p></div>
              <label><span>Event name</span><input autoFocus value={contextCreateTitle} onChange={(event) => setContextCreateTitle(event.target.value)} placeholder="e.g. Easter holiday" /></label>
              {contextCreateError && <div className="notice error inline-notice">{contextCreateError}</div>}
              <div className="pf-dialog-actions">
                <button type="button" className="quiet-button" disabled={contextCreateBusy} onClick={() => setContextCreateItemIds(null)}>Cancel</button>
                <button type="submit" className="primary" disabled={contextCreateBusy || !contextCreateTitle.trim()}>{contextCreateBusy ? 'Creating…' : `Create event · ${contextCreateItemIds.length.toLocaleString()} photo${contextCreateItemIds.length === 1 ? '' : 's'}`}</button>
              </div>
            </form>
          </div>
        )}
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

function formatContextEventDate(event: LiteEventRecord): string {
  const start = new Date(event.startTime)
  const end = new Date(event.endTime)
  const format = (value: Date): string => value.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
  return start.toDateString() === end.toDateString() ? format(start) : `${format(start)} – ${format(end)}`
}

function nextEventOverrideState(current: LiteEventOverride[], upserts: LiteEventOverride[], removeIds: string[] = []): LiteEventOverride[] {
  const replacedIds = new Set([...removeIds, ...upserts.map((override) => override.id)])
  return [...upserts, ...current.filter((override) => !replacedIds.has(override.id))]
}

function registerEventStateUndo(label: string, before: LiteEventOverride[], after: LiteEventOverride[]): void {
  const beforeIds = new Set(before.map((override) => override.id))
  const addedIds = after.map((override) => override.id).filter((id) => !beforeIds.has(id))
  registerUndo(label, () => saveEventOverrideBatch(before, addedIds))
}

function reviewUndoLabel(assignments: ReadonlyMap<string, LiteReviewState>, count: number): string {
  const states = new Set(assignments.values())
  if (states.size !== 1) return `Change review decisions for ${count.toLocaleString()} photos`
  const state = [...states][0]
  const subject = count === 1 ? 'photo' : `${count.toLocaleString()} photos`
  if (state === 'keep') return `Keep ${subject}`
  if (state === 'maybe') return `Mark ${subject} maybe`
  if (state === 'reject') return `Reject ${subject}`
  return `Clear review for ${subject}`
}

function viewTitle(view: Exclude<BrowseView, 'review' | 'compare'>): string {
  if (view === 'starred') return 'Starred'
  if (view === 'events') return 'Events'
  if (view === 'map') return 'Places'
  if (view === 'people') return 'AI filters'
  if (view === 'groups') return 'Duplicates'
  if (view === 'quality') return 'Technical quality'
  if (view === 'selection') return 'Your selection'
  return 'Library'
}

function viewDescription(view: Exclude<BrowseView, 'review' | 'compare'>): string {
  if (view === 'starred') return 'The photos that made you stop and say “this one is special”'
  if (view === 'events') return 'Meaningful moments from time, place and your known dates; everyday day-buckets stay out of the way by default'
  if (view === 'map') return 'Explore the collection by location'
  if (view === 'people') return 'Private local AI filters for people, product photos and future smart categories'
  if (view === 'groups') return 'Find duplicates, bursts and similar scenes with their source folders'
  if (view === 'quality') return 'Find technically strong frames without confusing quality with importance'
  if (view === 'selection') return 'Filter keepers by meaningful event and export self-contained copies'
  return 'Browse and find the photos that matter'
}

function libraryMode(library: LiteLibraryRecord): LiteLibraryAccessMode { return library.accessMode ?? (library.rootHandle ? 'handle' : 'selection') }
function messageOf(cause: unknown): string { return cause instanceof Error ? cause.message : 'Something went wrong.' }
function isAbort(cause: unknown): boolean { return cause instanceof DOMException && cause.name === 'AbortError' }
