import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatCapture, formatLocation } from './formatters'
import { GeoMap } from './GeoMap'
import { hasLocation } from './filters'
import { loadKnownEventPhotoIds } from './knownEventMembership'
import { LocalThumbnail } from './LocalThumbnail'
import { groupMappedLocations } from './mapLocations'
import { PhotoLightbox } from './PhotoLightbox'
import { PhotoResults } from './PhotoResults'
import { PhotoSelectionBar, useExplorerPhotoSelection } from './PhotoSelection'
import { ReviewControls } from './ReviewControls'
import { useReviewSettings } from './ReviewSettings'
import { SourcePath } from './SourcePathView'
import type { LiteGeoBounds, LiteMediaRecord, LiteReviewState } from './types'

interface MapResultsProps {
  items: LiteMediaRecord[]
  visibleItems: LiteMediaRecord[]
  viewportReady: boolean
  selected: LiteMediaRecord | null
  sessionFiles: Map<string, File>
  onBoundsChange(bounds: LiteGeoBounds | null): void
  onCreateEvent(items: LiteMediaRecord[], title: string): Promise<void>
  onSelect(itemId: string): void
  onShowSelected(): void
  onReview(item: LiteMediaRecord, state: LiteReviewState): void
}

const EMPTY_IDS = new Set<string>()
const MAP_PHOTO_BATCH_SIZE = 100

