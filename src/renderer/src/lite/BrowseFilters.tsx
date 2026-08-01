import type { LiteDateMetadataFilter, LiteLocationFilter } from './types'

interface BrowseFiltersProps {
  years: number[]
  year: number | null
  fromDate: string
  toDate: string
  location: LiteLocationFilter
  dateMetadata: LiteDateMetadataFilter
  matchingCount: number
  totalCount: number
  viewportActive: boolean
  onYear(value: number | null): void
  onFromDate(value: string): void
  onToDate(value: string): void
  onLocation(value: LiteLocationFilter): void
  onDateMetadata(value: LiteDateMetadataFilter): void
  onClear(): void
}

export function BrowseFilters(props: BrowseFiltersProps): JSX.Element {
  return (
    <section className="filter-panel modern-filters">
      <div className="filter-grid">
        <label>
          <span>Year</span>
          <select value={props.year ?? ''} onChange={(event) => props.onYear(event.target.value ? Number(event.target.value) : null)}>
            <option value="">All years</option>
            {props.years.map((value) => <option value={value} key={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span>From</span>
          <input type="date" value={props.fromDate} onChange={(event) => props.onFromDate(event.target.value)} />
        </label>
        <label>
          <span>To</span>
          <input type="date" value={props.toDate} onChange={(event) => props.onToDate(event.target.value)} />
        </label>
        <label>
          <span>Place</span>
          <select value={props.location} onChange={(event) => props.onLocation(event.target.value as LiteLocationFilter)}>
            <option value="all">Anywhere</option>
            <option value="located">With location</option>
            <option value="missing">Missing location</option>
          </select>
        </label>
        <label>
          <span>Date source</span>
          <select value={props.dateMetadata} onChange={(event) => props.onDateMetadata(event.target.value as LiteDateMetadataFilter)}>
            <option value="all">Any timestamp</option>
            <option value="captured">EXIF / Takeout</option>
            <option value="file-only">File fallback only</option>
          </select>
        </label>
        <button type="button" className="clear-filter-button" onClick={props.onClear}>Reset</button>
      </div>
      <div className="filter-context"><span><strong>{props.matchingCount.toLocaleString()}</strong> of {props.totalCount.toLocaleString()} photos</span>{props.viewportActive && <span className="filter-badge">Map area active</span>}</div>
    </section>
  )
}
