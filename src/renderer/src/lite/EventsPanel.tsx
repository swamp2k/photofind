import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { usePhotoFindContextMenu } from './ContextMenu'
import { applyKnownDateOverrides, createEventKnownDateOverride, isKnownDateEvent, isKnownDateOverride, matchingEventOverride } from './eventOverrides'
import { isMeaningfulEvent } from './events'
import { formatCapture } from './formatters'
import { deleteEventOverride, loadEventOverrides, saveEventOverride } from './libraryDb'
import { LocalThumbnail } from './LocalThumbnail'
import { PhotoLightbox } from './PhotoLightbox'
import { PhotoSelectionBar, useExplorerPhotoSelection } from './PhotoSelection'
import { ReviewControls } from './ReviewControls'
import { SourceFolderButton } from './SourcePathView'
import { sourceFolderLabel, summarizeSourceFolders } from './sourcePaths'
import type { LiteEventOverride, LiteEventRecord, LiteMediaRecord, LitePersonRecord, LiteReviewState } from './types'

interface EventsPanelProps {
  items: LiteMediaRecord[]
  events: LiteEventRecord[]
  people: LitePersonRecord[]
  sessionFiles: Map<string, File>
  onReview(item: LiteMediaRecord, state: LiteReviewState): void
  onRename(event: LiteEventRecord, title: string): void
  onRemove(event: LiteEventRecord): void
  onRemovePhotos(event: LiteEventRecord, items: LiteMediaRecord[]): void
}

type EventSort = 'name' | 'captured' | 'modified' | 'count'
type SortDirection = 'asc' | 'desc'
type EventScope = 'meaningful' | 'known' | 'all'

