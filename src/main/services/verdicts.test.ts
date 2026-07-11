import { describe, expect, it } from 'vitest'
import type { BurstGroup, CaptureMetadata, PhotoFaces, QualityScore, ScannedFile } from '../../shared/types'
import { suggestVerdicts } from './verdicts'

function file(path: string): ScannedFile {
  return { path, name: path.slice(1), kind: 'image', sizeBytes: 1000, mtimeMs: 0 }
}

function capture(path: string): CaptureMetadata {
  return {
    mediaPath: path,
    captureTimeMs: 1000,
    source: 'exif',
    cameraModel: 'PixelTest',
    width: 320,
    height: 240,
    gps: null,
    status: 'ok'
  }
}

function quality(path: string, overrides: Partial<QualityScore> = {}): QualityScore {
  return {
    mediaPath: path,
    sharpness: 500,
    exposureMean: 128,
    clippedShadowsPct: 0,
    clippedHighlightsPct: 0,
    status: 'ok',
    ...overrides
  }
}

function faces(path: string, count: number): PhotoFaces {
  return {
    mediaPath: path,
    status: 'ok',
    count,
    faces: Array.from({ length: count }, () => ({ box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, score: 0.9 })),
    largestFraction: count > 0 ? 0.04 : 0
  }
}

function analyze(paths: string[], qualities: QualityScore[], bursts: BurstGroup[] = [], photoFaces: PhotoFaces[] = []) {
  return suggestVerdicts(paths.map(file), paths.map(capture), qualities, bursts, photoFaces)
}

describe('suggestVerdicts', () => {
  it('keeps sharp well-exposed photos', () => {
    const [analysis] = analyze(['/good.jpg'], [quality('/good.jpg')])
    expect(analysis.suggestedVerdict).toBe('keep')
    expect(analysis.reasons).toEqual(['sharp and well exposed'])
  })

  it('discards blurry photos with a visible reason', () => {
    const [analysis] = analyze(['/blur.jpg'], [quality('/blur.jpg', { sharpness: 5 })])
    expect(analysis.suggestedVerdict).toBe('discard')
    expect(analysis.reasons).toEqual(['blurry'])
  })

  it('marks soft or badly exposed photos as maybe with combined reasons', () => {
    const [analysis] = analyze(['/dark.jpg'], [quality('/dark.jpg', { sharpness: 60, exposureMean: 30, clippedShadowsPct: 0.6 })])
    expect(analysis.suggestedVerdict).toBe('maybe')
    expect(analysis.reasons).toEqual(['slightly soft focus', 'dark', 'crushed shadows'])
  })

  it('marks unanalyzable photos as maybe, never silently dropped', () => {
    const [analysis] = analyze(
      ['/corrupt.jpg'],
      [quality('/corrupt.jpg', { sharpness: null, exposureMean: null, status: 'failed', reason: 'decode failed' })]
    )
    expect(analysis.suggestedVerdict).toBe('maybe')
    expect(analysis.reasons[0]).toContain("couldn't analyze")
  })

  it('keeps the burst pick and discards its siblings', () => {
    const burst: BurstGroup = {
      id: 'burst-abc',
      mediaPaths: ['/b0.jpg', '/b1.jpg', '/b2.jpg'],
      pickPath: '/b1.jpg',
      startMs: 1000,
      endMs: 2000
    }
    const analyses = analyze(
      ['/b0.jpg', '/b1.jpg', '/b2.jpg'],
      [quality('/b0.jpg'), quality('/b1.jpg'), quality('/b2.jpg')],
      [burst]
    )

    expect(analyses.map((a) => a.suggestedVerdict)).toEqual(['discard', 'keep', 'discard'])
    expect(analyses[0].reasons).toEqual(['similar to best of burst of 3'])
    expect(analyses[1].reasons).toContain('best of burst of 3')
    expect(analyses[1].isBurstPick).toBe(true)
    expect(analyses[1].burstSize).toBe(3)
  })

  it('protects blurry photos with faces from discard', () => {
    const [analysis] = analyze(
      ['/grandma.jpg'],
      [quality('/grandma.jpg', { sharpness: 5 })],
      [],
      [faces('/grandma.jpg', 1)]
    )
    expect(analysis.suggestedVerdict).toBe('maybe')
    expect(analysis.reasons).toEqual(['blurry, but has faces', '1 face'])
  })

  it('still discards blurry photos without faces when detection ran', () => {
    const [analysis] = analyze(['/blur.jpg'], [quality('/blur.jpg', { sharpness: 5 })], [], [faces('/blur.jpg', 0)])
    expect(analysis.suggestedVerdict).toBe('discard')
    expect(analysis.reasons).toEqual(['blurry'])
  })

  it('does not let faces rescue burst siblings', () => {
    const burst: BurstGroup = {
      id: 'burst-x',
      mediaPaths: ['/b0.jpg', '/b1.jpg'],
      pickPath: '/b1.jpg',
      startMs: 1000,
      endMs: 1500
    }
    const analyses = analyze(
      ['/b0.jpg', '/b1.jpg'],
      [quality('/b0.jpg'), quality('/b1.jpg')],
      [burst],
      [faces('/b0.jpg', 2), faces('/b1.jpg', 2)]
    )
    expect(analyses[0].suggestedVerdict).toBe('discard')
    expect(analyses[0].reasons).toEqual(['similar to best of burst of 2'])
  })

  it('adds a face-count chip to keeps and maybes', () => {
    const [keep] = analyze(['/good.jpg'], [quality('/good.jpg')], [], [faces('/good.jpg', 2)])
    expect(keep.suggestedVerdict).toBe('keep')
    expect(keep.reasons).toContain('2 faces')

    const [maybe] = analyze(
      ['/soft.jpg'],
      [quality('/soft.jpg', { sharpness: 60 })],
      [],
      [faces('/soft.jpg', 1)]
    )
    expect(maybe.suggestedVerdict).toBe('maybe')
    expect(maybe.reasons).toEqual(['slightly soft focus', '1 face'])
  })

  it('behaves exactly like before when face detection was skipped', () => {
    const withoutFaces = analyze(['/blur.jpg'], [quality('/blur.jpg', { sharpness: 5 })])
    expect(withoutFaces[0].suggestedVerdict).toBe('discard')
    expect(withoutFaces[0].faces.status).toBe('skipped')
  })
})
