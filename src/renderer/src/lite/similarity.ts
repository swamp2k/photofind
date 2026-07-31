import type { LiteMediaRecord, LiteSimilarityGroup } from './types'

const NEAR_DISTANCE = 8
const BURST_DISTANCE = 18
const BURST_WINDOW_MS = 12_000

export function hammingDistanceHex(left: string, right: string): number {
  if (left.length !== right.length || !/^[0-9a-f]+$/i.test(left) || !/^[0-9a-f]+$/i.test(right)) return Number.POSITIVE_INFINITY
  let distance = 0
  for (let index = 0; index < left.length; index += 1) {
    const xor = Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16)
    distance += NIBBLE_BITS[xor]
  }
  return distance
}

export function buildSimilarityGroups(items: LiteMediaRecord[]): LiteSimilarityGroup[] {
  const images = items.filter((item) => item.kind === 'image' && item.similarityStatus === 'ready')
  const exact = exactGroups(images)
  const visual = visualGroups(uniqueContentRepresentatives(images))
  return [...exact, ...visual].sort((a, b) => groupSortKey(a) - groupSortKey(b))
}

function exactGroups(items: LiteMediaRecord[]): LiteSimilarityGroup[] {
  const byHash = new Map<string, LiteMediaRecord[]>()
  for (const item of items) {
    if (!item.contentHash) continue
    const bucket = byHash.get(item.contentHash) ?? []
    bucket.push(item)
    byHash.set(item.contentHash, bucket)
  }

  const groups: LiteSimilarityGroup[] = []
  for (const [hash, members] of byHash) {
    if (members.length < 2) continue
    const ids = sortedIds(members)
    groups.push({
      id: `exact-${shortStableId(`${hash}:${ids.join('|')}`)}`,
      kind: 'exact',
      itemIds: ids,
      reason: `Exact duplicate — ${members.length} files have identical SHA-256 content.`
    })
  }
  return groups
}

function uniqueContentRepresentatives(items: LiteMediaRecord[]): LiteMediaRecord[] {
  const seen = new Set<string>()
  const output: LiteMediaRecord[] = []
  for (const item of items) {
    const key = item.contentHash ?? `id:${item.id}`
    if (seen.has(key)) continue
    seen.add(key)
    if (item.perceptualHash) output.push(item)
  }
  return output
}

