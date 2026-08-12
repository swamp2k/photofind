import { describe, expect, it } from 'vitest'
import { holidayKnownDate, matchingKnownDate, mergeKnownDates } from './knownDates'
import type { LiteKnownDateRecord } from './types'

function record(overrides: Partial<LiteKnownDateRecord> = {}): LiteKnownDateRecord {
  return {
    id: 'birthday',
    libraryId: 'library',
    title: 'Birthday',
    kind: 'birthday',
    source: 'manual',
    startDate: '2010-04-25',
    endDate: '2010-04-25',
    recurringYearly: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

describe('known dates', () => {
  it('matches recurring birthdays in later years', () => {
    const match = matchingKnownDate([record()], new Date(2026, 3, 25, 12, 0, 0).getTime())
    expect(match?.record.title).toBe('Birthday')
    expect(new Date(match!.startTime).getFullYear()).toBe(2026)
  })

  it('supports recurring ranges that cross New Year', () => {
    const christmasTrip = record({
      id: 'christmas-trip',
      title: 'Christmas trip',
      kind: 'vacation',
      startDate: '2010-12-28',
      endDate: '2011-01-03'
    })
    expect(matchingKnownDate([christmasTrip], new Date(2027, 0, 2, 12).getTime())?.record.id).toBe('christmas-trip')
  })

  it('prefers a manual vacation over an imported holiday on the same date', () => {
    const vacation = record({ id: 'vacation', title: 'Motorcycle trip', kind: 'vacation', startDate: '2010-04-24', endDate: '2010-04-27', recurringYearly: false })
    const holiday = record({ id: 'holiday', title: 'Public holiday', kind: 'holiday', source: 'holiday-api', recurringYearly: false })
    expect(matchingKnownDate([holiday, vacation], new Date(2010, 3, 25, 12).getTime())?.record.id).toBe('vacation')
  })

  it('deduplicates repeated holiday imports by deterministic id', () => {
    const first = holidayKnownDate({ libraryId: 'library', countryCode: 'DK', date: '2026-12-25', title: 'Christmas Day', now: 1 })
    const second = holidayKnownDate({ libraryId: 'library', countryCode: 'DK', date: '2026-12-25', title: 'Christmas Day', now: 2 })
    const merged = mergeKnownDates([first], [second])
    expect(merged).toHaveLength(1)
    expect(merged[0].updatedAt).toBe(2)
  })
})
