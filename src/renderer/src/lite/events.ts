import { matchingKnownDate, type LiteKnownDateOccurrence } from './knownDates'
import { sourceFolderName, sourceFolderOf } from './sourcePaths'
import type { LiteEventRecord, LiteEventSignificance, LiteKnownDateRecord, LiteMediaRecord, LiteSimilarityGroup } from './types'

const QUICK_GAP_MS = 90 * 60 * 1000
const SUPPORTED_GAP_MS = 8 * 60 * 60 * 1000
const HARD_GAP_MS = 18 * 60 * 60 * 1000
const LOCATION_ONLY_MULTIDAY_GAP_MS = 48 * 60 * 60 * 1000
const SUPPORTED_MULTIDAY_GAP_MS = 7 * 24 * 60 * 60 * 1000
const MAX_MULTIDAY_EVENT_SPAN_MS = 21 * 24 * 60 * 60 * 1000
const CONCENTRATED_SESSION_MIN_PHOTOS = 20
const CONCENTRATED_SESSION_MAX_SPAN_MS = 6 * 60 * 60 * 1000
const NEARBY_KM = 25
const MULTIDAY_NEARBY_KM = 35
const ROUTINE_CELL_DEGREES = 0.08

interface EventAccumulator {
  items: LiteMediaRecord[]
  evidence: Set<string>
  personIds: Set<string>
  similarityGroupIds: Set<string>
}

interface RoutineLocationStats {
  days: Set<string>
  months: Set<string>
  minimumTime: number
  maximumTime: number
}

interface EventCache {
  items: LiteMediaRecord[]
  byId: Map<string, LiteMediaRecord>
  groupsKey: string
  knownDatesKey: string
  events: LiteEventRecord[]
}

let eventCache: EventCache | null = null

export function buildEvents(
  items: LiteMediaRecord[],
  similarityGroups: LiteSimilarityGroup[] = [],
  knownDates: LiteKnownDateRecord[] = []
): LiteEventRecord[] {
  const photos = items.filter((item) => item.kind === 'image')
  if (photos.length === 0) return []

  const knownDatesKey = fingerprintKnownDates(knownDates)
  const cache = eventCache
  if (cache && cache.knownDatesKey === knownDatesKey) {
    if (photos.length === cache.items.length && sameEventDataset(photos, cache)) {
      const groupsKey = fingerprintSimilarityGroups(similarityGroups)
      if (groupsKey === cache.groupsKey) {
        refreshCacheReferences(cache, photos)
        return cache.events
      }
    } else if (photos.length < cache.items.length && isIdentitySubset(photos, cache)) {
      return projectCachedEvents(cache.events, photos)
    }
  }

  const events = buildEventsCore(photos, similarityGroups, knownDates)
  eventCache = {
    items: photos,
    byId: new Map(photos.map((item) => [item.id, item])),
    groupsKey: fingerprintSimilarityGroups(similarityGroups),
    knownDatesKey,
    events
  }
  return events
}

function sameEventDataset(items: LiteMediaRecord[], cache: EventCache): boolean {
  for (const item of items) {
    const previous = cache.byId.get(item.id)
    if (!previous || !sameEventInput(previous, item)) return false
  }
  return true
}

function isIdentitySubset(items: LiteMediaRecord[], cache: EventCache): boolean {
  for (const item of items) if (cache.byId.get(item.id) !== item) return false
  return true
}

function refreshCacheReferences(cache: EventCache, items: LiteMediaRecord[]): void {
  for (const item of items) if (cache.byId.get(item.id) !== item) cache.byId.set(item.id, item)
  cache.items = items
}

function sameEventInput(left: LiteMediaRecord, right: LiteMediaRecord): boolean {
  return left.id === right.id
    && left.kind === right.kind
    && left.relativePath === right.relativePath
    && left.effectiveCaptureTime === right.effectiveCaptureTime
    && left.lastModified === right.lastModified
    && left.captureTimeSource === right.captureTimeSource
    && left.latitude === right.latitude
    && left.longitude === right.longitude
    && left.similarityStatus === right.similarityStatus
    && left.contentHash === right.contentHash
    && left.perceptualHash === right.perceptualHash
    && samePersonAssignments(left.faces, right.faces)
}

