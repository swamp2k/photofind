import type { LiteMediaRecord, LiteQualityTier } from './types'

export type LiteQualitySort = 'overall' | 'sharpness' | 'exposure' | 'resolution'
export type LiteQualityFilter = 'all' | LiteQualityTier | 'good-or-better' | 'okay-or-better'

export function sortByTechnicalQuality(items: LiteMediaRecord[], sort: LiteQualitySort = 'overall'): LiteMediaRecord[] {
  return [...items].sort((left, right) => {
    const primary = scoreFor(right, sort) - scoreFor(left, sort)
    if (primary !== 0) return primary
    const overall = scoreFor(right, 'overall') - scoreFor(left, 'overall')
    if (overall !== 0) return overall
    const sharpness = scoreFor(right, 'sharpness') - scoreFor(left, 'sharpness')
    if (sharpness !== 0) return sharpness
    return left.relativePath.localeCompare(right.relativePath)
  })
}

export function bestTechnicalCandidate(items: LiteMediaRecord[]): LiteMediaRecord | null {
  const analyzed = items.filter((item) => item.qualityStatus === 'ready' && typeof item.qualityScore === 'number')
  return analyzed.length > 0 ? sortByTechnicalQuality(analyzed, 'overall')[0] : null
}

export function filterMinimumQuality(items: LiteMediaRecord[], minimumScore: number): LiteMediaRecord[] {
  return items.filter((item) => item.qualityStatus === 'ready' && (item.qualityScore ?? -1) >= minimumScore)
}

export function filterQuality(items: LiteMediaRecord[], filter: LiteQualityFilter): LiteMediaRecord[] {
  const analyzed = items.filter((item) => item.qualityStatus === 'ready')
  if (filter === 'all') return analyzed
  if (filter === 'good-or-better') return analyzed.filter((item) => item.qualityTier === 'good' || item.qualityTier === 'great')
  if (filter === 'okay-or-better') return analyzed.filter((item) => item.qualityTier === 'okay' || item.qualityTier === 'good' || item.qualityTier === 'great')
  return analyzed.filter((item) => item.qualityTier === filter)
}

function scoreFor(item: LiteMediaRecord, sort: LiteQualitySort): number {
  if (item.qualityStatus !== 'ready') return -1
  if (sort === 'sharpness') return item.sharpnessScore ?? -1
  if (sort === 'exposure') return item.exposureScore ?? -1
  if (sort === 'resolution') return item.resolutionScore ?? -1
  return item.qualityScore ?? -1
}
