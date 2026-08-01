import { describe, expect, it } from 'vitest'
import { decimalToDmsRational, formatExifDate, xmpSidecarName } from './exportMetadata'

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
})