function samePersonAssignments(left: LiteMediaRecord['faces'], right: LiteMediaRecord['faces']): boolean {
  if (left === right) return true
  if ((left?.length ?? 0) !== (right?.length ?? 0)) return false
  for (let index = 0; index < (left?.length ?? 0); index += 1) {
    if (left?.[index]?.personId !== right?.[index]?.personId) return false
  }
  return true
}

function projectCachedEvents(events: LiteEventRecord[], items: LiteMediaRecord[]): LiteEventRecord[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  const projected: LiteEventRecord[] = []
  for (const event of events) {
    const members = event.itemIds.map((id) => byId.get(id)).filter(isMediaRecord)
    if (members.length === 0) continue
    if (members.length === event.itemIds.length) {
      projected.push(event)
      continue
    }

    const startTime = Math.min(...members.map(captureTimeOf))
    const endTime = Math.max(...members.map(captureTimeOf))
    const personIds = [...new Set(members.flatMap((item) => (item.faces ?? []).map((face) => face.personId).filter(isString)))].sort()
    const folderPaths = [...new Set(members.map((item) => sourceFolderOf(item.relativePath)))].sort()
    const location = averageLocation(members)
    const { latitude: _latitude, longitude: _longitude, ...base } = event
    projected.push({
      ...base,
      startTime,
      endTime,
      itemIds: members.map((item) => item.id),
      personIds,
      folderPaths,
      ...(location ?? {})
    })
  }
  return projected
}

function buildEventsCore(
  items: LiteMediaRecord[],
  similarityGroups: LiteSimilarityGroup[],
  knownDates: LiteKnownDateRecord[]
): LiteEventRecord[] {
  const photos = [...items].sort((a, b) => captureTimeOf(a) - captureTimeOf(b) || a.relativePath.localeCompare(b.relativePath))
  if (photos.length === 0) return []

  const similarityByItem = similarityMembership(similarityGroups)
  const routineLocations = findRoutineLocationCells(photos)
  const knownDateByDay = new Map<string, LiteKnownDateOccurrence | null>()
  const knownDateByItem = new Map<string, LiteKnownDateOccurrence | null>()
  for (const photo of photos) {
    const time = captureTimeOf(photo)
    const key = localDayKey(time)
    let occurrence = knownDateByDay.get(key)
    if (occurrence === undefined && !knownDateByDay.has(key)) {
      occurrence = matchingKnownDate(knownDates, time)
      knownDateByDay.set(key, occurrence)
    }
    knownDateByItem.set(photo.id, occurrence ?? null)
  }

  const accumulators: EventAccumulator[] = [createAccumulator(photos[0], similarityByItem)]

  for (let index = 1; index < photos.length; index += 1) {
    const next = photos[index]
    const current = accumulators.at(-1)!
    const previous = current.items.at(-1)!
    const decision = shouldContinueEvent(
      current,
      previous,
      next,
      similarityByItem,
      routineLocations,
      knownDateByItem.get(previous.id) ?? null,
      knownDateByItem.get(next.id) ?? null
    )
    if (decision.continueEvent) {
      appendAccumulator(current, next, similarityByItem)
      for (const evidence of decision.evidence) current.evidence.add(evidence)
    } else {
      accumulators.push(createAccumulator(next, similarityByItem, 'time gap'))
    }
  }

  return accumulators.map((accumulator) => finalizeEvent(accumulator.items, accumulator.evidence, routineLocations, knownDateByItem))
}

function createAccumulator(item: LiteMediaRecord, membership: Map<string, Set<string>>, evidence = 'event start'): EventAccumulator {
  return {
    items: [item],
    evidence: new Set([evidence]),
    personIds: personIdsOf(item),
    similarityGroupIds: new Set(membership.get(item.id) ?? [])
  }
}

