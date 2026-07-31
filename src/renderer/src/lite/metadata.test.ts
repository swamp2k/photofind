import { describe, expect, it } from 'vitest'
import { chooseCaptureTime, chooseLocation } from './metadata'

describe('metadata precedence', () => {
  it('prefers Takeout capture time, then EXIF, then file time', () => {
    expect(chooseCaptureTime(3000, 2000, 1000)).toEqual({ time: 3000, source: 'takeout' })
    expect(chooseCaptureTime(undefined, 2000, 1000)).toEqual({ time: 2000, source: 'exif' })
    expect(chooseCaptureTime(undefined, undefined, 1000)).toEqual({ time: 1000, source: 'file' })
  })

  it('prefers Takeout GPS and falls back to EXIF GPS', () => {
    expect(chooseLocation(
      { latitude: 56.2, longitude: 10.6 },
      { latitude: 55.7, longitude: 12.5 }
    )).toEqual({ latitude: 56.2, longitude: 10.6, source: 'takeout' })

    expect(chooseLocation(
      {},
      { latitude: 55.7, longitude: 12.5 }
    )).toEqual({ latitude: 55.7, longitude: 12.5, source: 'exif' })
  })

  it('rejects meaningless zero coordinates', () => {
    expect(chooseLocation({ latitude: 0, longitude: 0 }, {})).toBeUndefined()
  })
})
