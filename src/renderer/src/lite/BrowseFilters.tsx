import { dateInputWithYear } from './filters'
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
        <DateFilterControl label="From" value={props.fromDate} years={props.years} emptyMonth={1} emptyDay={1} onChange={props.onFromDate} />
        <DateFilterControl label="To" value={props.toDate} years={props.years} emptyMonth={12} emptyDay={31} onChange={props.onToDate} />
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

function DateFilterControl({
  label,
  value,
  years,
  emptyMonth,
  emptyDay,
  onChange
}: {
  label: string
  value: string
  years: number[]
  emptyMonth: number
  emptyDay: number
  onChange(value: string): void
}): JSX.Element {
  const valueYear = value ? Number(value.slice(0, 4)) : null
  const options = [...new Set([...(Number.isFinite(valueYear) ? [valueYear!] : []), ...years])].sort((a, b) => b - a)

  return (
    <label className="date-filter-label">
      <span>{label}</span>
      <div className="date-filter-control">
        <input type="date" value={value} onChange={(event) => onChange(event.target.value)} />
        <select
          className="date-year-jump"
          aria-label={`${label} year`}
          title="Jump directly to a year"
          value={valueYear ?? ''}
          onChange={(event) => {
            if (!event.target.value) return
            onChange(dateInputWithYear(value, Number(event.target.value), emptyMonth, emptyDay))
          }}
        >
          <option value="">Year…</option>
          {options.map((year) => <option value={year} key={year}>{year}</option>)}
        </select>
      </div>
    </label>
  )
}