function appendAccumulator(accumulator: EventAccumulator, item: LiteMediaRecord, membership: Map<string, Set<string>>): void {
  accumulator.items.push(item)
  for (const personId of personIdsOf(item)) accumulator.personIds.add(personId)
  for (const groupId of membership.get(item.id) ?? []) accumulator.similarityGroupIds.add(groupId)
}

function shouldContinueEvent(
  current: EventAccumulator,
  previous: LiteMediaRecord,
  next: LiteMediaRecord,
  similarityByItem: Map<string, Set<string>>,
  routineLocations: Set<string>,
  previousKnownDate: LiteKnownDateOccurrence | null,
  nextKnownDate: LiteKnownDateOccurrence | null
): { continueEvent: boolean; evidence: string[] } {
  if (previousKnownDate || nextKnownDate) {
    if (previousKnownDate?.key === nextKnownDate?.key && previousKnownDate) {
      return { continueEvent: true, evidence: [`known date: ${previousKnownDate.record.title}`] }
    }
    return { continueEvent: false, evidence: [] }
  }

  const gap = Math.max(0, captureTimeOf(next) - captureTimeOf(previous))
  const eventSpan = Math.max(0, captureTimeOf(next) - captureTimeOf(current.items[0]))
  const sameFolder = sourceFolderOf(previous.relativePath) === sourceFolderOf(next.relativePath)
  const sharedPeople = sharesKnownPerson(current.personIds, next)
  const sharedVisualGroup = sharesSimilarityGroup(current.similarityGroupIds, next, similarityByItem)
  const supportedLongGap = gap <= LOCATION_ONLY_MULTIDAY_GAP_MS || sameFolder || sharedPeople || sharedVisualGroup

  if (
    gap > HARD_GAP_MS
    && gap <= SUPPORTED_MULTIDAY_GAP_MS
    && eventSpan <= MAX_MULTIDAY_EVENT_SPAN_MS
    && supportedLongGap
    && isNearEventLocation(current.items, next, MULTIDAY_NEARBY_KM)
    && !isRoutineLocation(next, routineLocations)
  ) {
    const evidence = ['same away location across days']
    if (sameFolder) evidence.push('same source folder')
    if (sharedPeople) evidence.push('shared people')
    if (sharedVisualGroup) evidence.push('related visual group')
    return { continueEvent: true, evidence }
  }

  if (gap > HARD_GAP_MS) return { continueEvent: false, evidence: [] }

  const evidence: string[] = []
  if (gap <= QUICK_GAP_MS) evidence.push('close in time')
  if (sameFolder) evidence.push('same source folder')
  if (hasNearbyLocation(current.items, next)) evidence.push('nearby GPS')
  if (sharedPeople) evidence.push('shared people')
  if (sharedVisualGroup) evidence.push('related visual group')

  if (gap <= QUICK_GAP_MS) return { continueEvent: true, evidence }
  const contextualEvidence = evidence.filter((value) => value !== 'close in time').length
  if (gap <= SUPPORTED_GAP_MS && contextualEvidence >= 1) return { continueEvent: true, evidence }
  if (gap <= HARD_GAP_MS && contextualEvidence >= 2) return { continueEvent: true, evidence }
  return { continueEvent: false, evidence: [] }
}

function finalizeEvent(
  items: LiteMediaRecord[],
  evidence: Set<string>,
  routineLocations: Set<string>,
  knownDateByItem: Map<string, LiteKnownDateOccurrence | null>
): LiteEventRecord {
  const startTime = captureTimeOf(items[0])
  const endTime = captureTimeOf(items.at(-1)!)
  const personIds = [...new Set(items.flatMap((item) => (item.faces ?? []).map((face) => face.personId).filter(isString)))].sort()
  const folderPaths = [...new Set(items.map((item) => sourceFolderOf(item.relativePath)))].sort()
  const location = averageLocation(items)
  const knownDate = knownDateByItem.get(items[0].id) ?? null
  const significance = classifySignificance(items, evidence, routineLocations, knownDate)
  return {
    id: `event-${stableHash(items.map((item) => item.id).join('|'))}`,
    libraryId: items[0].libraryId,
    title: knownDate?.record.title ?? generatedEventTitle(startTime, endTime, folderPaths, items),
    startTime,
    endTime,
    itemIds: items.map((item) => item.id),
    personIds,
    folderPaths,
    ...(location ? location : {}),
    evidence: [...evidence].filter((value) => value !== 'event start').sort(),
    significance,
    ...(knownDate ? { knownDateId: knownDate.record.id, knownDateTitle: knownDate.record.title } : {})
  }
}

