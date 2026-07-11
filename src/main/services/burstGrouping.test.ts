import { describe, expect, it } from 'vitest'
import type { CaptureMetadata, QualityScore } from '../../shared/types'
import { BURST_GAP_MS, groupBursts } from './burstGrouping'

function capture(path: string, timeMs: number | null, overrides: Partial<CaptureMetadata> = {}): CaptureMetadata {
  return {
    mediaPath: path,
    captureTimeMs: timeMs,
    source: 'exif',
    cameraModel: 'PixelTest',
    width: 320,
    height: 240,
    gps: null,
    status: 'ok',
    ...overrides
  }
}

function quality(path: string, sharpness: number | null): QualityScore {
  return {
    mediaPath: path,
    sharpness,
    exposureMean: 128,
    clippedShadowsPct: 0,
    clippedHighlightsPct: 0,
    status: sharpness === null ? 'failed' : 'ok'
  }
}

describe('groupBursts', () => {
  it('chains photos within the gap on the same camera and picks the sharpest', () => {
    const captures = [
      capture('/a.jpg', 1000),
      capture('/b.jpg', 2000),
      capture('/c.jpg', 3000),
      capture('/solo.jpg', 3000 + BURST_GAP_MS + 1)
    ]
    const qualities = [quality('/a.jpg', 50), quality('/b.jpg', 200), quality('/c.jpg', 100), quality('/solo.jpg', 300)]

    const { groups } = groupBursts(captures, qualities)

    expect(groups).toHaveLength(1)
    expect(groups[0].mediaPaths).toEqual(['/a.jpg', '/b.jpg', '/c.jpg'])
    expect(groups[0].pickPath).toBe('/b.jpg')
    expect(groups[0].startMs).toBe(1000)
    expect(groups[0].endMs).toBe(3000)
  })

  it('splits on camera change even within the time gap', () => {
    const captures = [
      capture('/a.jpg', 1000),
      capture('/b.jpg', 1500, { cameraModel: 'OtherCam' }),
      capture('/c.jpg', 2000)
    ]
    const { groups } = groupBursts(captures, [quality('/a.jpg', 1), quality('/b.jpg', 1), quality('/c.jpg', 1)])
    expect(groups).toHaveLength(0)
  })

  it('excludes mtime-sourced timestamps and logs it', () => {
    const captures = [
      capture('/a.jpg', 1000, { source: 'mtime' }),
      capture('/b.jpg', 1100, { source: 'mtime' }),
      capture('/c.jpg', 1200, { source: 'mtime' })
    ]
    const { groups, log } = groupBursts(captures, [])
    expect(groups).toHaveLength(0)
    expect(log[0].message).toContain('excluded from burst detection')
  })

  it('keeps the earliest frame on sharpness ties and produces a stable id', () => {
    const captures = [capture('/a.jpg', 1000), capture('/b.jpg', 1400)]
    const qualities = [quality('/a.jpg', 100), quality('/b.jpg', 100)]

    const first = groupBursts(captures, qualities)
    const second = groupBursts(captures, qualities)

    expect(first.groups[0].pickPath).toBe('/a.jpg')
    expect(first.groups[0].id).toBe(second.groups[0].id)
    expect(first.groups[0].id).toMatch(/^burst-[0-9a-f]{12}$/)
  })
})