export function EventsPanel({ items, events, people, sessionFiles, onReview, onRename, onRemove, onRemovePhotos }: EventsPanelProps): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [personFilter, setPersonFilter] = useState('')
  const [scope, setScope] = useState<EventScope>('meaningful')
  const [sortBy, setSortBy] = useState<EventSort>('captured')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [renameTarget, setRenameTarget] = useState<LiteEventRecord | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [knownOverrides, setKnownOverrides] = useState<LiteEventOverride[]>([])
  const [overrideError, setOverrideError] = useState<string | null>(null)
  const { openContextMenu } = usePhotoFindContextMenu()
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people])
  const libraryId = events[0]?.libraryId ?? items[0]?.libraryId ?? null
  const effectiveEvents = useMemo(() => applyKnownDateOverrides(events, knownOverrides), [events, knownOverrides])
  const meaningfulCount = useMemo(() => effectiveEvents.filter((event) => isMeaningfulEvent(event) && !isKnownDateEvent(event)).length, [effectiveEvents])
  const knownCount = useMemo(() => effectiveEvents.filter(isKnownDateEvent).length, [effectiveEvents])
  const visibleEvents = useMemo(() => {
    let filtered = scope === 'meaningful'
      ? effectiveEvents.filter((event) => isMeaningfulEvent(event) && !isKnownDateEvent(event))
      : scope === 'known'
        ? effectiveEvents.filter(isKnownDateEvent)
        : effectiveEvents
    if (personFilter) filtered = filtered.filter((event) => event.personIds.includes(personFilter))
    return [...filtered].sort((left, right) => compareEvents(left, right, byId, sortBy, sortDirection))
  }, [byId, effectiveEvents, personFilter, scope, sortBy, sortDirection])
  const importedHolidayEvents = useMemo(() => visibleEvents.filter(isImportedHolidayEvent), [visibleEvents])
  const primaryEvents = useMemo(() => visibleEvents.filter((event) => !isImportedHolidayEvent(event)), [visibleEvents])
  const selected = visibleEvents.find((event) => event.id === selectedId) ?? primaryEvents[0] ?? importedHolidayEvents[0] ?? null
  const selectedItems = selected ? selected.itemIds.map((id) => byId.get(id)).filter(isMediaRecord) : []
  const selection = useExplorerPhotoSelection(selectedItems)
  const namedPeople = people.filter((person) => !person.ignored && person.name)

  useEffect(() => {
    let disposed = false
    setOverrideError(null)
    if (!libraryId) {
      setKnownOverrides([])
      return () => { disposed = true }
    }
    void loadEventOverrides(libraryId)
      .then((overrides) => {
        if (!disposed) setKnownOverrides(overrides.filter(isKnownDateOverride))
      })
      .catch((cause) => {
        if (!disposed) setOverrideError(`Known-event classifications could not be loaded: ${messageOf(cause)}`)
      })
    return () => { disposed = true }
  }, [libraryId])

  useEffect(() => {
    if (!selected) {
      setSelectedId(null)
      return
    }
    setSelectedId(selected.id)
    setOpenIndex(null)
    selection.clear()
  }, [selected?.id])

  function beginRename(event: LiteEventRecord): void {
    setRenameTarget(event)
    setRenameDraft(event.customTitle ?? event.title)
  }

  async function addToKnownEvents(event: LiteEventRecord): Promise<void> {
    if (!libraryId || isKnownDateEvent(event)) return
    setOverrideError(null)
    try {
      const stored = await loadEventOverrides(libraryId)
      const prior = matchingEventOverride(event, stored)
      const next = createEventKnownDateOverride(event, prior)
      await saveEventOverride(next)
      if (prior && prior.id !== next.id) await deleteEventOverride(prior.id)
      setKnownOverrides((current) => [next, ...current.filter((override) => override.id !== next.id && override.id !== prior?.id)])
    } catch (cause) {
      setOverrideError(`Event could not be added to Known dates & holidays: ${messageOf(cause)}`)
    }
  }

  function showEventContextMenu(mouseEvent: ReactMouseEvent, event: LiteEventRecord): void {
    openContextMenu(mouseEvent, {
      title: event.title,
      actions: [
        {
          id: 'open-event',
          label: selected?.id === event.id ? 'Event is open' : 'Open event',
          disabled: selected?.id === event.id,
          onSelect: () => { setSelectedId(event.id); setOpenIndex(null) }
        },
        {
          id: 'rename-event',
          label: 'Rename event…',
          separatorBefore: true,
          onSelect: () => beginRename(event)
        },
        ...(event.customTitle ? [{
          id: 'reset-event-name',
          label: 'Use generated name',
          onSelect: () => onRename(event, '')
        }] : []),
        {
          id: 'add-known-event',
          label: isKnownDateEvent(event) ? 'Already in known events' : 'Add to known events',
          disabled: isKnownDateEvent(event),
          separatorBefore: true,
          onSelect: () => addToKnownEvents(event)
        },
        {
          id: 'remove-event',
          label: 'Remove event',
          danger: true,
          separatorBefore: true,
          onSelect: () => {
            if (window.confirm(`Remove “${event.title}” from Events? Its ${event.itemIds.length.toLocaleString()} photos stay in your library.`)) onRemove(event)
          }
        }
      ]
    })
  }

  function saveRename(): void {
    if (!renameTarget) return
    onRename(renameTarget, renameDraft)
    setRenameTarget(null)
  }

  function removeSelectedPhotos(targets: LiteMediaRecord[]): void {
    if (!selected || targets.length === 0) return
    const label = targets.length === 1 ? 'this photo' : `these ${targets.length.toLocaleString()} photos`
    if (!window.confirm(`Remove ${label} from “${selected.title}”? The photos stay in your library and keep their review state.`)) return
    onRemovePhotos(selected, targets)
    selection.clear()
  }

  function renderEventCard(event: LiteEventRecord): JSX.Element {
    const eventItems = event.itemIds.map((id) => byId.get(id)).filter(isMediaRecord)
    return <button
      type="button"
      className={selected?.id === event.id ? 'event-card selected' : 'event-card'}
      key={event.id}
      data-photofind-event-card="true"
      onClick={() => { setSelectedId(event.id); setOpenIndex(null) }}
      onContextMenu={(mouseEvent) => showEventContextMenu(mouseEvent, event)}
      title="Right-click for event actions"
    >
      <div className="event-mosaic">{eventItems.slice(0, 4).map((item) => <div key={item.id}><LocalThumbnail item={item} sessionFile={sessionFiles.get(item.id)} /></div>)}</div>
      <div className="event-card-body"><strong>{event.title}</strong><span>{formatEventRange(event)} · {event.itemIds.length.toLocaleString()} photos</span><small>{event.personIds.map((id) => peopleById.get(id)?.name).filter(Boolean).slice(0, 3).join(', ') || event.folderPaths.slice(0, 2).map(sourceFolderLabel).join(', ')}</small>{isKnownDateEvent(event) ? <em>Known event</em> : event.customTitle ? <em>Named event</em> : null}</div>
    </button>
  }

  return (
    <section className="events-section compact-mode-section">
      <div className="compact-view-toolbar event-toolbar-controls">
        <label className="event-person-filter"><span>Show</span><select value={scope} onChange={(event) => { setScope(event.target.value as EventScope); setSelectedId(null) }}><option value="meaningful">Meaningful events ({meaningfulCount.toLocaleString()})</option><option value="known">Known dates & holidays ({knownCount.toLocaleString()})</option><option value="all">All moments ({effectiveEvents.length.toLocaleString()})</option></select></label>
        <label className="event-person-filter"><span>Person</span><select value={personFilter} onChange={(event) => setPersonFilter(event.target.value)}><option value="">All people</option>{namedPeople.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>
        <label className="event-person-filter"><span>Sort by</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value as EventSort)}><option value="captured">Date taken (EXIF / Takeout)</option><option value="modified">Date modified</option><option value="name">Event name</option><option value="count">Photo count</option></select></label>
        <button type="button" className="quiet-button event-sort-direction" onClick={() => setSortDirection((value) => value === 'asc' ? 'desc' : 'asc')} title="Reverse event sort">{sortDirection === 'asc' ? '↑ Ascending' : '↓ Descending'}</button>
        <span className="compact-toolbar-note">Meaningful and Known are separate collections. Right-click a detected event to add it to Known dates & holidays.</span>
      </div>

      {overrideError && <div className="notice error inline-notice">{overrideError}</div>}

      {effectiveEvents.length === 0 ? <div className="compact-empty-state"><strong>No events to show.</strong><span>Index photos with usable timestamps. Known dates, GPS, People and similarity analysis can all strengthen grouping.</span></div> : visibleEvents.length === 0 ? <div className="compact-empty-state"><strong>No events match these filters.</strong><span>Choose another event scope or clear the person filter.</span></div> : (
        <div className="events-workspace">
          <div className="event-list">
            {primaryEvents.slice(0, 500).map(renderEventCard)}
            {importedHolidayEvents.length > 0 && (
              <details className="event-holiday-group">
                <summary><strong>Imported public holidays</strong><span>{importedHolidayEvents.length.toLocaleString()} event{importedHolidayEvents.length === 1 ? '' : 's'} · click to expand</span></summary>
                <div className="event-holiday-list">{importedHolidayEvents.slice(0, 500).map(renderEventCard)}</div>
              </details>
            )}
          </div>

          <article className="event-detail">
            {!selected ? <p className="muted">Choose an event.</p> : <>
              <header className="event-detail-head" onContextMenu={(mouseEvent) => showEventContextMenu(mouseEvent, selected)} title="Right-click for event actions"><div><span className="inspector-label">{isKnownDateEvent(selected) ? 'Known event' : selected.significance === 'everyday' ? 'Everyday moment' : 'Detected event'}</span><h3>{selected.title}</h3><p>{formatEventRange(selected)} · {selected.itemIds.length.toLocaleString()} photos · right-click for event actions</p></div>{selected.personIds.length > 0 && <div className="event-people">{selected.personIds.slice(0, 6).map((id) => <span key={id}>{peopleById.get(id)?.name || 'Unnamed person'}</span>)}</div>}</header>

              <div className="event-evidence"><strong>Why these photos are together</strong><div>{selected.evidence.length > 0 ? selected.evidence.map((value) => <span key={value}>{value}</span>) : <span>single moment</span>}</div></div>
              <div className="event-folders"><strong>Source folders</strong><div>{summarizeSourceFolders(selectedItems).map((summary) => <SourceFolderButton key={summary.folder} folder={summary.folder} count={summary.count} />)}</div></div>

              <PhotoSelectionBar items={selection.selectedItems} onReview={(targets, state) => targets.forEach((item) => onReview(item, state))} onClear={selection.clear} onRemoveFromEvent={removeSelectedPhotos} />
              <div className="event-photo-grid">
                {selectedItems.slice(0, 300).map((item, index) => {
                  const isSelected = selection.isSelected(item.id)
                  return <article className={isSelected ? 'explorer-selected' : ''} key={item.id}>
                    <button type="button" className="event-photo-open" aria-pressed={isSelected} onClick={(event) => selection.handlePhotoClick(event, item.id, () => setOpenIndex(index))}>
                      <div className="event-photo-thumb"><LocalThumbnail item={item} sessionFile={sessionFiles.get(item.id)} />{isSelected && <span className="selection-check">✓</span>}</div>
                    </button>
                    <div><strong>{item.name}</strong><span>{formatCapture(item)}</span><ReviewControls item={item} compact onReview={onReview} /></div>
                  </article>
                })}
              </div>
              {selectedItems.length > 300 && <p className="muted">Showing the first 300 photos in this event.</p>}
            </>}
          </article>
        </div>
      )}

      {renameTarget && (
        <div className="pf-dialog-backdrop" role="presentation" onMouseDown={() => setRenameTarget(null)}>
          <form className="pf-dialog event-rename-dialog" role="dialog" aria-modal="true" aria-label="Rename event" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); saveRename() }}>
            <div><span className="mode-kicker">Event</span><h3>Rename event</h3><p>{formatEventRange(renameTarget)} · {renameTarget.itemIds.length.toLocaleString()} photos</p></div>
            <label><span>Event name</span><input autoFocus value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} /></label>
            <div className="pf-dialog-actions">
              <button type="button" className="quiet-button" onClick={() => setRenameTarget(null)}>Cancel</button>
              <button type="submit" className="primary" disabled={!renameDraft.trim()}>Save name</button>
            </div>
          </form>
        </div>
      )}

      {openIndex !== null && selectedItems[openIndex] && <PhotoLightbox items={selectedItems} index={openIndex} sessionFiles={sessionFiles} onIndex={setOpenIndex} onClose={() => setOpenIndex(null)} onReview={onReview} />}
    </section>
  )
}

