import { useMemo, useState } from 'react'
import { compareKnownDates, createKnownDate, holidayKnownDate, knownDateKindLabel, mergeKnownDates } from './knownDates'
import type { LiteKnownDateKind, LiteKnownDateRecord } from './types'

const HOLIDAY_CONCURRENCY = 4

interface KnownDatesDialogProps {
  libraryId: string
  records: LiteKnownDateRecord[]
  years: number[]
  onReplace(records: LiteKnownDateRecord[]): Promise<void>
  onClose(): void
}

interface HolidayResponse {
  date?: string
  name?: string
  localName?: string
  countryCode?: string
  nationalHoliday?: boolean
  global?: boolean
  holidayTypes?: string[]
  types?: string[]
}

export function KnownDatesDialog({ libraryId, records, years, onReplace, onClose }: KnownDatesDialogProps): JSX.Element {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<LiteKnownDateKind>('birthday')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [recurring, setRecurring] = useState(true)
  const [countryCode, setCountryCode] = useState(defaultCountryCode())
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const sorted = useMemo(() => [...records].sort(compareKnownDates), [records])
  const importYears = useMemo(() => years.length > 0 ? [...years].sort((a, b) => a - b) : [new Date().getFullYear()], [years])

  async function addManual(): Promise<void> {
    setStatus(null)
    try {
      const record = createKnownDate({
        libraryId,
        title,
        kind,
        startDate,
        endDate: endDate || startDate,
        recurringYearly: recurring
      })
      await onReplace(mergeKnownDates(records, [record]))
      setTitle('')
      setStartDate('')
      setEndDate('')
      setStatus('Known date added. Events update immediately.')
    } catch (cause) {
      setStatus(messageOf(cause))
    }
  }

  async function removeRecord(record: LiteKnownDateRecord): Promise<void> {
    setStatus(null)
    try {
      await onReplace(records.filter((candidate) => candidate.id !== record.id))
    } catch (cause) {
      setStatus(messageOf(cause))
    }
  }

  async function importHolidays(): Promise<void> {
    const country = countryCode.trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(country)) {
      setStatus('Use a two-letter ISO country code, for example DK.')
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      const incoming: LiteKnownDateRecord[] = []
      const failedYears: Array<{ year: number; message: string }> = []
      let completed = 0

      for (let start = 0; start < importYears.length; start += HOLIDAY_CONCURRENCY) {
        const chunk = importYears.slice(start, start + HOLIDAY_CONCURRENCY)
        const results = await Promise.all(chunk.map(async (year) => {
          try {
            return { year, rows: await fetchHolidayYear(country, year) }
          } catch (cause) {
            return { year, rows: null, error: messageOf(cause) }
          }
        }))

        for (const result of results) {
          completed += 1
          if (!result.rows) {
            failedYears.push({ year: result.year, message: result.error ?? 'Unknown request failure.' })
          } else {
            for (const row of result.rows) {
              if (!row.date || !(row.localName || row.name)) continue
              if (!isNationalPublicHoliday(row)) continue
              incoming.push(holidayKnownDate({
                libraryId,
                countryCode: country,
                date: row.date,
                title: row.localName || row.name || row.date
              }))
            }
          }
          setStatus(`Importing public holidays ${completed} / ${importYears.length} · ${result.year}`)
        }
      }

      if (incoming.length === 0 && failedYears.length > 0) {
        throw new Error(`No holiday years could be imported. ${formatFailures(failedYears)}`)
      }
      const next = mergeKnownDates(records, incoming)
      await onReplace(next)
      setStatus(failedYears.length === 0
        ? `Imported ${incoming.length.toLocaleString()} public-holiday dates for ${country}. Existing imports were updated, not duplicated.`
        : `Imported ${incoming.length.toLocaleString()} public-holiday dates for ${country}. ${failedYears.length} year${failedYears.length === 1 ? '' : 's'} failed: ${failedYears.map((entry) => entry.year).join(', ')}.`)
    } catch (cause) {
      setStatus(`Holiday import failed: ${messageOf(cause)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pf-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="pf-dialog known-dates-dialog" role="dialog" aria-modal="true" aria-label="Known dates" onMouseDown={(event) => event.stopPropagation()}>
        <header className="known-dates-head">
          <div><span className="mode-kicker">Event intelligence</span><h3>Known dates</h3><p>Tell PhotoFind about dates it cannot safely infer: birthdays, trips, anniversaries and other real events.</p></div>
          <button type="button" className="icon-button" aria-label="Close known dates" onClick={onClose}>×</button>
        </header>

        <div className="known-dates-grid">
          <div className="known-date-editor">
            <h4>Add a date or range</h4>
            <label><span>Name</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Balder birthday or Summer vacation" /></label>
            <label><span>Type</span><select value={kind} onChange={(event) => {
              const value = event.target.value as LiteKnownDateKind
              setKind(value)
              if (value === 'birthday') setRecurring(true)
            }}><option value="birthday">Birthday / anniversary</option><option value="vacation">Vacation / trip</option><option value="custom">Other known event</option></select></label>
            <div className="known-date-range"><label><span>Start</span><input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); if (!endDate || kind === 'birthday') setEndDate(event.target.value) }} /></label><label><span>End</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></div>
            <label className="check-label"><input type="checkbox" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} /><span><strong>Repeat every year</strong><small>Useful for birthdays and anniversaries. The year in the date fields is ignored when matching.</small></span></label>
            <button type="button" className="primary" disabled={!title.trim() || !startDate} onClick={() => void addManual()}>Add known date</button>
          </div>

          <div className="holiday-import-card">
            <h4>Public holidays</h4>
            <p>Optional internet lookup. Only the country code and requested years are sent; no photo or index data leaves PhotoFind.</p>
            <label><span>Country code</span><input value={countryCode} maxLength={2} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} placeholder="DK" /></label>
            <p className="muted">Library years: {importYears[0]}{importYears.length > 1 ? `–${importYears.at(-1)}` : ''}</p>
            <button type="button" disabled={busy} onClick={() => void importHolidays()}>{busy ? 'Importing…' : 'Import public holidays'}</button>
          </div>
        </div>

        {status && <div className="known-date-status">{status}</div>}

        <div className="known-date-list-head"><strong>{sorted.length.toLocaleString()} known dates</strong><span>Manual ranges override imported holidays when dates overlap.</span></div>
        <div className="known-date-list">
          {sorted.length === 0 ? <p className="muted">No known dates yet.</p> : sorted.map((record) => (
            <article key={record.id}>
              <div><strong>{record.title}</strong><span>{knownDateKindLabel(record.kind)} · {formatDateRange(record)}{record.recurringYearly ? ' · yearly' : ''}{record.countryCode ? ` · ${record.countryCode}` : ''}</span></div>
              <button type="button" className="quiet-button" onClick={() => void removeRecord(record)}>Remove</button>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

async function fetchHolidayYear(country: string, year: number): Promise<HolidayResponse[]> {
  const endpoint = `/api/holidays?country=${encodeURIComponent(country)}&year=${year}`
  const response = await fetch(endpoint, { cache: 'force-cache' })
  if (!response.ok) {
    const details = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(details?.error || `Holiday proxy returned HTTP ${response.status}.`)
  }
  const rows = await response.json()
  if (!Array.isArray(rows)) throw new Error('Holiday proxy returned an unexpected response.')
  return rows as HolidayResponse[]
}

function isNationalPublicHoliday(row: HolidayResponse): boolean {
  const national = row.nationalHoliday ?? row.global ?? true
  const types = row.holidayTypes ?? row.types
  return national !== false && (!types || types.includes('Public'))
}

function formatFailures(entries: Array<{ year: number; message: string }>): string {
  return entries.slice(0, 3).map((entry) => `${entry.year}: ${entry.message}`).join('; ')
}

function formatDateRange(record: LiteKnownDateRecord): string {
  if (record.startDate === record.endDate) return record.startDate
  return `${record.startDate} – ${record.endDate}`
}

function defaultCountryCode(): string {
  const region = navigator.language.split('-')[1]?.toUpperCase()
  return region && /^[A-Z]{2}$/.test(region) ? region : 'DK'
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Something went wrong.'
}
