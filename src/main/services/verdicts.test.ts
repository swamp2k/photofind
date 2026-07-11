import { describe, expect, it } from 'vitest'
import type { BurstGroup, CaptureMetadata, QualityScore, ScannedFile } from '../../shared/types'
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

function analyze(paths: string[], qualities: QualityScore[], bursts: BurstGroup[] = []) {
  return suggestVerdicts(paths.map(file), paths.map(capture), qualities, bursts)
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
})
