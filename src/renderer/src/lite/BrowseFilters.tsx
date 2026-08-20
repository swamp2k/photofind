import { useEffect, useRef, useState } from 'react'
import { dateInputWithYear, monthShortcutFromValue, monthShortcutValue, parseSmartDateInput } from './filters'
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
        <DateFilterControl label="From" value={props.fromDate} years={props.years} emptyMonth={1} emptyDay={1} smartMonth onChange={props.onFromDate} />
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
  smartMonth = false,
  onChange
}: {
  label: string
  value: string
  years: number[]
  emptyMonth: number
  emptyDay: number
  smartMonth?: boolean
  onChange(value: string): void
}): JSX.Element {
  const shortcutMonth = monthShortcutFromValue(value)
  const valueYear = shortcutMonth === null && value ? Number(value.slice(0, 4)) : null
  const options = [...new Set([...(Number.isFinite(valueYear) ? [valueYear!] : []), ...years])].sort((a, b) => b - a)

  return (
    <label className="date-filter-label">
      <span>{label}</span>
      <div className="date-filter-control" style={smartMonth ? { gridTemplateColumns: 'minmax(0, 1fr) 36px 86px' } : undefined}>
        {smartMonth
          ? <SmartFromDateInput label={label} value={value} onChange={onChange} />
          : shortcutMonth !== null
            ? <input type="text" value={`Whole ${MONTH_NAMES[shortcutMonth - 1]}`} disabled aria-label={`${label}: whole ${MONTH_NAMES[shortcutMonth - 1]}`} />
            : <input type="date" value={value} onChange={(event) => onChange(event.target.value)} />}
        <select
          className="date-year-jump"
          aria-label={`${label} year`}
          title={shortcutMonth !== null ? 'Use the Year filter above to limit a month shortcut to one year.' : 'Jump directly to a year'}
          value={valueYear ?? ''}
          disabled={shortcutMonth !== null}
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

function SmartFromDateInput({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const pickerRef = useRef<HTMLInputElement>(null)
  const committedDisplay = displaySmartDateValue(value)
  const [draft, setDraft] = useState(committedDisplay)

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(committedDisplay)
  }, [committedDisplay])

  function applyDraft(next: string, final: boolean): void {
    const parsed = parseSmartDateInput(next)
    if (parsed.kind === 'empty') {
      onChange('')
      if (final) setDraft('')
      return
    }
    if (parsed.kind === 'month') {
      if (final || next.trim().length === 2) {
        onChange(monthShortcutValue(parsed.month))
        if (final) setDraft(String(parsed.month).padStart(2, '0'))
      } else if (value) {
        onChange('')
      }
      return
    }
    if (parsed.kind === 'date') {
      onChange(parsed.value)
      if (final) setDraft(displaySmartDateValue(parsed.value))
      return
    }
    if (value) onChange('')
    if (final) setDraft(committedDisplay)
  }

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={draft}
        placeholder="mm/dd/yyyy or mm"
        aria-label={`${label} date or month`}
        title="Type 01–12 to show that whole month across all years. Use the Year filter above to limit it to one year."
        onChange={(event) => {
          const next = event.target.value
          setDraft(next)
          applyDraft(next, false)
        }}
        onBlur={() => applyDraft(draft, true)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          applyDraft(draft, true)
          event.currentTarget.blur()
        }}
      />
      <button
        type="button"
        className="quiet-button"
        aria-label={`Choose ${label.toLowerCase()} date`}
        title="Choose an exact date"
        style={{ height: 36, minWidth: 36, padding: 0 }}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => pickerRef.current?.showPicker?.()}
      >▦</button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        onChange={(event) => {
          if (!event.target.value) return
          onChange(event.target.value)
          setDraft(displaySmartDateValue(event.target.value))
          event.target.value = ''
        }}
      />
    </>
  )
}

function displaySmartDateValue(value: string): string {
  const shortcutMonth = monthShortcutFromValue(value)
  if (shortcutMonth !== null) return String(shortcutMonth).padStart(2, '0')
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[2]}/${match[3]}/${match[1]}` : value
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
