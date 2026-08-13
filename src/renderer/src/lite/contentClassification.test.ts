import { describe, expect, it } from 'vitest'
import { classifyLikelyNonPhoto, setScreenshotOverride } from './contentClassification'
import type { LiteMediaRecord } from './types'

function photo(overrides: Partial<LiteMediaRecord> = {}): LiteMediaRecord {
  return {
    id: 'photo',
    libraryId: 'lib',
    relativePath: 'photo.jpg',
    name: 'photo.jpg',
    kind: 'image',
    sizeBytes: 1,
    lastModified: 1,
    mimeType: 'image/jpeg',
    qualityStatus: 'ready',
    width: 4000,
    height: 3000,
    captureTimeSource: 'exif',
    cameraMake: 'Google',
    cameraModel: 'Pixel',
    meanLuminance: 0.5,
    luminanceStdDev: 0.22,
    highlightClipFraction: 0.02,
    laplacianMeanAbs: 12,
    horizontalGradient: 8,
    verticalGradient: 8,
    ...overrides
  }
}

describe('likely non-photo classification', () => {
  it('trusts explicit screenshot filenames', () => {
    const result = classifyLikelyNonPhoto(photo({
      name: 'Screenshot_20260813-120000.png',
      relativePath: 'Google Photos/Screenshot_20260813-120000.png',
      mimeType: 'image/png',
      cameraMake: undefined,
      cameraModel: undefined
    }))
    expect(result?.kind).toBe('screenshot')
    expect(result?.confidence).toBeGreaterThan(0.95)
  })

  it('detects screen-shaped sharp images without camera metadata', () => {
    const result = classifyLikelyNonPhoto(photo({
      name: 'IMG_001.png',
      mimeType: 'image/png',
      width: 1080,
      height: 2400,
      captureTimeSource: 'takeout',
      cameraMake: undefined,
      cameraModel: undefined,
      laplacianMeanAbs: 9,
      horizontalGradient: 7,
      verticalGradient: 8
    }))
    expect(result?.kind).toBe('screenshot')
  })

  it('detects a bright text-heavy camera photo as a document', () => {
    const result = classifyLikelyNonPhoto(photo({
      name: 'PXL_20260813_120000.jpg',
      meanLuminance: 0.8,
      luminanceStdDev: 0.2,
      highlightClipFraction: 0.38,
      laplacianMeanAbs: 9,
      horizontalGradient: 7,
      verticalGradient: 6
    }))
    expect(result?.kind).toBe('document')
  })

  it('does not classify an ordinary camera photo', () => {
    expect(classifyLikelyNonPhoto(photo())).toBeNull()
  })

  it('keeps a bright outdoor camera photo out of the document bucket when white clipping is moderate', () => {
    expect(classifyLikelyNonPhoto(photo({
      meanLuminance: 0.76,
      luminanceStdDev: 0.2,
      highlightClipFraction: 0.2,
      laplacianMeanAbs: 10,
      horizontalGradient: 8,
      verticalGradient: 8
    }))).toBeNull()
  })

  it('lets a manual mark force an ordinary photo into the screenshot bucket', () => {
    const result = classifyLikelyNonPhoto(photo({ screenshotOverride: true }))
    expect(result).toEqual({ kind: 'screenshot', confidence: 1, reasons: ['Manually marked as screenshot'] })
  })

  it('lets Remove screenshot suppress automatic screenshot detection', () => {
    expect(classifyLikelyNonPhoto(photo({
      name: 'Screenshot_20260813-120000.png',
      mimeType: 'image/png',
      cameraMake: undefined,
      cameraModel: undefined,
      screenshotOverride: false
    }))).toBeNull()
  })

  it('persists the manual screenshot decision only on the selected image', () => {
    const items = [photo({ id: 'a' }), photo({ id: 'b' })]
    const result = setScreenshotOverride(items, 'b', true, 1234)
    expect(result.items[0].screenshotOverride).toBeUndefined()
    expect(result.items[1].screenshotOverride).toBe(true)
    expect(result.changed?.screenshotOverrideUpdatedAt).toBe(1234)
  })
})