function classifySignificance(
  items: LiteMediaRecord[],
  evidence: Set<string>,
  routineLocations: Set<string>,
  knownDate: LiteKnownDateOccurrence | null
): LiteEventSignificance {
  if (knownDate) return 'known-date'
  if (evidence.has('same away location across days')) return 'away'
  const nonRoutineLocated = items.some((item) => hasCoordinates(item) && !isRoutineLocation(item, routineLocations))
  if (nonRoutineLocated && items.length >= 3) return 'moment'
  if ((evidence.has('shared people') || evidence.has('related visual group')) && items.length >= 4) return 'moment'
  if (isConcentratedPhotoSession(items)) return 'moment'
  return 'everyday'
}

function isConcentratedPhotoSession(items: LiteMediaRecord[]): boolean {
  if (items.length < CONCENTRATED_SESSION_MIN_PHOTOS) return false
  const span = Math.max(0, captureTimeOf(items.at(-1)!) - captureTimeOf(items[0]))
  return span <= CONCENTRATED_SESSION_MAX_SPAN_MS
}

export function isMeaningfulEvent(event: LiteEventRecord): boolean {
  return Boolean(event.customTitle) || (event.significance ?? 'moment') !== 'everyday'
}

export function generatedEventTitle(startTime: number, endTime: number, folders: string[], items: LiteMediaRecord[]): string {
  const start = new Date(startTime)
  const end = new Date(endTime)
  const sameDay = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth() && start.getDate() === end.getDate()
  const date = sameDay
    ? start.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
    : `${start.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })} – ${end.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}`
  const dominant = dominantFolder(items)
  return dominant || folders.length === 1 ? `${date} · ${sourceFolderName(dominant ?? folders[0])}` : date
}

export function captureTimeOf(item: Pick<LiteMediaRecord, 'effectiveCaptureTime' | 'lastModified'>): number {
  return typeof item.effectiveCaptureTime === 'number' ? item.effectiveCaptureTime : item.lastModified
}

