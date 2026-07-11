import { useState } from 'react'
import type { SpecialDatesState } from '../hooks/useSpecialDates'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

export function SpecialDatesManager({ state }: { state: SpecialDatesState }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<'recurring-yearly' | 'range'>('recurring-yearly')
  const [month, setMonth] = useState(1)
  const [day, setDay] = useState(1)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  async function handleAdd(): Promise<void> {
    if (!label.trim()) return
    if (kind === 'recurring-yearly') {
      await state.add({ label: label.trim(), kind, month, day })
    } else {
      if (!start || !end) return
      await state.add({
        label: label.trim(),
        kind,
        startMs: new Date(`${start}T00:00:00`).getTime(),
        endMs: new Date(`${end}T23:59:59.999`).getTime()
      })
    }
    setLabel('')
  }

  return (
    <section className="special-dates">
      <button className="special-dates-toggle" onClick={() => setOpen((current) => !current)}>
        {open ? '▾' : '▸'} Special dates ({state.dates.length})
      </button>
      {open && (
        <div className="special-dates-body">
          <p className="muted">
            Birthdays, anniversaries and trips. Events overlapping these dates get labeled automatically.
          </p>
          <div className="special-dates-form">
            <input
              type="text"
              placeholder="Label, e.g. Mom's birthday"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
            <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
              <option value="recurring-yearly">Every year</option>
              <option value="range">Date range</option>
            </select>
            {kind === 'recurring-yearly' ? (
              <>
                <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
                  {MONTHS.map((name, index) => (
                    <option key={name} value={index + 1}>
                      {name}
                    </option>
                  ))}
                </select>
                <select value={day} onChange={(event) => setDay(Number(event.target.value))}>
                  {Array.from({ length: 31 }, (_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {index + 1}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
                <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
              </>
            )}
            <button className="primary" disabled={!label.trim()} onClick={handleAdd}>
              Add
            </button>
          </div>
          {state.error && <p className="special-dates-error">{state.error}</p>}
          {state.dates.length > 0 && (
            <ul className="special-dates-list">
              {state.dates.map((date) => (
                <li key={date.id}>
                  <span className="special-date-label">{date.label}</span>
                  <span className="muted">
                    {date.kind === 'recurring-yearly'
                      ? `every ${MONTHS[date.month - 1]} ${date.day}`
                      : `${new Date(date.startMs).toLocaleDateString()} – ${new Date(date.endMs).toLocaleDateString()}`}
                  </span>
                  <button onClick={() => state.remove(date.id)}>Remove</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
