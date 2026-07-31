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
    <section className="filter-panel">
      <div className="filter-heading">
        <div>
          <div className="eyebrow">Find photos</div>
          <h2>Time and place</h2>
        </div>
        <button onClick={props.onClear}>Clear filters</button>
      </div>
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
          <span>Location</span>
          <select value={props.location} onChange={(event) => props.onLocation(event.target.value as LiteLocationFilter)}>
            <option value="all">All photos</option>
            <option value="located">With location</option>
            <option value="missing">Missing location</option>
          </select>
        </label>
        <label>
          <span>Capture metadata</span>
          <select value={props.dateMetadata} onChange={(event) => props.onDateMetadata(event.target.value as LiteDateMetadataFilter)}>
            <option value="all">All timestamps</option>
            <option value="captured">EXIF / Takeout date</option>
            <option value="file-only">File time fallback only</option>
          </select>
        </label>
      </div>
      <div className="filter-result-row">
        <strong>{props.matchingCount.toLocaleString()}</strong>
        <span>of {props.totalCount.toLocaleString()} photos match</span>
        {props.viewportActive && <span className="filter-badge">map viewport active</span>}
      </div>
    </section>
  )
}
