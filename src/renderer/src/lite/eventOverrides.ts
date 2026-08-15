import type { LiteEventOverride, LiteEventRecord, LiteMediaRecord } from './types'

type StoredEventOverride = LiteEventOverride & { knownDate?: boolean; manual?: boolean }
type KnownEventRecord = LiteEventRecord & { promotedToKnown?: boolean }
type ManualEventRecord = LiteEventRecord & { manual?: boolean }

export function eventOverrideId(libraryId: string, eventId: string): string {
  return `${libraryId}::${eventId}`
}

export function createEventOverride(event: LiteEventRecord, title: string, now = Date.now(), prior?: LiteEventOverride): LiteEventOverride | null {
  const normalized = title.trim()
  const manual = manualOf(prior) || isManualEvent(event)
  const storedTitle = manual && !normalized ? event.title.trim() : normalized
  const structuralOverride = Boolean(prior?.hidden || prior?.includedItemIds !== undefined || knownDateOf(prior) || promotedToKnown(event) || manual)
  if (!storedTitle && !structuralOverride) return null
  return {
    id: eventOverrideId(event.libraryId, event.id),
    eventId: event.id,
    libraryId: event.libraryId,
    title: storedTitle,
    itemIds: [...(prior?.itemIds ?? event.itemIds)],
    ...(prior?.hidden ? { hidden: true } : {}),
    ...(prior?.includedItemIds !== undefined ? { includedItemIds: [...prior.includedItemIds] } : {}),
    ...(knownDateOf(prior) || promotedToKnown(event) || manual ? { knownDate: true } : {}),
    ...(manual ? { manual: true } : {}),
    updatedAt: now
  } as StoredEventOverride
}

export function createManualEventOverride(
  libraryId: string,
  items: LiteMediaRecord[],
  title: string,
  now = Date.now()
): LiteEventOverride | null {
  const normalized = title.trim()
  const itemIds = [...new Set(items.filter((item) => item.kind === 'image').map((item) => item.id))]
  if (!normalized || itemIds.length === 0) return null
  const eventId = `manual-event-${now.toString(36)}-${stableHash(`${normalized}|${itemIds.join('|')}`)}`
  return {
    id: eventOverrideId(libraryId, eventId),
    eventId,
    libraryId,
    title: normalized,
    itemIds,
    includedItemIds: [...itemIds],
    knownDate: true,
    manual: true,
    updatedAt: now
  } as StoredEventOverride
}

export function createEventRemovalOverride(event: LiteEventRecord, prior?: LiteEventOverride, now = Date.now()): LiteEventOverride {
  const manual = manualOf(prior) || isManualEvent(event)
  return {
    id: eventOverrideId(event.libraryId, event.id),
    eventId: event.id,
    libraryId: event.libraryId,
    title: prior?.title ?? event.customTitle ?? event.title ?? '',
    itemIds: [...(prior?.itemIds ?? event.itemIds)],
    hidden: true,
    ...(prior?.includedItemIds !== undefined ? { includedItemIds: [...prior.includedItemIds] } : {}),
    ...(knownDateOf(prior) || promotedToKnown(event) || manual ? { knownDate: true } : {}),
    ...(manual ? { manual: true } : {}),
    updatedAt: now
  } as StoredEventOverride
}

export function createEventPhotoRemovalOverride(event: LiteEventRecord, removedItemIds: string[], prior?: LiteEventOverride, now = Date.now()): LiteEventOverride {
  const removed = new Set(removedItemIds)
  const currentMembership = prior?.includedItemIds ?? event.itemIds
  const remaining = currentMembership.filter((id) => event.itemIds.includes(id) && !removed.has(id))
  const manual = manualOf(prior) || isManualEvent(event)
  return {
    id: eventOverrideId(event.libraryId, event.id),
    eventId: event.id,
    libraryId: event.libraryId,
    title: prior?.title ?? event.customTitle ?? event.title ?? '',
    itemIds: [...(prior?.itemIds ?? event.itemIds)],
    ...(remaining.length === 0 ? { hidden: true } : {}),
    includedItemIds: remaining,
    ...(knownDateOf(prior) || promotedToKnown(event) || manual ? { knownDate: true } : {}),
    ...(manual ? { manual: true } : {}),
    updatedAt: now
  } as StoredEventOverride
}

