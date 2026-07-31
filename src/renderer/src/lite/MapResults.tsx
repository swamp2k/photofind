import { formatCapture, formatLocation } from './formatters'
import { GeoMap } from './GeoMap'
import { hasLocation } from './filters'
import { LocalThumbnail } from './LocalThumbnail'
import type { LiteGeoBounds, LiteMediaRecord } from './types'

interface MapResultsProps {
  items: LiteMediaRecord[]
  filterToViewport: boolean
  selected: LiteMediaRecord | null
  sessionFiles: Map<string, File>
  onFilterToViewport(value: boolean): void
  onBoundsChange(bounds: LiteGeoBounds | null): void
  onSelect(itemId: string): void
  onShowSelected(): void
}

export function MapResults(props: MapResultsProps): JSX.Element {
  const located = props.items.filter(hasLocation)
  return (
    <section className="map-section">
      <div className="map-toolbar">
        <label className="check-label">
          <input type="checkbox" checked={props.filterToViewport} onChange={(event) => props.onFilterToViewport(event.target.checked)} />
          <span>Filter photo results to visible map area</span>
        </label>
        <span className="muted">Map tiles: OpenStreetMap. Viewing an area sends tile requests for that area to the tile provider.</span>
      </div>
      {located.length === 0 ? (
        <div className="map-empty">No geotagged photos match the current non-map filters.</div>
      ) : (
        <GeoMap
          items={located}
          filterToViewport={props.filterToViewport}
          onBoundsChange={props.onBoundsChange}
          onSelect={props.onSelect}
        />
      )}
      {props.selected && (
        <article className="map-selection-card">
          <div className="map-selection-preview"><LocalThumbnail item={props.selected} sessionFile={props.sessionFiles.get(props.selected.id)} /></div>
          <div>
            <div className="eyebrow">Selected photo</div>
            <strong>{props.selected.name}</strong>
            <p>{formatCapture(props.selected)} · {formatLocation(props.selected)}</p>
            <button onClick={props.onShowSelected}>Show in photo results</button>
          </div>
        </article>
      )}
    </section>
  )
}
