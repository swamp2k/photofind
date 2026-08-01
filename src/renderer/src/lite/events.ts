import { sourceFolderName, sourceFolderOf } from './sourcePaths'
import type { LiteEventRecord, LiteMediaRecord, LiteSimilarityGroup } from './types'

const QUICK_GAP_MS = 90 * 60 * 1000
const SUPPORTED_GAP_MS = 8 * 60 * 60 * 1000
const HARD_GAP_MS = 18 * 60 * 60 * 1000
const NEARBY_KM = 25

interface EventAccumulator {
  items: LiteMediaRecord[]
  evidence: Set<string>
}

export function buildEvents(items: LiteMediaRecord[], similarityGroups: LiteSimilarityGroup[] = []): LiteEventRecord[] {
  const photos = items
    .filter((item) => item.kind === 'image')
    .sort((a, b) => captureTimeOf(a) - captureTimeOf(b) || a.relativePath.localeCompare(b.relativePath))
  if (photos.length === 0) return []

  const similarityByItem = similarityMembership(similarityGroups)
  const accumulators: EventAccumulator[] = [{ items: [photos[0]], evidence: new Set(['event start']) }]

  for (let index = 1; index < photos.length; index += 1) {
    const next = photos[index]
    const current = accumulators.at(-1)!
    const previous = current.items.at(-1)!
    const decision = shouldContinueEvent(current.items, previous, next, similarityByItem)
    if (decision.continueEvent) {
      current.items.push(next)
      for (const evidence of decision.evidence) current.evidence.add(evidence)
    } else {
      accumulators.push({ items: [next], evidence: new Set(['time gap']) })
    }
  }

  return accumulators.map((accumulator) => finalizeEvent(accumulator.items, accumulator.evidence))
}

function shouldContinueEvent(
  currentItems: LiteMediaRecord[],
  previous: LiteMediaRecord,
  next: LiteMediaRecord,
  similarityByItem: Map<string, Set<string>>
): { continueEvent: boolean; evidence: string[] } {
  const gap = Math.max(0, captureTimeOf(next) - captureTimeOf(previous))
  if (gap > HARD_GAP_MS) return { continueEvent: false, evidence: [] }

  const evidence: string[] = []
  if (gap <= QUICK_GAP_MS) evidence.push('close in time')
  if (sourceFolderOf(previous.relativePath) === sourceFolderOf(next.relativePath)) evidence.push('same source folder')
  if (hasNearbyLocation(currentItems, next)) evidence.push('nearby GPS')
  if (sharesKnownPerson(currentItems, next)) evidence.push('shared people')
  if (sharesSimilarityGroup(currentItems, next, similarityByItem)) evidence.push('related visual group')

  if (gap <= QUICK_GAP_MS) return { continueEvent: true, evidence }
  const contextualEvidence = evidence.filter((value) => value !== 'close in time').length
  if (gap <= SUPPORTED_GAP_MS && contextualEvidence >= 1) return { continueEvent: true, evidence }
  if (gap <= HARD_GAP_MS && contextualEvidence >= 2) return { continueEvent: true, evidence }
  return { continueEvent: false, evidence: [] }
}

function finalizeEvent(items: LiteMediaRecord[], evidence: Set<string>): LiteEventRecord {
  const startTime = captureTimeOf(items[0])
  const endTime = captureTimeOf(items.at(-1)!)
  const personIds = [...new Set(items.flatMap((item) => (item.faces ?? []).map((face) => face.personId).filter(isString)))].sort()
  const folderPaths = [...new Set(items.map((item) => sourceFolderOf(item.relativePath)))].sort()
  const location = averageLocation(items)
  return {
    id: `event-${stableHash(items.map((item) => item.id).join('|'))}`,
    libraryId: items[0].libraryId,
    title: generatedEventTitle(startTime, endTime, folderPaths, items),
    startTime,
    endTime,
    itemIds: items.map((item) => item.id),
    personIds,
    folderPaths,
    ...(location ? location : {}),
    evidence: [...evidence].filter((value) => value !== 'event start').sort()
  }
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

function sharesKnownPerson(currentItems: LiteMediaRecord[], next: LiteMediaRecord): boolean {
  const nextPeople = new Set((next.faces ?? []).map((face) => face.personId).filter(isString))
  if (nextPeople.size === 0) return false
  return currentItems.some((item) => (item.faces ?? []).some((face) => face.personId && nextPeople.has(face.personId)))
}

function sharesSimilarityGroup(currentItems: LiteMediaRecord[], next: LiteMediaRecord, membership: Map<string, Set<string>>): boolean {
  const nextGroups = membership.get(next.id)
  if (!nextGroups?.size) return false
  return currentItems.some((item) => {
    const groups = membership.get(item.id)
    return groups ? [...groups].some((groupId) => nextGroups.has(groupId)) : false
  })
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