function visualGroups(items: LiteMediaRecord[]): LiteSimilarityGroup[] {
  if (items.length < 2) return []
  const indexById = new Map(items.map((item, index) => [item.id, index]))
  const union = new UnionFind(items.length)
  const candidatePairs = new Set<string>()
  const buckets = new Map<string, string[]>()

  // A 64-bit dHash is stored as 16 hex nibbles. If two hashes differ by at
  // most eight bits, at least one nibble must remain identical, so nibble
  // buckets avoid an all-pairs scan without dropping ordinary near matches.
  for (const item of items) {
    const hash = item.perceptualHash!
    for (let nibble = 0; nibble < hash.length; nibble += 1) {
      const bucketKey = `${nibble}:${hash[nibble]}`
      const previous = buckets.get(bucketKey) ?? []
      for (const previousId of previous) candidatePairs.add(pairKey(previousId, item.id))
      previous.push(item.id)
      buckets.set(bucketKey, previous)
    }
  }

  const reliableByTime = items
    .filter((item) => item.captureTimeSource !== 'file' && typeof item.effectiveCaptureTime === 'number')
    .sort((a, b) => a.effectiveCaptureTime! - b.effectiveCaptureTime!)
  for (let left = 0; left < reliableByTime.length; left += 1) {
    for (let right = left + 1; right < reliableByTime.length; right += 1) {
      const delta = reliableByTime[right].effectiveCaptureTime! - reliableByTime[left].effectiveCaptureTime!
      if (delta > BURST_WINDOW_MS) break
      candidatePairs.add(pairKey(reliableByTime[left].id, reliableByTime[right].id))
    }
  }

  for (const encoded of candidatePairs) {
    const [leftId, rightId] = encoded.split('\u0000')
    const leftIndex = indexById.get(leftId)
    const rightIndex = indexById.get(rightId)
    if (leftIndex === undefined || rightIndex === undefined) continue
    const left = items[leftIndex]
    const right = items[rightIndex]
    const distance = hammingDistanceHex(left.perceptualHash!, right.perceptualHash!)
    const reliableBurst = isReliableBurstPair(left, right)
    if (distance <= NEAR_DISTANCE || (reliableBurst && distance <= BURST_DISTANCE)) union.join(leftIndex, rightIndex)
  }

  const clusters = new Map<number, LiteMediaRecord[]>()
  for (let index = 0; index < items.length; index += 1) {
    const root = union.root(index)
    const bucket = clusters.get(root) ?? []
    bucket.push(items[index])
    clusters.set(root, bucket)
  }

  const groups: LiteSimilarityGroup[] = []
  for (const members of clusters.values()) {
    if (members.length < 2) continue
    const reliableTimes = members.every((item) => item.captureTimeSource !== 'file' && typeof item.effectiveCaptureTime === 'number')
    const times = members.map((item) => item.effectiveCaptureTime ?? 0)
    const timeSpanMs = reliableTimes ? Math.max(...times) - Math.min(...times) : undefined
    const kind = timeSpanMs !== undefined && timeSpanMs <= BURST_WINDOW_MS ? 'burst' : 'similar'
    const maxPerceptualDistance = maximumDistance(members)
    const ids = sortedIds(members)
    groups.push({
      id: `${kind}-${shortStableId(ids.join('|'))}`,
      kind,
      itemIds: ids,
      reason: kind === 'burst'
        ? `Burst — ${members.length} visually related photos captured within ${formatSpan(timeSpanMs!)}.`
        : `Similar scene — ${members.length} photos are linked by perceptual similarity.`,
      maxPerceptualDistance,
      ...(timeSpanMs !== undefined ? { timeSpanMs } : {})
    })
  }
  return groups
}

function isReliableBurstPair(left: LiteMediaRecord, right: LiteMediaRecord): boolean {
  if (left.captureTimeSource === 'file' || right.captureTimeSource === 'file') return false
  if (typeof left.effectiveCaptureTime !== 'number' || typeof right.effectiveCaptureTime !== 'number') return false
  return Math.abs(left.effectiveCaptureTime - right.effectiveCaptureTime) <= BURST_WINDOW_MS
}

function maximumDistance(items: LiteMediaRecord[]): number {
  let maximum = 0
  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      const distance = hammingDistanceHex(items[left].perceptualHash!, items[right].perceptualHash!)
      if (Number.isFinite(distance)) maximum = Math.max(maximum, distance)
    }
  }
  return maximum
}

function sortedIds(items: LiteMediaRecord[]): string[] {
  return items.map((item) => item.id).sort()
}

function pairKey(left: string, right: string): string {
  return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`
}

function shortStableId(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function groupSortKey(group: LiteSimilarityGroup): number {
  if (group.kind === 'exact') return 0
  if (group.kind === 'burst') return 1
  return 2
}

function formatSpan(milliseconds: number): string {
  if (milliseconds < 1000) return `${milliseconds} ms`
  return `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 1 : 0)} s`
}

class UnionFind {
  private readonly parent: number[]

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index)
  }

  root(index: number): number {
    let current = index
    while (this.parent[current] !== current) {
      this.parent[current] = this.parent[this.parent[current]]
      current = this.parent[current]
    }
    return current
  }

  join(left: number, right: number): void {
    const leftRoot = this.root(left)
    const rightRoot = this.root(right)
    if (leftRoot !== rightRoot) this.parent[rightRoot] = leftRoot
  }
}

const NIBBLE_BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4]
