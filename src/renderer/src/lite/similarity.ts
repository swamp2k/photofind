import type { LiteMediaRecord, LiteSimilarityGroup } from './types'

const NEAR_DISTANCE = 8
const BURST_DISTANCE = 18
const BURST_WINDOW_MS = 12_000
const LARGE_CLUSTER_EXACT_DISTANCE_LIMIT = 160
const LARGE_CLUSTER_ANCHORS = 20

interface SimilarityCache {
  items: LiteMediaRecord[]
  byId: Map<string, LiteMediaRecord>
  groups: LiteSimilarityGroup[]
}

let similarityCache: SimilarityCache | null = null

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
  const cached = cachedGroups(images)
  if (cached) return cached

  const groups = buildSimilarityGroupsCore(images)
  similarityCache = {
    items: images,
    byId: new Map(images.map((item) => [item.id, item])),
    groups
  }
  return groups
}

function cachedGroups(images: LiteMediaRecord[]): LiteSimilarityGroup[] | null {
  const cache = similarityCache
  if (!cache || images.length > cache.items.length) return null

  if (images.length === cache.items.length) {
    for (const item of images) {
      const previous = cache.byId.get(item.id)
      if (!previous || !sameSimilarityInput(previous, item)) return null
    }
    for (const item of images) if (cache.byId.get(item.id) !== item) cache.byId.set(item.id, item)
    cache.items = images
    return cache.groups
  }

  // A filtered active-image list follows the all-image call in LiteApp. Require
  // object identity here so unrelated callers cannot accidentally reuse a
  // cached superset that merely happens to contain the same ids.
  for (const item of images) if (cache.byId.get(item.id) !== item) return null
  return projectCachedGroups(cache.groups, images)
}

function sameSimilarityInput(left: LiteMediaRecord, right: LiteMediaRecord): boolean {
  return left.id === right.id
    && left.kind === right.kind
    && left.similarityStatus === right.similarityStatus
    && left.contentHash === right.contentHash
    && left.perceptualHash === right.perceptualHash
    && left.captureTimeSource === right.captureTimeSource
    && left.effectiveCaptureTime === right.effectiveCaptureTime
}

function projectCachedGroups(groups: LiteSimilarityGroup[], images: LiteMediaRecord[]): LiteSimilarityGroup[] {
  const byId = new Map(images.map((item) => [item.id, item]))
  const projected: LiteSimilarityGroup[] = []

  for (const group of groups) {
    const visibleIds = group.itemIds.filter((id) => byId.has(id))
    if (visibleIds.length < 2) continue
    if (visibleIds.length === group.itemIds.length) {
      projected.push(group)
      continue
    }

    if (group.kind === 'exact') {
      projected.push({
        ...group,
        itemIds: visibleIds,
        reason: `Exact duplicate — ${visibleIds.length} files have identical SHA-256 content.`
      })
      continue
    }

    const visibleItems = visibleIds.map((id) => byId.get(id)).filter(isMediaRecord)
    projected.push(...buildSimilarityGroupsCore(visibleItems).filter((candidate) => candidate.kind !== 'exact'))
  }

  return projected.sort((a, b) => groupSortKey(a) - groupSortKey(b))
}

function buildSimilarityGroupsCore(items: LiteMediaRecord[]): LiteSimilarityGroup[] {
  const exact = exactGroups(items)
  const visual = visualGroups(uniqueContentRepresentatives(items))
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
  const tree = new HammingBkTree()

  for (const item of items) {
    const hash = item.perceptualHash!
    for (const previousId of tree.search(hash, NEAR_DISTANCE)) {
      const leftIndex = indexById.get(previousId)
      const rightIndex = indexById.get(item.id)
      if (leftIndex !== undefined && rightIndex !== undefined) union.join(leftIndex, rightIndex)
    }
    tree.add(hash, item.id)
  }

  const reliableByTime = items
    .filter((item) => item.captureTimeSource !== 'file' && typeof item.effectiveCaptureTime === 'number')
    .sort((a, b) => a.effectiveCaptureTime! - b.effectiveCaptureTime!)
  let windowStart = 0
  for (let right = 0; right < reliableByTime.length; right += 1) {
    const rightItem = reliableByTime[right]
    while (windowStart < right && rightItem.effectiveCaptureTime! - reliableByTime[windowStart].effectiveCaptureTime! > BURST_WINDOW_MS) windowStart += 1
    for (let left = windowStart; left < right; left += 1) {
      const leftItem = reliableByTime[left]
      if (hammingDistanceHex(leftItem.perceptualHash!, rightItem.perceptualHash!) > BURST_DISTANCE) continue
      const leftIndex = indexById.get(leftItem.id)
      const rightIndex = indexById.get(rightItem.id)
      if (leftIndex !== undefined && rightIndex !== undefined) union.join(leftIndex, rightIndex)
    }
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

function maximumDistance(items: LiteMediaRecord[]): number {
  if (items.length <= LARGE_CLUSTER_EXACT_DISTANCE_LIMIT) return exactMaximumDistance(items)

  let maximum = 0
  const anchors = new Set<number>([0, items.length - 1])
  for (let index = 0; index < LARGE_CLUSTER_ANCHORS; index += 1) {
    anchors.add(Math.floor((index * (items.length - 1)) / Math.max(1, LARGE_CLUSTER_ANCHORS - 1)))
  }
  for (const anchorIndex of anchors) {
    const anchor = items[anchorIndex]
    for (const item of items) {
      const distance = hammingDistanceHex(anchor.perceptualHash!, item.perceptualHash!)
      if (Number.isFinite(distance)) maximum = Math.max(maximum, distance)
    }
  }
  return maximum
}

function exactMaximumDistance(items: LiteMediaRecord[]): number {
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

function isMediaRecord(item: LiteMediaRecord | undefined): item is LiteMediaRecord {
  return Boolean(item)
}

interface BkNode {
  hash: string
  ids: string[]
  children: Map<number, BkNode>
}

class HammingBkTree {
  private root: BkNode | null = null

  add(hash: string, id: string): void {
    if (!this.root) {
      this.root = { hash, ids: [id], children: new Map() }
      return
    }

    let node = this.root
    while (true) {
      const distance = hammingDistanceHex(hash, node.hash)
      if (!Number.isFinite(distance)) return
      if (distance === 0) {
        node.ids.push(id)
        return
      }
      const child = node.children.get(distance)
      if (child) {
        node = child
        continue
      }
      node.children.set(distance, { hash, ids: [id], children: new Map() })
      return
    }
  }

  search(hash: string, maximumDistance: number): string[] {
    if (!this.root) return []
    const matches: string[] = []
    const stack: BkNode[] = [this.root]
    while (stack.length > 0) {
      const node = stack.pop()!
      const distance = hammingDistanceHex(hash, node.hash)
      if (!Number.isFinite(distance)) continue
      if (distance <= maximumDistance) matches.push(...node.ids)
      const minimumChildDistance = Math.max(0, distance - maximumDistance)
      const maximumChildDistance = distance + maximumDistance
      for (const [edgeDistance, child] of node.children) {
        if (edgeDistance >= minimumChildDistance && edgeDistance <= maximumChildDistance) stack.push(child)
      }
    }
    return matches
  }
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