function compareEvents(left: LiteEventRecord, right: LiteEventRecord, byId: Map<string, LiteMediaRecord>, sortBy: EventSort, direction: SortDirection): number {
  const multiplier = direction === 'asc' ? 1 : -1
  if (sortBy === 'name') return multiplier * left.title.localeCompare(right.title, undefined, { numeric: true, sensitivity: 'base' })
  if (sortBy === 'count') return multiplier * (left.itemIds.length - right.itemIds.length || left.startTime - right.startTime)
  const leftTime = sortTime(left, byId, sortBy)
  const rightTime = sortTime(right, byId, sortBy)
  if (leftTime === undefined && rightTime === undefined) return left.title.localeCompare(right.title)
  if (leftTime === undefined) return 1
  if (rightTime === undefined) return -1
  return multiplier * (leftTime - rightTime || left.title.localeCompare(right.title))
}

function sortTime(event: LiteEventRecord, byId: Map<string, LiteMediaRecord>, sortBy: Exclude<EventSort, 'name' | 'count'>): number | undefined {
  const eventItems = event.itemIds.map((id) => byId.get(id)).filter(isMediaRecord)
  if (sortBy === 'modified') {
    const values = eventItems.map((item) => item.lastModified).filter((value) => Number.isFinite(value) && value > 0)
    return values.length > 0 ? Math.min(...values) : undefined
  }
  const values = eventItems
    .filter((item) => item.captureTimeSource === 'exif' || item.captureTimeSource === 'takeout')
    .map((item) => item.effectiveCaptureTime)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)
  return values.length > 0 ? Math.min(...values) : undefined
}

function isImportedHolidayEvent(event: LiteEventRecord): boolean {
  return Boolean(event.knownDateId?.startsWith('holiday:'))
}

function formatEventRange(event: LiteEventRecord): string {
  const start = new Date(event.startTime)
  const end = new Date(event.endTime)
  const sameDay = start.toDateString() === end.toDateString()
  return sameDay ? start.toLocaleDateString([], { dateStyle: 'medium' }) : `${start.toLocaleDateString([], { dateStyle: 'medium' })} – ${end.toLocaleDateString([], { dateStyle: 'medium' })}`
}

function isMediaRecord(item: LiteMediaRecord | undefined): item is LiteMediaRecord {
  return Boolean(item)
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Something went wrong.'
}
