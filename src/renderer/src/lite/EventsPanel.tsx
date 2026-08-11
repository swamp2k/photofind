import { useEffect, useMemo, useState } from 'react'
import { formatCapture } from './formatters'
import { LocalThumbnail } from './LocalThumbnail'
import { PhotoLightbox } from './PhotoLightbox'
import { PhotoSelectionBar, useExplorerPhotoSelection } from './PhotoSelection'
import { ReviewControls } from './ReviewControls'
import { SourceFolderButton } from './SourcePathView'
import { sourceFolderLabel, summarizeSourceFolders } from './sourcePaths'
import type { LiteEventRecord, LiteMediaRecord, LitePersonRecord, LiteReviewState } from './types'

interface EventsPanelProps {
  items: LiteMediaRecord[]
  events: LiteEventRecord[]
  people: LitePersonRecord[]
  sessionFiles: Map<string, File>
  onReview(item: LiteMediaRecord, state: LiteReviewState): void
  onRename(event: LiteEventRecord, title: string): void
}

type EventSort = 'name' | 'captured' | 'modified'
type SortDirection = 'asc' | 'desc'

export function EventsPanel({ items, events, people, sessionFiles, onReview, onRename }: EventsPanelProps): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [personFilter, setPersonFilter] = useState('')
  const [sortBy, setSortBy] = useState<EventSort>('captured')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people])
  const visibleEvents = useMemo(() => {
    const filtered = personFilter ? events.filter((event) => event.personIds.includes(personFilter)) : events
    return [...filtered].sort((left, right) => compareEvents(left, right, byId, sortBy, sortDirection))
  }, [byId, events, personFilter, sortBy, sortDirection])
  const selected = visibleEvents.find((event) => event.id === selectedId) ?? visibleEvents[0] ?? null
  const selectedItems = selected ? selected.itemIds.map((id) => byId.get(id)).filter(isMediaRecord) : []
  const selection = useExplorerPhotoSelection(selectedItems)
  const namedPeople = people.filter((person) => !person.ignored && person.name)

  useEffect(() => {
    if (!selected) return
    setSelectedId(selected.id)
    setNameDraft(selected.customTitle ?? selected.title)
    setOpenIndex(null)
    selection.clear()
  }, [selected?.id, selected?.title])

  return (
    <section className="events-section">
      <div className="events-hero">
        <div><div className="eyebrow">Lite 7 · derived local context</div><h2>Events</h2><p>PhotoFind groups nearby moments using time, place, source folder, visual similarity and known people. Rename useful events locally; source folders remain unchanged.</p></div>
        <div className="event-toolbar-controls">
          <label className="event-person-filter"><span>Person</span><select value={personFilter} onChange={(event) => setPersonFilter(event.target.value)}><option value="">All people</option>{namedPeople.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>
          <label className="event-person-filter"><span>Sort</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value as EventSort)}><option value="name">Name</option><option value="captured">Date (EXIF / captured)</option><option value="modified">Date (modified)</option></select></label>
          <button type="button" className="quiet-button event-sort-direction" onClick={() => setSortDirection((value) => value === 'asc' ? 'desc' : 'asc')} title="Reverse event sort">{sortDirection === 'asc' ? '↑ Ascending' : '↓ Descending'}</button>
        </div>
      </div>

      <div className="event-stats"><span><strong>{visibleEvents.length.toLocaleString()}</strong> events</span><span><strong>{visibleEvents.reduce((sum, event) => sum + event.itemIds.length, 0).toLocaleString()}</strong> photos</span><span><strong>{visibleEvents.filter((event) => event.personIds.length > 0).length.toLocaleString()}</strong> with known people</span><span><strong>{visibleEvents.filter((event) => typeof event.latitude === 'number').length.toLocaleString()}</strong> located</span></div>

      {events.length === 0 ? <div className="events-empty"><h3>No events to show</h3><p>Index photos with usable timestamps. Similarity and People analysis add better supporting context but are not mandatory.</p></div> : visibleEvents.length === 0 ? <div className="events-empty"><h3>No events match this person</h3><p>Clear the person filter or choose another named cluster.</p></div> : (
        <div className="events-workspace">
          <div className="event-list">
            {visibleEvents.slice(0, 250).map((event) => {
              const eventItems = event.itemIds.map((id) => byId.get(id)).filter(isMediaRecord)
              return <button type="button" className={selected?.id === event.id ? 'event-card selected' : 'event-card'} key={event.id} onClick={() => { setSelectedId(event.id); setOpenIndex(null) }}>
                <div className="event-mosaic">{eventItems.slice(0, 4).map((item) => <div key={item.id}><LocalThumbnail item={item} sessionFile={sessionFiles.get(item.id)} /></div>)}</div>
                <div className="event-card-body"><strong>{event.title}</strong><span>{formatEventRange(event)} · {event.itemIds.length.toLocaleString()} photos</span><small>{event.personIds.map((id) => peopleById.get(id)?.name).filter(Boolean).slice(0, 3).join(', ') || event.folderPaths.slice(0, 2).map(sourceFolderLabel).join(', ')}</small>{event.customTitle && <em>Named event</em>}</div>
              </button>
            })}
          </div>

          <article className="event-detail">
            {!selected ? <p className="muted">Choose an event.</p> : <>
              <header className="event-detail-head"><div><span className="inspector-label">Detected event</span><h3>{selected.title}</h3><p>{formatEventRange(selected)} · {selected.itemIds.length.toLocaleString()} photos</p></div>{selected.personIds.length > 0 && <div className="event-people">{selected.personIds.slice(0, 6).map((id) => <span key={id}>{peopleById.get(id)?.name || 'Unnamed person'}</span>)}</div>}</header>

              <div className="event-name-editor">
                <label><span>Event name</span><input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} placeholder="Name this event…" /></label>
                <button type="button" onClick={() => onRename(selected, nameDraft)}>Save name</button>
                {selected.customTitle && <button type="button" className="quiet-button" onClick={() => onRename(selected, '')}>Use generated name</button>}
              </div>

              <div className="event-evidence"><strong>Why these photos are together</strong><div>{selected.evidence.length > 0 ? selected.evidence.map((value) => <span key={value}>{value}</span>) : <span>single moment</span>}</div></div>
              <div className="event-folders"><strong>Source folders</strong><div>{summarizeSourceFolders(selectedItems).map((summary) => <SourceFolderButton key={summary.folder} folder={summary.folder} count={summary.count} />)}</div></div>

              <PhotoSelectionBar items={selection.selectedItems} onReview={(targets, state) => targets.forEach((item) => onReview(item, state))} onClear={selection.clear} />
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

      {openIndex !== null && selectedItems[openIndex] && <PhotoLightbox items={selectedItems} index={openIndex} sessionFiles={sessionFiles} onIndex={setOpenIndex} onClose={() => setOpenIndex(null)} onReview={onReview} />}
    </section>
  )
}

