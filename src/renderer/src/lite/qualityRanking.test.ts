import { describe, expect, it } from 'vitest'
import { bestTechnicalCandidate, filterMinimumQuality, filterQuality, sortByTechnicalQuality } from './qualityRanking'
import type { LiteMediaRecord, LiteQualityTier } from './types'

function photo(path: string, score: number, sharpness = score, tier?: LiteQualityTier): LiteMediaRecord {
  return {
    id: path,
    libraryId: 'lib',
    relativePath: path,
    name: path,
    kind: 'image',
    sizeBytes: 1,
    lastModified: 1,
    mimeType: 'image/jpeg',
    qualityStatus: 'ready',
    qualityScore: score,
    qualityTier: tier,
    sharpnessScore: sharpness,
    exposureScore: score,
    resolutionScore: score
  }
}

describe('technical quality ranking', () => {
  it('picks the highest technical score as the group candidate', () => {
    expect(bestTechnicalCandidate([photo('a.jpg', 72), photo('b.jpg', 88), photo('c.jpg', 64)])?.id).toBe('b.jpg')
  })

  it('uses secondary signals and path ordering for deterministic ties', () => {
    const ranked = sortByTechnicalQuality([photo('b.jpg', 80, 70), photo('a.jpg', 80, 90)], 'overall')
    expect(ranked.map((item) => item.id)).toEqual(['a.jpg', 'b.jpg'])
  })

  it('filters out unanalyzed and below-threshold photos', () => {
    const pending: LiteMediaRecord = { ...photo('pending.jpg', 99), qualityStatus: undefined, qualityScore: undefined }
    expect(filterMinimumQuality([photo('great.jpg', 90), photo('weak.jpg', 40), pending], 67).map((item) => item.id)).toEqual(['great.jpg'])
  })

  it('supports exact quality tiers as well as minimum tiers', () => {
    const items = [
      photo('great.jpg', 90, 90, 'great'),
      photo('good.jpg', 75, 75, 'good'),
      photo('okay.jpg', 55, 55, 'okay'),
      photo('weak.jpg', 35, 35, 'weak')
    ]
    expect(filterQuality(items, 'good').map((item) => item.id)).toEqual(['good.jpg'])
    expect(filterQuality(items, 'good-or-better').map((item) => item.id)).toEqual(['great.jpg', 'good.jpg'])
    expect(filterQuality(items, 'okay-or-better').map((item) => item.id)).toEqual(['great.jpg', 'good.jpg', 'okay.jpg'])
  })
})
