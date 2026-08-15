import type { LiteGeoBounds, LiteMediaRecord, LitePhotoFilters } from './types'

export function filterPhotos(items: LiteMediaRecord[], filters: LitePhotoFilters): LiteMediaRecord[] {
  return items.filter((item) => {
    if (item.kind !== 'image') return false

    const captureTime = item.effectiveCaptureTime ?? item.lastModified
    if (filters.year !== null && new Date(captureTime).getFullYear() !== filters.year) return false
    if (filters.fromTime !== null && captureTime < filters.fromTime) return false
    if (filters.toTime !== null && captureTime > filters.toTime) return false

    if (filters.dateMetadata === 'captured' && item.captureTimeSource === 'file') return false
    if (filters.dateMetadata === 'file-only' && item.captureTimeSource !== 'file') return false

    const located = hasLocation(item)
    if (filters.location === 'located' && !located) return false
    if (filters.location === 'missing' && located) return false
    if (filters.mapBounds && (!located || !containsCoordinate(filters.mapBounds, item.latitude!, item.longitude!))) return false

    return true
  })
}

export function hasLocation(item: LiteMediaRecord): boolean {
  return typeof item.latitude === 'number'
    && typeof item.longitude === 'number'
    && Number.isFinite(item.latitude)
    && Number.isFinite(item.longitude)
}

export function containsCoordinate(bounds: LiteGeoBounds, latitude: number, longitude: number): boolean {
  if (latitude < bounds.south || latitude > bounds.north) return false
  if (bounds.west <= bounds.east) return longitude >= bounds.west && longitude <= bounds.east
  return longitude >= bounds.west || longitude <= bounds.east
}

export function availableYears(items: LiteMediaRecord[]): number[] {
  const years = new Set<number>()
  for (const item of items) {
    if (item.kind !== 'image') continue
    const time = item.effectiveCaptureTime ?? item.lastModified
    const year = new Date(time).getFullYear()
    if (Number.isFinite(year)) years.add(year)
  }
  return [...years].sort((a, b) => b - a)
}

export function dateInputToStart(value: string): number | null {
  if (!value) return null
  const parts = value.split('-').map(Number)
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null
  return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0).getTime()
}

export function dateInputToEnd(value: string): number | null {
  if (!value) return null
  const parts = value.split('-').map(Number)
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null
  return new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999).getTime()
}

export function dateInputWithYear(value: string, year: number, fallbackMonth = 1, fallbackDay = 1): string {
  if (!Number.isInteger(year) || year < 1) return value
  const parts = value.split('-').map(Number)
  const month = parts.length === 3 && Number.isFinite(parts[1]) ? Math.min(12, Math.max(1, parts[1])) : fallbackMonth
  const requestedDay = parts.length === 3 && Number.isFinite(parts[2]) ? Math.max(1, parts[2]) : fallbackDay
  const maximumDay = new Date(year, month, 0).getDate()
  const day = Math.min(requestedDay, maximumDay)
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
