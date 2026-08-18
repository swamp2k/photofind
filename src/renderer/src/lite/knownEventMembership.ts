import { isKnownDateOverride } from './eventOverrides'
import { startGlobalProcess } from './globalProcesses'
import { listLibraries, loadEventOverrides, loadGlobalKnownDates, loadMedia } from './libraryDb'
import { mergeKnownDates } from './knownDates'
import { isRejected } from './review'
import type { LiteKnownDateRecord, LiteMediaRecord } from './types'

export async function loadKnownEventPhotoIds(libraryId: string): Promise<Set<string>> {
  if (!libraryId) return new Set()
  const process = startGlobalProcess('Indexing Known events', { detail: 'Reading local event data…' })
  try {
    const [libraries, media, overrides, globalKnownDates] = await Promise.all([
      listLibraries(),
      loadMedia(libraryId),
      loadEventOverrides(libraryId),
      loadGlobalKnownDates()
    ])
    const library = libraries.find((candidate) => candidate.id === libraryId)
    const knownDates = mergeKnownDates(library?.knownDates ?? [], globalKnownDates)
    const photos = media.filter((item) => item.kind === 'image' && !isRejected(item))

    process.update({ detail: 'Building date membership…', complete: 0, total: photos.length })
    const years = yearsIn(photos)
    const knownDays = buildKnownDaySet(knownDates, years)
    const automatic = new Set<string>()
    const batch = 500
    for (let index = 0; index < photos.length; index += 1) {
      const item = photos[index]
      if (knownDays.has(localDayKey(captureTimeOf(item)))) automatic.add(item.id)
      if ((index + 1) % batch === 0 || index + 1 === photos.length) {
        process.update({ complete: index + 1, total: photos.length, detail: item.relativePath })
        if (index + 1 < photos.length) await yieldToUi()
      }
    }

    process.update({ detail: 'Applying event changes…', complete: photos.length, total: photos.length })
    // Automatic Known-date events partition the timeline. Membership-changing overrides keep
    // their original event itemIds, so we can project additions/removals without rebuilding
    // event clusters or asking every photo about every event.
    for (const override of overrides) {
      const touchesAutomatic = override.itemIds.some((id) => automatic.has(id))
      if (!touchesAutomatic) continue
      if (override.hidden) {
        for (const id of override.itemIds) automatic.delete(id)
        continue
      }
      if (override.includedItemIds !== undefined) {
        for (const id of override.itemIds) automatic.delete(id)
        for (const id of override.includedItemIds) automatic.add(id)
      }
    }

    // Promoted and manually-created Known events are stored explicitly in overrides.
    // Union them after automatic-event projection so overlapping manual events stay Known.
    for (const override of overrides) {
      if (!isKnownDateOverride(override) || override.hidden) continue
      for (const id of override.includedItemIds ?? override.itemIds) automatic.add(id)
    }

    return automatic
  } finally {
    process.finish()
  }
}

function yearsIn(items: LiteMediaRecord[]): number[] {
  const years = new Set<number>()
  for (const item of items) {
    const year = new Date(captureTimeOf(item)).getFullYear()
    if (Number.isFinite(year)) years.add(year)
  }
  return [...years].sort((left, right) => left - right)
}

function buildKnownDaySet(records: LiteKnownDateRecord[], years: number[]): Set<string> {
  const days = new Set<string>()
  if (records.length === 0 || years.length === 0) return days
  const minYear = years[0]
  const maxYear = years.at(-1)!

  for (const record of records) {
    const startParts = dateParts(record.startDate)
    const endParts = dateParts(record.endDate || record.startDate)
    if (!startParts || !endParts) continue

    if (!record.recurringYearly) {
      addDateRange(days, new Date(startParts.year, startParts.month - 1, startParts.day), new Date(endParts.year, endParts.month - 1, endParts.day))
      continue
    }

    for (let year = minYear - 1; year <= maxYear; year += 1) {
      const start = new Date(year, startParts.month - 1, startParts.day)
      const crossesYear = endParts.month < startParts.month || (endParts.month === startParts.month && endParts.day < startParts.day)
      const end = new Date(crossesYear ? year + 1 : year, endParts.month - 1, endParts.day)
      addDateRange(days, start, end)
    }
  }
  return days
}

function addDateRange(target: Set<string>, start: Date, end: Date): void {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return
  const cursor = new Date(start)
  const final = new Date(end)
  cursor.setHours(12, 0, 0, 0)
  final.setHours(12, 0, 0, 0)
  while (cursor.getTime() <= final.getTime()) {
    target.add(localDayKey(cursor.getTime()))
    cursor.setDate(cursor.getDate() + 1)
  }
}

function dateParts(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}

function localDayKey(time: number): string {
  const date = new Date(time)
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function captureTimeOf(item: Pick<LiteMediaRecord, 'effectiveCaptureTime' | 'lastModified'>): number {
  return typeof item.effectiveCaptureTime === 'number' ? item.effectiveCaptureTime : item.lastModified
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}
