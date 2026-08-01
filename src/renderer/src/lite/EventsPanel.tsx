import { useMemo, useState } from 'react'
import { formatCapture } from './formatters'
import { LocalThumbnail } from './LocalThumbnail'
import { PhotoLightbox } from './PhotoLightbox'
import { ReviewControls } from './ReviewControls'
import { SourceFolderButton } from './SourcePath'
import { sourceFolderLabel, summarizeSourceFolders } from './sourcePaths'
import type { LiteEventRecord, LiteMediaRecord, LitePersonRecord, LiteReviewState } from './types'

interface EventsPanelProps {
  items: LiteMediaRecord[]
  events: LiteEventRecord[]
  people: LitePersonRecord[]
  sessionFiles: Map<string, File>
  onReview(item: LiteMediaRecord, state: LiteReviewState): void
}

export function EventsPanel({ items, events, people, sessionFiles, onReview }: EventsPanelProps): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [personFilter, setPersonFilter] = useState('')
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people])
  const visibleEvents = useMemo(() => personFilter ? events.filter((event) => event.personIds.includes(personFilter)) : events, [events, personFilter])
  const selected = events.find((event) => event.id === selectedId) ?? visibleEvents[0] ?? null
  const selectedItems = selected ? selected.itemIds.map((id) => byId.get(id)).filter(isMediaRecord) : []
  const namedPeople = people.filter((person) => !person.ignored && person.name)

  return (
    <section className="events-section">
      <div className="events-hero"><div><div className="eyebrow">Lite 7 · derived local context</div><h2>Events</h2><p>PhotoFind groups nearby moments using time, place, source folder, visual similarity and known people. These are reversible views of the index, not changes to your folders.</p></div><label className="event-person-filter"><span>Person</span><select value={personFilter} onChange={(event) => setPersonFilter(event.target.value)}><option value="">All people</option>{namedPeople.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label></div>

      <div className="event-stats"><span><strong>{visibleEvents.length.toLocaleString()}</strong> events</span><span><strong>{visibleEvents.reduce((sum, event) => sum + event.itemIds.length, 0).toLocaleString()}</strong> photos</span><span><strong>{visibleEvents.filter((event) => event.personIds.length > 0).length.toLocaleString()}</strong> with known people</span><span><strong>{visibleEvents.filter((event) => typeof event.latitude === 'number').length.toLocaleString()}</strong> located</span></div>

      {events.length === 0 ? <div className="events-empty"><h3>No events to show</h3><p>Index photos with usable timestamps. Similarity and People analysis add better supporting context but are not mandatory.</p></div> : visibleEvents.length === 0 ? <div className="events-empty"><h3>No events match this person</h3><p>Clear the person filter or choose another named cluster.</p></div> : (
        <div className="events-workspace">
          <div className="event-list">
            {visibleEvents.slice(0, 250).map((event) => {
              const eventItems = event.itemIds.map((id) => byId.get(id)).filter(isMediaRecord)
              return <button type="button" className={selected?.id === event.id ? 'event-card selected' : 'event-card'} key={event.id} onClick={() => { setSelectedId(event.id); setOpenIndex(null) }}>
                <div className="event-mosaic">{eventItems.slice(0, 4).map((item) => <div key={item.id}><LocalThumbnail item={item} sessionFile={sessionFiles.get(item.id)} /></div>)}</div>
                <div className="event-card-body"><strong>{event.title}</strong><span>{formatEventRange(event)} · {event.itemIds.length.toLocaleString()} photos</span><small>{event.personIds.map((id) => peopleById.get(id)?.name).filter(Boolean).slice(0, 3).join(', ') || event.folderPaths.slice(0, 2).map(sourceFolderLabel).join(', ')}</small></div>
              </button>
            })}
          </div>

          <article className="event-detail">
            {!selected ? <p className="muted">Choose an event.</p> : <>
              <header className="event-detail-head"><div><span className="inspector-label">Detected event</span><h3>{selected.title}</h3><p>{formatEventRange(selected)} · {selected.itemIds.length.toLocaleString()} photos</p></div>{selected.personIds.length > 0 && <div className="event-people">{selected.personIds.slice(0, 6).map((id) => <span key={id}>{peopleById.get(id)?.name || 'Unnamed person'}</span>)}</div>}</header>

              <div className="event-evidence"><strong>Why these photos are together</strong><div>{selected.evidence.length > 0 ? selected.evidence.map((value) => <span key={value}>{value}</span>) : <span>single moment</span>}</div></div>
              <div className="event-folders"><strong>Source folders</strong><div>{summarizeSourceFolders(selectedItems).map((summary) => <SourceFolderButton key={summary.folder} folder={summary.folder} count={summary.count} />)}</div></div>

              <div className="event-photo-grid">
                {selectedItems.slice(0, 300).map((item, index) => <article key={item.id}><button type="button" className="event-photo-open" onClick={() => setOpenIndex(index)}><LocalThumbnail item={item} sessionFile={sessionFiles.get(item.id)} /></button><div><strong>{item.name}</strong><span>{formatCapture(item)}</span><ReviewControls item={item} compact onReview={onReview} /></div></article>)}
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

function formatEventRange(event: LiteEventRecord): string {
  const start = new Date(event.startTime)
  const end = new Date(event.endTime)
  const sameDay = start.toDateString() === end.toDateString()
  return sameDay ? start.toLocaleDateString([], { dateStyle: 'medium' }) : `${start.toLocaleDateString([], { dateStyle: 'medium' })} – ${end.toLocaleDateString([], { dateStyle: 'medium' })}`
}

function isMediaRecord(item: LiteMediaRecord | undefined): item is LiteMediaRecord {
  return Boolean(item)
}
