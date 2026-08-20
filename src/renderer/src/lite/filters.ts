import type { LiteGeoBounds, LiteMediaRecord, LitePhotoFilters } from './types'

const MONTH_FILTER_SENTINEL_BASE = -9_007_199_254_740_000
const MONTH_SHORTCUT_PREFIX = 'month:'

export type ParsedSmartDateInput =
  | { kind: 'empty' }
  | { kind: 'month'; month: number }
  | { kind: 'date'; value: string }
  | { kind: 'invalid' }

export function filterPhotos(items: LiteMediaRecord[], filters: LitePhotoFilters): LiteMediaRecord[] {
  const recurringMonth = monthFilterFromTimes(filters.fromTime, filters.toTime)

  return items.filter((item) => {
    if (item.kind !== 'image') return false

    const captureTime = item.effectiveCaptureTime ?? item.lastModified
    const captureDate = new Date(captureTime)
    if (filters.year !== null && captureDate.getFullYear() !== filters.year) return false
    if (recurringMonth !== null && captureDate.getMonth() + 1 !== recurringMonth) return false
    if (recurringMonth === null && filters.fromTime !== null && captureTime < filters.fromTime) return false
    if (recurringMonth === null && filters.toTime !== null && captureTime > filters.toTime) return false

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

export function monthShortcutValue(month: number): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) return ''
  return `${MONTH_SHORTCUT_PREFIX}${String(month).padStart(2, '0')}`
}

export function monthShortcutFromValue(value: string): number | null {
  const match = value.match(/^month:(0[1-9]|1[0-2])$/)
  return match ? Number(match[1]) : null
}

export function parseSmartDateInput(value: string): ParsedSmartDateInput {
  const input = value.trim()
  if (!input) return { kind: 'empty' }

  if (/^\d{1,2}$/.test(input)) {
    const month = Number(input)
    return month >= 1 && month <= 12 ? { kind: 'month', month } : { kind: 'invalid' }
  }

  let year: number
  let month: number
  let day: number
  const iso = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) {
    year = Number(iso[1])
    month = Number(iso[2])
    day = Number(iso[3])
  } else {
    const local = input.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
    if (!local) return { kind: 'invalid' }
    month = Number(local[1])
    day = Number(local[2])
    year = Number(local[3])
  }

  const normalized = normalizeCalendarDate(year, month, day)
  return normalized ? { kind: 'date', value: normalized } : { kind: 'invalid' }
}

export function dateInputToStart(value: string): number | null {
  if (!value) return null
  const month = monthShortcutFromValue(value)
  if (month !== null) return monthFilterSentinel(month)
  const parts = value.split('-').map(Number)
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null
  return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0).getTime()
}

export function dateInputToEnd(value: string): number | null {
  if (!value) return null
  const month = monthShortcutFromValue(value)
  if (month !== null) return monthFilterSentinel(month)
  const parts = value.split('-').map(Number)
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null
  return new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999).getTime()
}

export function dateInputWithYear(value: string, year: number, fallbackMonth = 1, fallbackDay = 1): string {
  if (!Number.isInteger(year) || year < 1) return value
  const shortcutMonth = monthShortcutFromValue(value)
  const parts = value.split('-').map(Number)
  const month = shortcutMonth ?? (parts.length === 3 && Number.isFinite(parts[1]) ? Math.min(12, Math.max(1, parts[1])) : fallbackMonth)
  const requestedDay = parts.length === 3 && Number.isFinite(parts[2]) ? Math.max(1, parts[2]) : fallbackDay
  const maximumDay = new Date(year, month, 0).getDate()
  const day = Math.min(requestedDay, maximumDay)
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function monthFilterSentinel(month: number): number {
  return MONTH_FILTER_SENTINEL_BASE + month
}

function monthFilterFromTimes(fromTime: number | null, toTime: number | null): number | null {
  if (fromTime === null || toTime === null || fromTime !== toTime) return null
  const month = fromTime - MONTH_FILTER_SENTINEL_BASE
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null
}

function normalizeCalendarDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) return null
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  if (!Number.isInteger(day) || day < 1) return null
  const maximumDay = new Date(year, month, 0).getDate()
  if (day > maximumDay) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