export function MapResults(props: MapResultsProps): JSX.Element {
  const { settings } = useReviewSettings()
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([])
  const [openStackIndex, setOpenStackIndex] = useState<number | null>(null)
  const [createItems, setCreateItems] = useState<LiteMediaRecord[] | null>(null)
  const [createTitle, setCreateTitle] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [createBusy, setCreateBusy] = useState(false)
  const [createNotice, setCreateNotice] = useState<string | null>(null)
  const [hideKnownEvents, setHideKnownEvents] = useState(false)
  const [knownEventIds, setKnownEventIds] = useState<ReadonlySet<string>>(EMPTY_IDS)
  const [knownEventsReady, setKnownEventsReady] = useState(false)
  const [knownEventsLoading, setKnownEventsLoading] = useState(false)
  const [filterActionsHost, setFilterActionsHost] = useState<HTMLElement | null>(null)
  const [visiblePhotoCount, setVisiblePhotoCount] = useState(MAP_PHOTO_BATCH_SIZE)
  const libraryId = props.items[0]?.libraryId ?? ''

  useEffect(() => {
    const host = document.querySelector<HTMLElement>('.pf-main > .filter-disclosure .modern-filters')
    setFilterActionsHost(host)
    return () => setFilterActionsHost(null)
  }, [])

  useEffect(() => {
    setHideKnownEvents(false)
    setKnownEventIds(EMPTY_IDS)
    setKnownEventsReady(false)
    setKnownEventsLoading(false)
  }, [libraryId])

  useEffect(() => {
    if (!hideKnownEvents || knownEventsReady || knownEventsLoading || !libraryId) return
    let cancelled = false
    setKnownEventsLoading(true)
    void loadKnownEventPhotoIds(libraryId)
      .then((ids) => {
        if (cancelled) return
        setKnownEventIds(ids)
        setKnownEventsReady(true)
      })
      .catch(() => {
        if (cancelled) return
        setKnownEventIds(EMPTY_IDS)
        setKnownEventsReady(true)
      })
      .finally(() => {
        if (!cancelled) setKnownEventsLoading(false)
      })
    return () => { cancelled = true }
  }, [hideKnownEvents, knownEventsLoading, knownEventsReady, libraryId])

  const mapItems = useMemo(
    () => hideKnownEvents && knownEventsReady ? props.items.filter((item) => !knownEventIds.has(item.id)) : props.items,
    [hideKnownEvents, knownEventIds, knownEventsReady, props.items]
  )
  const viewportItems = useMemo(
    () => hideKnownEvents && knownEventsReady ? props.visibleItems.filter((item) => !knownEventIds.has(item.id)) : props.visibleItems,
    [hideKnownEvents, knownEventIds, knownEventsReady, props.visibleItems]
  )
  const located = useMemo(() => mapItems.filter(hasLocation), [mapItems])
  const visibleLocated = useMemo(() => viewportItems.filter(hasLocation), [viewportItems])
  const locations = useMemo(() => groupMappedLocations(located), [located])
  const visibleLocations = useMemo(() => groupMappedLocations(visibleLocated), [visibleLocated])
  const byId = useMemo(() => new Map(located.map((item) => [item.id, item])), [located])
  const selectedLocationItems = selectedLocationIds.map((id) => byId.get(id)).filter(isMediaRecord)
  const selectedMapItem = props.selected && byId.has(props.selected.id) ? props.selected : null
  const activeItems = selectedLocationItems.length > 0 ? selectedLocationItems : selectedMapItem ? [selectedMapItem] : []
  const selection = useExplorerPhotoSelection(activeItems)
  const stackedLocationCount = locations.filter((location) => location.items.length > 1).length
  const knownEventCount = useMemo(
    () => knownEventsReady ? props.items.reduce((count, item) => count + (knownEventIds.has(item.id) ? 1 : 0), 0) : null,
    [knownEventIds, knownEventsReady, props.items]
  )

  useEffect(() => {
    setVisiblePhotoCount(MAP_PHOTO_BATCH_SIZE)
  }, [hideKnownEvents, props.visibleItems])

  function selectMapItems(itemIds: string[]): void {
    setSelectedLocationIds(itemIds)
    setOpenStackIndex(null)
    selection.clear()
    if (itemIds.length === 1) props.onSelect(itemIds[0])
  }

  function beginCreateEvent(): void {
    if (!props.viewportReady || visibleLocated.length === 0) return
    setCreateItems([...visibleLocated])
    setCreateTitle('')
    setCreateError(null)
    setCreateNotice(null)
  }

  async function submitCreateEvent(): Promise<void> {
    if (!createItems || createItems.length === 0 || !createTitle.trim() || createBusy) return
    setCreateBusy(true)
    setCreateError(null)
    try {
      await props.onCreateEvent(createItems, createTitle.trim())
      setCreateNotice(`Created “${createTitle.trim()}” from ${createItems.length.toLocaleString()} photos in the captured map area.`)
      setCreateItems(null)
      setCreateTitle('')
    } catch (cause) {
      setCreateError(cause instanceof Error ? cause.message : 'The event could not be created.')
    } finally {
      setCreateBusy(false)
    }
  }

  const knownEventsToggle = (
    <button
      type="button"
      className={hideKnownEvents ? 'map-known-events-toggle active' : 'map-known-events-toggle'}
      aria-pressed={hideKnownEvents}
      disabled={!libraryId || knownEventsLoading}
      title="Hide photos that are already included in one or more Known events from both the map markers and the visible-photo gallery. Known-event membership is only loaded when this option is used."
      onClick={() => setHideKnownEvents((value) => !value)}
    >
      <span aria-hidden="true">{hideKnownEvents ? '☑' : '☐'}</span> {knownEventsLoading ? 'Loading known events…' : <>Hide known events {knownEventCount !== null && <b>{knownEventCount.toLocaleString()}</b>}</>}
    </button>
  )

  return (
    <section className="map-section">
      {filterActionsHost && createPortal(<div className="filter-context map-known-events-filter-row">{knownEventsToggle}</div>, filterActionsHost)}
      <div className="map-toolbar">
        <div className="map-toolbar-left">
          <button type="button" className="primary map-create-event-button" disabled={!props.viewportReady || visibleLocated.length === 0} onClick={beginCreateEvent}>+ Create Event</button>
          <div className="map-viewport-summary">
            <span className="map-location-summary">
              {props.viewportReady
                ? <><strong>{visibleLocated.length.toLocaleString()}</strong> photos · <strong>{visibleLocations.length.toLocaleString()}</strong> locations in visible map area</>
                : <>Calculating visible map area…</>}
            </span>
            <span className="map-location-summary">
              {located.length.toLocaleString()} geotagged photos match the current date/review filters
              {stackedLocationCount > 0 && <> · {stackedLocationCount.toLocaleString()} stacked locations</>}
            </span>
          </div>
        </div>
        <span className="muted">Pan or zoom to change the active photo set. Blue markers contain multiple photos at the same stored coordinates. Map tiles: OpenStreetMap.</span>
      </div>
      {createNotice && <div className="notice success inline-notice map-create-notice">{createNotice}</div>}
      {located.length === 0 ? (
        <div className="map-empty">No geotagged photos match the current non-map filters.</div>
      ) : (
        <GeoMap
          items={located}
          filterToViewport
          onBoundsChange={props.onBoundsChange}
          onSelectItems={selectMapItems}
        />
      )}

      <PhotoSelectionBar items={selection.selectedItems} onReview={(targets, state) => targets.forEach((item) => props.onReview(item, state))} onClear={selection.clear} />

      {selectedLocationItems.length > 1 && (
        <section className="map-location-stack">
          <div className="map-stack-heading">
            <div>
              <div className="eyebrow">Stacked location</div>
              <h3>{selectedLocationItems.length.toLocaleString()} photos at the same coordinates</h3>
              <p>{formatLocation(selectedLocationItems[0])} · click to inspect · Ctrl-click/Shift-click to select</p>
            </div>
            <button type="button" className="quiet-button" onClick={() => { setSelectedLocationIds([]); selection.clear() }}>Close</button>
          </div>
          <div className="map-stack-grid">
            {selectedLocationItems.map((item, index) => {
              const selected = selection.isSelected(item.id)
              return <button type="button" className={selected ? 'map-stack-photo explorer-selected' : 'map-stack-photo'} aria-pressed={selected} key={item.id} onClick={(event) => selection.handlePhotoClick(event, item.id, () => setOpenStackIndex(index))} title={item.relativePath}>
                <div><LocalThumbnail item={item} sessionFile={props.sessionFiles.get(item.id)} />{selected && <span className="selection-check">✓</span>}</div>
                <strong>{item.name}</strong>
                <span>{formatCapture(item)}</span>
              </button>
            })}
          </div>
        </section>
      )}

      {selectedLocationItems.length <= 1 && selectedMapItem && (
        <article className={selection.isSelected(selectedMapItem.id) ? 'map-selection-card explorer-selected' : 'map-selection-card'}>
          <button type="button" className="map-selection-preview map-selection-open" aria-pressed={selection.isSelected(selectedMapItem.id)} onClick={(event) => selection.handlePhotoClick(event, selectedMapItem.id, () => setOpenStackIndex(0))}>
            <LocalThumbnail item={selectedMapItem} sessionFile={props.sessionFiles.get(selectedMapItem.id)} />
            {selection.isSelected(selectedMapItem.id) && <span className="selection-check">✓</span>}
          </button>
          <div>
            <div className="eyebrow">Selected photo</div>
            <strong>{selectedMapItem.name}</strong>
            <p>{formatCapture(selectedMapItem)} · {formatLocation(selectedMapItem)}</p>
            <SourcePath item={selectedMapItem} />
            <div className="map-selection-actions"><button onClick={props.onShowSelected}>Show in photo results</button><ReviewControls item={selectedMapItem} onReview={props.onReview} /></div>
          </div>
        </article>
      )}

      {props.viewportReady && (
        <div className="map-visible-results">
          <PhotoResults
            items={visibleLocated}
            visibleCount={visiblePhotoCount}
            batchSize={MAP_PHOTO_BATCH_SIZE}
            flowLoading={settings.flowLoading}
            selectedId={selectedMapItem?.id ?? null}
            sessionFiles={props.sessionFiles}
            onShowMore={() => setVisiblePhotoCount((count) => Math.min(visibleLocated.length, count + MAP_PHOTO_BATCH_SIZE))}
            onReview={props.onReview}
          />
        </div>
      )}

      {openStackIndex !== null && activeItems[openStackIndex] && (
        <PhotoLightbox
          items={activeItems}
          index={openStackIndex}
          sessionFiles={props.sessionFiles}
          onIndex={setOpenStackIndex}
          onClose={() => setOpenStackIndex(null)}
          onReview={props.onReview}
        />
      )}

      {createItems && (
        <div className="pf-dialog-backdrop" role="presentation" onMouseDown={() => { if (!createBusy) setCreateItems(null) }}>
          <form className="pf-dialog map-event-dialog" role="dialog" aria-modal="true" aria-label="Create event from map" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void submitCreateEvent() }}>
            <div><span className="mode-kicker">Visible map area</span><h3>Create Event</h3><p>This event will contain the {createItems.length.toLocaleString()} photos that were inside the map viewport when you clicked Create Event. Current date and review filters are already applied.</p></div>
            <label><span>Event name</span><input autoFocus value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} placeholder="e.g. Weekend in Aarhus" /></label>
            {createError && <div className="notice error inline-notice">{createError}</div>}
            <div className="pf-dialog-actions">
              <button type="button" className="quiet-button" disabled={createBusy} onClick={() => setCreateItems(null)}>Cancel</button>
              <button type="submit" className="primary" disabled={createBusy || !createTitle.trim()}>{createBusy ? 'Creating…' : `Create event · ${createItems.length.toLocaleString()} photos`}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}

function isMediaRecord(item: LiteMediaRecord | undefined): item is LiteMediaRecord {
  return Boolean(item)
}