export function createEventKnownDateOverride(event: LiteEventRecord, prior?: LiteEventOverride, now = Date.now()): LiteEventOverride {
  const manual = manualOf(prior) || isManualEvent(event)
  return {
    id: eventOverrideId(event.libraryId, event.id),
    eventId: event.id,
    libraryId: event.libraryId,
    title: prior?.title ?? event.customTitle ?? (manual ? event.title : ''),
    itemIds: [...(prior?.itemIds ?? event.itemIds)],
    ...(prior?.hidden ? { hidden: true } : {}),
    ...(prior?.includedItemIds !== undefined ? { includedItemIds: [...prior.includedItemIds] } : {}),
    knownDate: true,
    ...(manual ? { manual: true } : {}),
    updatedAt: now
  } as StoredEventOverride
}

export function matchingEventOverride(event: LiteEventRecord, overrides: LiteEventOverride[]): LiteEventOverride | undefined {
  const candidates = [...overrides]
    .filter((override) => override.libraryId === event.libraryId)
    .sort((a, b) => b.updatedAt - a.updatedAt)
  return candidates.find((override) => override.eventId === event.id)
    ?? bestOverlap(event, candidates.filter((override) => !manualOf(override)))
}

export function isKnownDateOverride(override: LiteEventOverride): boolean {
  return knownDateOf(override)
}

export function isManualEvent(event: LiteEventRecord): boolean {
  return Boolean((event as ManualEventRecord).manual)
}

export function isKnownDateEvent(event: LiteEventRecord): boolean {
  return Boolean(isManualEvent(event) || promotedToKnown(event) || event.knownDateId || event.knownDateTitle || event.significance === 'known-date')
}

export function applyKnownDateOverrides(events: LiteEventRecord[], overrides: LiteEventOverride[]): LiteEventRecord[] {
  if (overrides.length === 0) return events
  const knownOverrides = overrides.filter(isKnownDateOverride)
  if (knownOverrides.length === 0) return events
  return events.map((event) => matchingEventOverride(event, knownOverrides) ? markKnown(event) : event)
}

export function applyEventOverrides(events: LiteEventRecord[], overrides: LiteEventOverride[], items: LiteMediaRecord[] = []): LiteEventRecord[] {
  if (overrides.length === 0) return events
  const candidates = [...overrides].sort((a, b) => b.updatedAt - a.updatedAt)
  const manualCandidates = candidates.filter(manualOf)
  const derivedCandidates = candidates.filter((override) => !manualOf(override))
  const used = new Set<string>()
  const itemById = new Map(items.map((item) => [item.id, item]))
  const output: LiteEventRecord[] = []

  for (const event of events) {
    const exact = derivedCandidates.find((override) => !used.has(override.id) && override.libraryId === event.libraryId && override.eventId === event.id)
    const matched = exact ?? bestOverlap(event, derivedCandidates.filter((override) => !used.has(override.id) && override.libraryId === event.libraryId))
    if (!matched) {
      output.push(event)
      continue
    }
    used.add(matched.id)
    if (matched.hidden) continue

    const projected = matched.includedItemIds !== undefined
      ? projectEventMembership(event, matched.includedItemIds, itemById)
      : event
    if (!projected) continue

    const title = matched.title.trim()
    let applied: LiteEventRecord = title ? { ...projected, title, customTitle: title } : projected
    if (knownDateOf(matched) || promotedToKnown(event)) applied = markKnown(applied)
    output.push(applied)
  }

  // Manual events are independent of the automatic event clustering. Append oldest first
  // so a newer overlapping manual event wins deterministic export-name resolution.
  for (const override of [...manualCandidates].reverse()) {
    if (override.hidden) continue
    const manualEvent = manualEventFromOverride(override, itemById)
    if (manualEvent) output.push(manualEvent)
  }

  return output
}

