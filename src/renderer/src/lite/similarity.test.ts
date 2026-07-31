import { describe, expect, it } from 'vitest'
import { buildSimilarityGroups, hammingDistanceHex } from './similarity'
import type { LiteMediaRecord } from './types'

function photo(id: string, options: Partial<LiteMediaRecord> = {}): LiteMediaRecord {
  return {
    id,
    libraryId: 'lib',
    relativePath: `${id}.jpg`,
    name: `${id}.jpg`,
    kind: 'image',
    sizeBytes: 100,
    lastModified: 1_700_000_000_000,
    mimeType: 'image/jpeg',
    similarityStatus: 'ready',
    contentHash: `sha-${id}`,
    perceptualHash: '0000000000000000',
    ...options
  }
}

describe('hammingDistanceHex', () => {
  it('counts changed bits in hexadecimal hashes', () => {
    expect(hammingDistanceHex('0000', '0001')).toBe(1)
    expect(hammingDistanceHex('0000', '00ff')).toBe(8)
    expect(hammingDistanceHex('ffff', '0000')).toBe(16)
  })

  it('rejects incompatible hashes', () => {
    expect(hammingDistanceHex('00', '0000')).toBe(Number.POSITIVE_INFINITY)
    expect(hammingDistanceHex('zz', '00')).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('buildSimilarityGroups', () => {
  it('groups byte-identical files separately as exact duplicates', () => {
    const items = [
      photo('one', { contentHash: 'same', perceptualHash: '0000000000000000' }),
      photo('two', { contentHash: 'same', perceptualHash: '0000000000000000' }),
      photo('three', { contentHash: 'other', perceptualHash: 'ffffffffffffffff' })
    ]
    const exact = buildSimilarityGroups(items).filter((group) => group.kind === 'exact')
    expect(exact).toHaveLength(1)
    expect(exact[0].itemIds).toEqual(['one', 'two'])
  })

  it('classifies visually close photos with reliable close capture times as a burst', () => {
    const base = 1_700_000_000_000
    const items = [
      photo('one', { perceptualHash: '0000000000000000', effectiveCaptureTime: base, captureTimeSource: 'exif' }),
      photo('two', { perceptualHash: '000000000000000f', effectiveCaptureTime: base + 1800, captureTimeSource: 'exif' })
    ]
    const burst = buildSimilarityGroups(items).find((group) => group.kind === 'burst')
    expect(burst?.itemIds).toEqual(['one', 'two'])
    expect(burst?.timeSpanMs).toBe(1800)
  })

  it('groups close perceptual hashes without trusting file timestamps as bursts', () => {
    const items = [
      photo('one', { perceptualHash: '1111111111111111', effectiveCaptureTime: 1000, captureTimeSource: 'file' }),
      photo('two', { perceptualHash: '1111111111111110', effectiveCaptureTime: 1100, captureTimeSource: 'file' })
    ]
    const group = buildSimilarityGroups(items).find((candidate) => candidate.kind === 'similar')
    expect(group?.itemIds).toEqual(['one', 'two'])
    expect(buildSimilarityGroups(items).some((candidate) => candidate.kind === 'burst')).toBe(false)
  })

  it('does not group visually unrelated photos', () => {
    const items = [
      photo('one', { perceptualHash: '0000000000000000' }),
      photo('two', { perceptualHash: 'ffffffffffffffff' })
    ]
    expect(buildSimilarityGroups(items)).toHaveLength(0)
  })
})
