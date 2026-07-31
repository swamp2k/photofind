import { describe, expect, it } from 'vitest'
import { bestTechnicalCandidate, filterMinimumQuality, sortByTechnicalQuality } from './qualityRanking'
import type { LiteMediaRecord } from './types'

function photo(path: string, score: number, sharpness = score): LiteMediaRecord {
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
})
