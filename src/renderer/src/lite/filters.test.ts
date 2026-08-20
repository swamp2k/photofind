import { describe, expect, it } from 'vitest'
import { containsCoordinate, dateInputToEnd, dateInputToStart, dateInputWithYear, filterPhotos, monthShortcutValue, parseSmartDateInput } from './filters'
import type { LiteMediaRecord, LitePhotoFilters } from './types'

function photo(id: string, time: number, latitude?: number, longitude?: number, source: 'takeout' | 'exif' | 'file' = 'exif'): LiteMediaRecord {
  return {
    id,
    libraryId: 'lib',
    relativePath: `${id}.jpg`,
    name: `${id}.jpg`,
    kind: 'image',
    sizeBytes: 100,
    lastModified: time,
    mimeType: 'image/jpeg',
    effectiveCaptureTime: time,
    captureTimeSource: source,
    ...(latitude !== undefined && longitude !== undefined ? { latitude, longitude, locationSource: 'exif' as const } : {})
  }
}

const base: LitePhotoFilters = {
  year: null,
  fromTime: null,
  toTime: null,
  location: 'all',
  dateMetadata: 'all',
  mapBounds: null
}

describe('geographic bounds', () => {
  it('includes normal bounds and wrapped antimeridian bounds', () => {
    expect(containsCoordinate({ west: 10, south: 50, east: 15, north: 60 }, 56, 12)).toBe(true)
    expect(containsCoordinate({ west: 170, south: -20, east: -170, north: 20 }, 0, 179)).toBe(true)
    expect(containsCoordinate({ west: 170, south: -20, east: -170, north: 20 }, 0, -179)).toBe(true)
    expect(containsCoordinate({ west: 170, south: -20, east: -170, north: 20 }, 0, 0)).toBe(false)
  })
})

describe('combined photo filtering', () => {
  it('combines year, location and viewport constraints', () => {
    const y2024 = new Date(2024, 5, 1).getTime()
    const y2025 = new Date(2025, 5, 1).getTime()
    const items = [photo('inside', y2024, 56, 12), photo('outside', y2024, 40, 12), photo('later', y2025, 56, 12)]
    const result = filterPhotos(items, {
      ...base,
      year: 2024,
      location: 'located',
      mapBounds: { west: 10, south: 50, east: 15, north: 60 }
    })
    expect(result.map((item) => item.id)).toEqual(['inside'])
  })

  it('can isolate missing GPS and file-time fallbacks', () => {
    const time = new Date(2024, 1, 1).getTime()
    const items = [photo('captured', time, 56, 12, 'exif'), photo('fallback', time, undefined, undefined, 'file')]
    expect(filterPhotos(items, { ...base, location: 'missing' }).map((item) => item.id)).toEqual(['fallback'])
    expect(filterPhotos(items, { ...base, dateMetadata: 'file-only' }).map((item) => item.id)).toEqual(['fallback'])
  })

  it('filters a month shortcut across years and combines it with the Year filter', () => {
    const items = [
      photo('aug-2024', new Date(2024, 7, 2).getTime()),
      photo('jan-2025', new Date(2025, 0, 2).getTime()),
      photo('aug-2025', new Date(2025, 7, 2).getTime())
    ]
    const shortcut = monthShortcutValue(8)
    const monthFilters = { ...base, fromTime: dateInputToStart(shortcut), toTime: dateInputToEnd(shortcut) }

    expect(filterPhotos(items, monthFilters).map((item) => item.id)).toEqual(['aug-2024', 'aug-2025'])
    expect(filterPhotos(items, { ...monthFilters, year: 2024 }).map((item) => item.id)).toEqual(['aug-2024'])
  })
})

describe('date input helpers', () => {
  it('jumps directly to another year while preserving month and day', () => {
    expect(dateInputWithYear('2019-08-14', 2007)).toBe('2007-08-14')
  })

  it('clamps leap day and supports useful empty-date defaults', () => {
    expect(dateInputWithYear('2020-02-29', 2019)).toBe('2019-02-28')
    expect(dateInputWithYear('', 2019, 1, 1)).toBe('2019-01-01')
    expect(dateInputWithYear('', 2019, 12, 31)).toBe('2019-12-31')
  })

  it('understands two-digit month shorthand and normal exact dates', () => {
    expect(parseSmartDateInput('01')).toEqual({ kind: 'month', month: 1 })
    expect(parseSmartDateInput('08')).toEqual({ kind: 'month', month: 8 })
    expect(parseSmartDateInput('08/14/2020')).toEqual({ kind: 'date', value: '2020-08-14' })
    expect(parseSmartDateInput('2020-08-14')).toEqual({ kind: 'date', value: '2020-08-14' })
    expect(parseSmartDateInput('13')).toEqual({ kind: 'invalid' })
  })
})