function manualEventFromOverride(override: LiteEventOverride, itemById: Map<string, LiteMediaRecord>): LiteEventRecord | null {
  const memberIds = override.includedItemIds ?? override.itemIds
  const members = memberIds.map((id) => itemById.get(id)).filter(isMediaRecord)
  if (members.length === 0) return null
  const times = members.map(captureTimeOf)
  const personIds = [...new Set(members.flatMap((item) => (item.faces ?? []).map((face) => face.personId).filter(isString)))].sort()
  const folderPaths = [...new Set(members.map((item) => sourceFolderOf(item.relativePath)))].sort()
  const located = members.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
  const latitude = located.length > 0 ? located.reduce((sum, item) => sum + (item.latitude ?? 0), 0) / located.length : undefined
  const longitude = located.length > 0 ? located.reduce((sum, item) => sum + (item.longitude ?? 0), 0) / located.length : undefined
  const title = override.title.trim() || 'Manual event'

  return {
    id: override.eventId,
    libraryId: override.libraryId,
    title,
    customTitle: title,
    startTime: Math.min(...times),
    endTime: Math.max(...times),
    itemIds: members.map((item) => item.id),
    personIds,
    folderPaths,
    latitude,
    longitude,
    evidence: ['created from visible map area'],
    significance: 'known-date',
    manual: true
  } as ManualEventRecord
}

function markKnown(event: LiteEventRecord): LiteEventRecord {
  return { ...event, promotedToKnown: true } as KnownEventRecord
}

function promotedToKnown(event: LiteEventRecord): boolean {
  return Boolean((event as KnownEventRecord).promotedToKnown)
}

function knownDateOf(override: LiteEventOverride | undefined): boolean {
  return Boolean((override as StoredEventOverride | undefined)?.knownDate)
}

function manualOf(override: LiteEventOverride | undefined): boolean {
  return Boolean((override as StoredEventOverride | undefined)?.manual)
}

function projectEventMembership(event: LiteEventRecord, includedItemIds: string[], itemById: Map<string, LiteMediaRecord>): LiteEventRecord | null {
  const included = new Set(includedItemIds)
  const itemIds = event.itemIds.filter((id) => included.has(id))
  if (itemIds.length === 0) return null
  if (itemById.size === 0) return { ...event, itemIds }

  const members = itemIds.map((id) => itemById.get(id)).filter(isMediaRecord)
  if (members.length === 0) return null
  const times = members.map(captureTimeOf)
  const personIds = [...new Set(members.flatMap((item) => (item.faces ?? []).map((face) => face.personId).filter(isString)))].sort()
  const folderPaths = [...new Set(members.map((item) => sourceFolderOf(item.relativePath)))].sort()
  const located = members.filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
  const latitude = located.length > 0 ? located.reduce((sum, item) => sum + (item.latitude ?? 0), 0) / located.length : undefined
  const longitude = located.length > 0 ? located.reduce((sum, item) => sum + (item.longitude ?? 0), 0) / located.length : undefined

  return {
    ...event,
    startTime: Math.min(...times),
    endTime: Math.max(...times),
    itemIds,
    personIds,
    folderPaths,
    latitude,
    longitude
  }
}

function captureTimeOf(item: LiteMediaRecord): number {
  return typeof item.effectiveCaptureTime === 'number' && Number.isFinite(item.effectiveCaptureTime)
    ? item.effectiveCaptureTime
    : item.lastModified
}

function sourceFolderOf(relativePath: string): string {
  const normalized = relativePath.replaceAll('\\', '/')
  const separator = normalized.lastIndexOf('/')
  return separator >= 0 ? normalized.slice(0, separator) : ''
}

function isString(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0
}

function isMediaRecord(item: LiteMediaRecord | undefined): item is LiteMediaRecord {
  return Boolean(item)
}

function bestOverlap(event: LiteEventRecord, overrides: LiteEventOverride[]): LiteEventOverride | undefined {
  const eventIds = new Set(event.itemIds)
  let best: LiteEventOverride | undefined
  let bestScore = 0
  for (const override of overrides) {
    if (manualOf(override)) continue
    const intersection = override.itemIds.reduce((count, id) => count + (eventIds.has(id) ? 1 : 0), 0)
    if (intersection === 0) continue
    const score = intersection / Math.max(1, Math.min(event.itemIds.length, override.itemIds.length))
    if (score >= 0.6 && score > bestScore) {
      best = override
      bestScore = score
    }
  }
  return best
}

function stableHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}