function dominantFolder(items: LiteMediaRecord[]): string | undefined {
  const counts = new Map<string, number>()
  for (const item of items) {
    const folder = sourceFolderOf(item.relativePath)
    counts.set(folder, (counts.get(folder) ?? 0) + 1)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  if (!sorted[0] || sorted[0][1] < Math.max(2, Math.ceil(items.length * 0.6))) return undefined
  return sorted[0][0]
}

function hasNearbyLocation(currentItems: LiteMediaRecord[], next: LiteMediaRecord): boolean {
  if (!hasCoordinates(next)) return false
  return currentItems.some((item) => hasCoordinates(item) && haversineKm(item.latitude, item.longitude, next.latitude, next.longitude) <= NEARBY_KM)
}

function isNearEventLocation(currentItems: LiteMediaRecord[], next: LiteMediaRecord, maximumKm: number): boolean {
  if (!hasCoordinates(next)) return false
  const located = currentItems.filter(hasCoordinates)
  if (located.length === 0) return false
  const recent = located.slice(-Math.min(20, located.length))
  const latitude = recent.reduce((sum, item) => sum + item.latitude, 0) / recent.length
  const longitude = recent.reduce((sum, item) => sum + item.longitude, 0) / recent.length
  return haversineKm(latitude, longitude, next.latitude, next.longitude) <= maximumKm
}

function personIdsOf(item: LiteMediaRecord): Set<string> {
  return new Set((item.faces ?? []).map((face) => face.personId).filter(isString))
}

function sharesKnownPerson(currentPersonIds: Set<string>, next: LiteMediaRecord): boolean {
  if (currentPersonIds.size === 0) return false
  return (next.faces ?? []).some((face) => Boolean(face.personId && currentPersonIds.has(face.personId)))
}

function sharesSimilarityGroup(currentGroupIds: Set<string>, next: LiteMediaRecord, membership: Map<string, Set<string>>): boolean {
  if (currentGroupIds.size === 0) return false
  const nextGroups = membership.get(next.id)
  if (!nextGroups?.size) return false
  for (const groupId of nextGroups) if (currentGroupIds.has(groupId)) return true
  return false
}

function similarityMembership(groups: LiteSimilarityGroup[]): Map<string, Set<string>> {
  const membership = new Map<string, Set<string>>()
  for (const group of groups) {
    for (const itemId of group.itemIds) {
      const set = membership.get(itemId) ?? new Set<string>()
      set.add(group.id)
      membership.set(itemId, set)
    }
  }
  return membership
}

function findRoutineLocationCells(items: LiteMediaRecord[]): Set<string> {
  const stats = new Map<string, RoutineLocationStats>()
  for (const item of items) {
    if (!hasCoordinates(item)) continue
    const time = captureTimeOf(item)
    const date = new Date(time)
    const cell = locationCell(item.latitude, item.longitude)
    const current = stats.get(cell) ?? { days: new Set<string>(), months: new Set<string>(), minimumTime: time, maximumTime: time }
    current.days.add(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`)
    current.months.add(`${date.getFullYear()}-${date.getMonth()}`)
    current.minimumTime = Math.min(current.minimumTime, time)
    current.maximumTime = Math.max(current.maximumTime, time)
    stats.set(cell, current)
  }

  const routine = new Set<string>()
  for (const [cell, value] of stats) {
    const span = value.maximumTime - value.minimumTime
    if ((value.days.size >= 12 && value.months.size >= 3 && span >= 90 * 24 * 60 * 60 * 1000) || value.days.size >= 30) routine.add(cell)
  }
  return routine
}

function isRoutineLocation(item: LiteMediaRecord, routineLocations: Set<string>): boolean {
  return hasCoordinates(item) && routineLocations.has(locationCell(item.latitude, item.longitude))
}

function locationCell(latitude: number, longitude: number): string {
  return `${Math.round(latitude / ROUTINE_CELL_DEGREES)}:${Math.round(longitude / ROUTINE_CELL_DEGREES)}`
}

function averageLocation(items: LiteMediaRecord[]): { latitude: number; longitude: number } | undefined {
  const located = items.filter(hasCoordinates)
  if (located.length === 0) return undefined
  return {
    latitude: located.reduce((sum, item) => sum + item.latitude, 0) / located.length,
    longitude: located.reduce((sum, item) => sum + item.longitude, 0) / located.length
  }
}

function hasCoordinates(item: LiteMediaRecord): item is LiteMediaRecord & { latitude: number; longitude: number } {
  return typeof item.latitude === 'number' && typeof item.longitude === 'number' && Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
}

function haversineKm(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number): number {
  const toRadians = (value: number): number => value * Math.PI / 180
  const radius = 6371
  const deltaLatitude = toRadians(latitudeB - latitudeA)
  const deltaLongitude = toRadians(longitudeB - longitudeA)
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(toRadians(latitudeA)) * Math.cos(toRadians(latitudeB)) * Math.sin(deltaLongitude / 2) ** 2
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function fingerprintKnownDates(records: LiteKnownDateRecord[]): string {
  return records.map((record) => `${record.id}:${record.title}:${record.kind}:${record.source}:${record.updatedAt}:${record.startDate}:${record.endDate}:${record.recurringYearly ? 1 : 0}`).join('|')
}

function fingerprintSimilarityGroups(groups: LiteSimilarityGroup[]): string {
  return groups.map((group) => `${group.id}:${group.itemIds.join(',')}`).join('|')
}

function localDayKey(time: number): string {
  const date = new Date(time)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function stableHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function isString(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0
}

function isMediaRecord(value: LiteMediaRecord | undefined): value is LiteMediaRecord {
  return Boolean(value)
}
