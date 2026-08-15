import type { LiteKnownDateKind, LiteKnownDateRecord, LiteKnownDateScope } from './types'

export interface LiteKnownDateOccurrence {
  record: LiteKnownDateRecord
  key: string
  startTime: number
  endTime: number
}

export function matchingKnownDate(records: LiteKnownDateRecord[], time: number): LiteKnownDateOccurrence | null {
  const matches = records
    .map((record) => occurrenceForTime(record, time))
    .filter((value): value is LiteKnownDateOccurrence => Boolean(value))
    .sort((left, right) => knownDatePriority(right.record) - knownDatePriority(left.record)
      || (right.endTime - right.startTime) - (left.endTime - left.startTime)
      || left.record.title.localeCompare(right.record.title))
  return matches[0] ?? null
}

export function occurrenceForTime(record: LiteKnownDateRecord, time: number): LiteKnownDateOccurrence | null {
  if (!Number.isFinite(time)) return null
  const target = new Date(time)
  if (Number.isNaN(target.getTime())) return null

  if (!record.recurringYearly) {
    const start = parseLocalDate(record.startDate)
    const end = endOfLocalDate(record.endDate || record.startDate)
    if (!start || !end || time < start.getTime() || time > end.getTime()) return null
    return {
      record,
      key: `${record.id}:${record.startDate}`,
      startTime: start.getTime(),
      endTime: end.getTime()
    }
  }

  const startParts = dateParts(record.startDate)
  const endParts = dateParts(record.endDate || record.startDate)
  if (!startParts || !endParts) return null
  const targetYear = target.getFullYear()
  for (const year of [targetYear - 1, targetYear, targetYear + 1]) {
    const start = new Date(year, startParts.month - 1, startParts.day, 0, 0, 0, 0)
    const crossesYear = compareMonthDay(endParts, startParts) < 0
    const endYear = crossesYear ? year + 1 : year
    const end = new Date(endYear, endParts.month - 1, endParts.day, 23, 59, 59, 999)
    if (time < start.getTime() || time > end.getTime()) continue
    return {
      record,
      key: `${record.id}:${formatLocalDate(start)}`,
      startTime: start.getTime(),
      endTime: end.getTime()
    }
  }
  return null
}

export function createKnownDate(input: {
  libraryId: string
  title: string
  kind: LiteKnownDateKind
  startDate: string
  endDate?: string
  recurringYearly?: boolean
  scope?: LiteKnownDateScope
  now?: number
}): LiteKnownDateRecord {
  const now = input.now ?? Date.now()
  const endDate = input.endDate?.trim() || input.startDate
  if (!parseLocalDate(input.startDate) || !parseLocalDate(endDate)) throw new Error('Choose a valid start and end date.')
  if (!input.recurringYearly && endDate < input.startDate) throw new Error('The end date must not be before the start date.')
  const title = input.title.trim()
  if (!title) throw new Error('Known dates need a name.')
  return {
    id: crypto.randomUUID(),
    libraryId: input.libraryId,
    title,
    kind: input.kind,
    source: 'manual',
    scope: input.scope ?? 'library',
    startDate: input.startDate,
    endDate,
    recurringYearly: Boolean(input.recurringYearly),
    createdAt: now,
    updatedAt: now
  }
}

export function holidayKnownDate(input: {
  libraryId: string
  countryCode: string
  date: string
  title: string
  scope?: LiteKnownDateScope
  now?: number
}): LiteKnownDateRecord {
  const countryCode = input.countryCode.trim().toUpperCase()
  const title = input.title.trim()
  const now = input.now ?? Date.now()
  return {
    id: `holiday:${stableHash(`${countryCode}|${input.date}|${title}`)}`,
    libraryId: input.libraryId,
    title,
    kind: 'holiday',
    source: 'holiday-api',
    scope: input.scope ?? 'library',
    startDate: input.date,
    endDate: input.date,
    recurringYearly: false,
    countryCode,
    createdAt: now,
    updatedAt: now
  }
}

export function mergeKnownDates(existing: LiteKnownDateRecord[], incoming: LiteKnownDateRecord[]): LiteKnownDateRecord[] {
  const output = [...existing]
  for (const record of incoming) {
    const index = output.findIndex((candidate) => candidate.id === record.id || sameImportedHoliday(candidate, record))
    if (index >= 0) output[index] = record
    else output.push(record)
  }
  return output.sort(compareKnownDates)
}

export function knownDateScope(record: LiteKnownDateRecord): LiteKnownDateScope {
  return record.scope === 'global' ? 'global' : 'library'
}

export function compareKnownDates(left: LiteKnownDateRecord, right: LiteKnownDateRecord): number {
  return left.startDate.localeCompare(right.startDate)
    || left.title.localeCompare(right.title, undefined, { numeric: true, sensitivity: 'base' })
}

export function knownDateKindLabel(kind: LiteKnownDateKind): string {
  if (kind === 'birthday') return 'Birthday'
  if (kind === 'vacation') return 'Vacation'
  if (kind === 'holiday') return 'Public holiday'
  return 'Custom'
}

function sameImportedHoliday(left: LiteKnownDateRecord, right: LiteKnownDateRecord): boolean {
  if (left.source !== 'holiday-api' || right.source !== 'holiday-api') return false
  return left.countryCode === right.countryCode
    && left.startDate === right.startDate
    && left.title.trim().toLocaleLowerCase() === right.title.trim().toLocaleLowerCase()
}

function knownDatePriority(record: LiteKnownDateRecord): number {
  const source = record.source === 'manual' ? 100 : 0
  const kind = record.kind === 'vacation' ? 40 : record.kind === 'custom' ? 30 : record.kind === 'birthday' ? 20 : 10
  return source + kind
}

function parseLocalDate(value: string): Date | null {
  const parts = dateParts(value)
  if (!parts) return null
  const date = new Date(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0)
  if (date.getFullYear() !== parts.year || date.getMonth() !== parts.month - 1 || date.getDate() !== parts.day) return null
  return date
}

function endOfLocalDate(value: string): Date | null {
  const date = parseLocalDate(value)
  if (!date) return null
  date.setHours(23, 59, 59, 999)
  return date
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

function compareMonthDay(left: { month: number; day: number }, right: { month: number; day: number }): number {
  return left.month - right.month || left.day - right.day
}

function formatLocalDate(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function stableHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}
