import { useMemo, useState } from 'react'
import { formatCapture, formatLocation } from './formatters'
import { GeoMap } from './GeoMap'
import { hasLocation } from './filters'
import { LocalThumbnail } from './LocalThumbnail'
import { groupMappedLocations } from './mapLocations'
import { PhotoLightbox } from './PhotoLightbox'
import { PhotoSelectionBar, useExplorerPhotoSelection } from './PhotoSelection'
import { ReviewControls } from './ReviewControls'
import { SourcePath } from './SourcePathView'
import type { LiteGeoBounds, LiteMediaRecord, LiteReviewState } from './types'

interface MapResultsProps {
  items: LiteMediaRecord[]
  filterToViewport: boolean
  selected: LiteMediaRecord | null
  sessionFiles: Map<string, File>
  onFilterToViewport(value: boolean): void
  onBoundsChange(bounds: LiteGeoBounds | null): void
  onSelect(itemId: string): void
  onShowSelected(): void
  onReview(item: LiteMediaRecord, state: LiteReviewState): void
}

export function MapResults(props: MapResultsProps): JSX.Element {
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([])
  const [openStackIndex, setOpenStackIndex] = useState<number | null>(null)
  const located = props.items.filter(hasLocation)
  const locations = useMemo(() => groupMappedLocations(located), [located])
  const byId = useMemo(() => new Map(located.map((item) => [item.id, item])), [located])
  const selectedLocationItems = selectedLocationIds.map((id) => byId.get(id)).filter(isMediaRecord)
  const activeItems = selectedLocationItems.length > 0 ? selectedLocationItems : props.selected ? [props.selected] : []
  const selection = useExplorerPhotoSelection(activeItems)
  const stackedLocationCount = locations.filter((location) => location.items.length > 1).length

  function selectMapItems(itemIds: string[]): void {
    setSelectedLocationIds(itemIds)
    setOpenStackIndex(null)
    selection.clear()
    if (itemIds.length === 1) props.onSelect(itemIds[0])
  }

  return (
    <section className="map-section">
      <div className="map-toolbar">
        <div className="map-toolbar-left">
          <label className="check-label">
            <input type="checkbox" checked={props.filterToViewport} onChange={(event) => props.onFilterToViewport(event.target.checked)} />
            <span>Filter photo results to visible map area</span>
          </label>
          <span className="map-location-summary">
            <strong>{located.length.toLocaleString()}</strong> geotagged photos · <strong>{locations.length.toLocaleString()}</strong> mapped locations
            {stackedLocationCount > 0 && <> · <strong>{stackedLocationCount.toLocaleString()}</strong> stacked</>}
          </span>
        </div>
        <span className="muted">Blue markers contain multiple photos at the same stored coordinates. Map tiles: OpenStreetMap.</span>
      </div>
      {located.length === 0 ? (
        <div className="map-empty">No geotagged photos match the current non-map filters.</div>
      ) : (
        <GeoMap
          items={located}
          filterToViewport={props.filterToViewport}
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

      {selectedLocationItems.length <= 1 && props.selected && (
        <article className={selection.isSelected(props.selected.id) ? 'map-selection-card explorer-selected' : 'map-selection-card'}>
          <button type="button" className="map-selection-preview map-selection-open" aria-pressed={selection.isSelected(props.selected.id)} onClick={(event) => selection.handlePhotoClick(event, props.selected!.id, () => setOpenStackIndex(0))}>
            <LocalThumbnail item={props.selected} sessionFile={props.sessionFiles.get(props.selected.id)} />
            {selection.isSelected(props.selected.id) && <span className="selection-check">✓</span>}
          </button>
          <div>
            <div className="eyebrow">Selected photo</div>
            <strong>{props.selected.name}</strong>
            <p>{formatCapture(props.selected)} · {formatLocation(props.selected)}</p>
            <SourcePath item={props.selected} />
            <div className="map-selection-actions"><button onClick={props.onShowSelected}>Show in photo results</button><ReviewControls item={props.selected} onReview={props.onReview} /></div>
          </div>
        </article>
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
    </section>
  )
}

function isMediaRecord(item: LiteMediaRecord | undefined): item is LiteMediaRecord {
  return Boolean(item)
}
