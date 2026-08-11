import { describe, expect, it } from 'vitest'
import { decimalToDmsRational, formatExifDate, prepareMetadataAwareExport, xmpSidecarName } from './exportMetadata'
import type { LiteMediaRecord } from './types'

function photo(overrides: Partial<LiteMediaRecord> = {}): LiteMediaRecord {
  return {
    id: 'library:photo.png',
    libraryId: 'library',
    relativePath: 'Trip/photo.png',
    name: 'photo.png',
    kind: 'image',
    sizeBytes: 3,
    lastModified: 100,
    mimeType: 'image/png',
    ...overrides
  }
}

describe('export metadata helpers', () => {
  it('formats EXIF dates using local wall-clock fields', () => {
    const value = new Date(2025, 6, 9, 14, 5, 7).getTime()
    expect(formatExifDate(value)).toBe('2025:07:09 14:05:07')
  })

  it('converts decimal coordinates to EXIF rational DMS', () => {
    expect(decimalToDmsRational(56.125)).toEqual([[56, 1], [7, 1], [300000, 10000]])
  })

  it('pairs XMP sidecars with the exported filename', () => {
    expect(xmpSidecarName('IMG_1234.JPG')).toBe('IMG_1234.xmp')
    expect(xmpSidecarName('README')).toBe('README.xmp')
  })

  it('creates an XMP fallback for a non-JPEG with reliable normalized metadata', async () => {
    const captureTime = new Date('2025-07-09T12:05:07.000Z').getTime()
    const modifiedTime = new Date('2025-07-10T08:00:00.000Z').getTime()
    const source = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' })
    const prepared = await prepareMetadataAwareExport(photo({
      lastModified: modifiedTime,
      effectiveCaptureTime: captureTime,
      captureTimeSource: 'takeout',
      latitude: 56.125,
      longitude: 10.25,
      locationSource: 'takeout'
    }), source, true)

    expect(prepared.metadataMode).toBe('sidecar')
    expect(prepared.blob).toBe(source)
    expect(prepared.sidecar).toBeDefined()
    const xmp = await prepared.sidecar!.text()
    expect(xmp).toContain('2025-07-09T12:05:07.000Z')
    expect(xmp).toContain('xmp:ModifyDate="2025-07-10T08:00:00.000Z"')
    expect(xmp).toContain('exif:GPSLatitude="56.125"')
    expect(xmp).toContain('exif:GPSLongitude="10.25"')
    expect(xmp).toContain('Trip/photo.png')
  })

  it('preserves file modification time as a modified-time hint without promoting it to capture time', async () => {
    const modifiedTime = new Date('2025-07-09T12:05:07.000Z').getTime()
    const source = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' })
    const prepared = await prepareMetadataAwareExport(photo({
      lastModified: modifiedTime,
      effectiveCaptureTime: modifiedTime,
      captureTimeSource: 'file'
    }), source, true)

    expect(prepared.metadataMode).toBe('sidecar')
    expect(prepared.sidecar).toBeDefined()
    const xmp = await prepared.sidecar!.text()
    expect(xmp).toContain('xmp:ModifyDate="2025-07-09T12:05:07.000Z"')
    expect(xmp).not.toContain('DateTimeOriginal')
    expect(xmp).not.toContain('xmp:CreateDate')
  })
})