function compareEvents(left: LiteEventRecord, right: LiteEventRecord, byId: Map<string, LiteMediaRecord>, sortBy: EventSort, direction: SortDirection): number {
  const multiplier = direction === 'asc' ? 1 : -1
  if (sortBy === 'name') return multiplier * left.title.localeCompare(right.title, undefined, { numeric: true, sensitivity: 'base' })
  const leftTime = sortTime(left, byId, sortBy)
  const rightTime = sortTime(right, byId, sortBy)
  if (leftTime === undefined && rightTime === undefined) return left.title.localeCompare(right.title)
  if (leftTime === undefined) return 1
  if (rightTime === undefined) return -1
  return multiplier * (leftTime - rightTime || left.title.localeCompare(right.title))
}

function sortTime(event: LiteEventRecord, byId: Map<string, LiteMediaRecord>, sortBy: Exclude<EventSort, 'name'>): number | undefined {
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

function formatEventRange(event: LiteEventRecord): string {
  const start = new Date(event.startTime)
  const end = new Date(event.endTime)
  const sameDay = start.toDateString() === end.toDateString()
  return sameDay ? start.toLocaleDateString([], { dateStyle: 'medium' }) : `${start.toLocaleDateString([], { dateStyle: 'medium' })} – ${end.toLocaleDateString([], { dateStyle: 'medium' })}`
}

function isMediaRecord(item: LiteMediaRecord | undefined): item is LiteMediaRecord {
  return Boolean(item)
}
